import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {UCD, isSuccess} from '@cto.af/ucd';
import {UnicodeTrieBuilder} from './builder.js';
import {strict as assert} from 'node:assert';
import {errCode} from '@cto.af/utils';
import {fileURLToPath} from 'node:url';
import {getLog} from '@cto.af/log';
import {touch} from './fsUtils.js';

const DAYS30 = 30 * 24 * 60 * 60 * 1000;

/**
 * @typedef {import('@cto.af/ucd').Field} Field
 */

/**
 * @typedef {import('@cto.af/ucd').Range} Range
 */

/**
 * @typedef {import('@cto.af/ucd').Points} Points
 */

/**
 * Convert a set of fields into a trie entry.
 *
 * @typedef {(...fields: Field[]) => number | string | null} FieldTransform
 */

/**
 * Modify a builder directly.
 *
 * @typedef {(builder: UnicodeTrieBuilder) =>
 *   number | string | null} BuilderTransform
 */

/**
 * BuilderTransform if name is not specified, otherwise FieldTransform
 * @typedef {BuilderTransform|FieldTransform} TrieTransform
 */

/**
 * @typedef {object} DirOptions
 * @prop {UnicodeTrieBuilder} [builder] If needed, a custom builder instance.
 * @prop {string} [className] Name of the exported class in the module file.
 *   Defaults to the name of the (first) database file without the ".txt"
 *   suffix.
 * @prop {string|URL} [dir] Directory to read from/write to.  Defaults to
 *   cacheDir, then CWD.
 * @prop {number|string} [errorValue='ER'] Error value for out of range
 *   inputs, if no builder specified.
 * @prop {number} [frequency=DAYS30] How often to check for updates, in ms.
 * @prop {number|string} [initialValue='XX'] Default value in builder, if no
 *   builder specified.
 * @prop {FieldTransform} [transform] Transform fields from UCD into trie
 *   entries.  If not specified, uses the first field.
 * @prop {string} [out] Output file.  Defaults to the name of the (first)
 *   database, minus ".txt", plus ".js".
 * @prop {UCD} [ucd] If needed, a custom UCD instance.
 * @prop {boolean} [verbose] Verbose logging.
 */

/**
 * @typedef {DirOptions &
 *   import('./builder.js').ModuleOptions &
 *   import('@cto.af/ucd').UCDoptions &
 *   import('@cto.af/ucd').FetchOptions} FileOptions
 */

/**
 * @typedef {object} FieldTransformer
 * @prop {string} name File name from the UCD database, including '.txt'.
 * @prop {FieldTransform} [transform] If not specified, falls back on transform
 *   in options, then the default.
 */
/**
 * @typedef {object} NullTransformer
 * @prop {BuilderTransform} transform Transform with no name, allowing modifying
 *   the builder directly.
 */
/**
 * @typedef {FieldTransformer|NullTransformer} FileTransformer
 */

/**
 * Create filename for the given options.
 *
 * @param {string} name
 * @param {FileOptions} opts
 * @returns {string}
 */
function fileName(name, opts) {
  let dir = opts?.dir ?? opts?.cacheDir ?? process.cwd();
  if (dir instanceof URL) {
    dir = fileURLToPath(dir);
  } else if (typeof dir !== 'string') {
    dir = dir.toString('utf8');
  }
  return path.join(dir, `${name}.js`);
}

/**
 * Is the given field a range of points?
 *
 * @param {Field} f
 * @returns {f is Range}
 */
function isRange(f) {
  return (f != null) && (typeof f === 'object') && Object.hasOwn(f, 'range');
}

/**
 * Is the given field a list of 1+ points?
 *
 * @param {Field} f
 * @returns {f is Points}
 */
function isPoints(f) {
  return (f != null) && (typeof f === 'object') &&
    Object.hasOwn(f, 'points');
}

/**
 * Is this a FieldTransformer?
 * @param {FileTransformer} f
 * @returns {f is FieldTransformer}
 */
function isFieldTransformer(f) {
  return Object.prototype.hasOwnProperty.call(f, 'name');
}

/**
 * Default transform.  Return the first value, if it's a string.
 *
 * @param {Field} firstValue
 * @returns {string|null}
 */
function defaultTransform(firstValue) {
  switch (typeof firstValue) {
    case 'string':
      return firstValue;
    default:
      return null;
  }
}

/**
 *
 * @param {string|FileTransformer[]} db File name from the UCD database,
 *   including '.txt', or list of transforms.
 * @param {FileOptions} [opts]
 * @returns {Promise<string>}
 */
export async function writeFile(db, opts = {}) {
  const log = getLog({logLevel: opts.verbose ? 1 : 0});

  if (typeof db === 'string') {
    db = [{name: db}];
  }
  if (!Array.isArray(db) || db.length < 1) {
    throw new TypeError('Invalid db type');
  }
  const firstName = db.find(x => isFieldTransformer(x))?.name ?? 'trie';
  const baseName = path.parse(firstName).name;
  const {className, errorValue, frequency, initialValue, out, transform} = {
    className: baseName,
    errorValue: 'ER',
    frequency: DAYS30,
    initialValue: 'XX',
    out: fileName(baseName, opts),
    transform: defaultTransform,
    ...opts,
  };

  let {builder, ucd} = opts;
  if (!builder) {
    builder = new UnicodeTrieBuilder(initialValue, errorValue);
  }
  const now = new Date();

  let etag = Object.create(null);
  let lastModified = Object.create(null);
  let alwaysParse = false;

  /** @type {number[]|undefined} */
  let version = undefined;

  /** @type {Date|undefined} */
  let inputFileDate = undefined;

  try {
    log.debug('Checking stats for "%s"', out);
    const stats = await fs.stat(out);
    if ((stats.mtimeMs + frequency) > now.getTime()) {
      log.debug('Last modified %s, no need to run.', new Date(stats.mtimeMs).toISOString());
      // No need to run.
      return out;
    }
    const old = await import(out);
    ({etag, lastModified} = old);
    if (typeof etag !== 'object') {
      etag = Object.create(null);
    }
    if (typeof lastModified !== 'object') {
      lastModified = Object.create(null);
    }
  } catch (e) {
    // If file doesn't exist, we have to run.
    if (!errCode(e, 'ENOENT')) {
      throw e;
    }
    log.debug('Output file does not exist.  Creating.', out);
    alwaysParse = true;
  }

  if (!ucd) {
    ucd = await UCD.create({...opts, alwaysParse});
  }

  for (const file of db) {
    if (!isFieldTransformer(file)) {
      file.transform?.(builder);
      continue;
    }
    const {name, transform: xform} = file;
    const ucdFile = await ucd.parse(name, {
      ...opts,
      etag: etag[name],
      lastModified: lastModified[name],
    });
    log.debug('HTTP Status %d', ucdFile.status);
    if (ucdFile.status === 304) {
      // OK to assume all database files are updated at once.
      log.debug('Touching %s to remember last time we checked', out);
      return touch(out, now);
    }

    // Would have thrown an error in ucd if not 200 or 304, and 304 is handled
    // above.
    assert(isSuccess(ucdFile));
    etag[name] = ucdFile.etag;
    lastModified[name] = ucdFile.lastModified;

    if (!version) {
      ({version, date: inputFileDate} = ucdFile.parsed);
    }

    const yform = xform ?? transform;
    for (const {fields} of ucdFile.parsed.entries) {
      const [first, ...vals] = fields;
      if (typeof first === 'string') {
        throw new Error('First field not codepoints');
      }
      const t = yform(...vals);
      if (t == null || first == null) {
        continue;
      }
      if (isRange(first)) {
        builder.setRange(first.range[0], first.range[1], t, true);
      } else if (isPoints(first)) {
        for (const p of first.points) {
          builder.set(p, t);
        }
      } else {
        throw new Error(`Invalid codepoints: ${JSON.stringify(first)}`);
      }
    }
  }
  log.debug('Writing "%s"', out);
  await fs.writeFile(
    out,
    builder.toModule({
      ...opts,
      name: className,
      etag,
      lastModified,
      version,
      date: inputFileDate,
    }),
    'utf8'
  );
  return out;
}
