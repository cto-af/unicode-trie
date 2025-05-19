import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {UCD} from '@cto.af/ucd';
import {UnicodeTrieBuilder} from './builder.js';
import {errCode} from '@cto.af/utils';
import {getLog} from '@cto.af/log';

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
 * @typedef {(...fields: Field[]) => number | string | null} TrieTransform
 */

/**
 * @typedef {object} DirOptions
 * @prop {string} [dir] Directory to read from/write to.
 * @prop {number} [frequency=DAYS30] How often to check for updates, in ms.
 * @prop {TrieTransform} [transform] Transform fields from UCD into trie
 *   entries.  If not specified, uses the first field.
 * @prop {UnicodeTrieBuilder} [builder] If needed, a custom builder instance.
 * @prop {number|string} [initialValue='XX'] Default value in builder, if no
 *   builder specified.
 * @prop {number|string} [errorValue='ER'] Error value for out of range
 *   inputs, if no builder specified.
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
 * Create filename for the given options.
 *
 * @param {string|undefined} name
 * @param {FileOptions} opts
 * @returns {string}
 */
function fileName(name, opts) {
  return path.join(opts?.dir ?? process.cwd(), `${name ?? 'trie'}.js`);
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
 *
 * @param {string} dbName File name from the UCD database, including '.txt'.
 * @param {FileOptions} [opts]
 * @returns {Promise<void>}
 */
export async function writeFile(dbName, opts = {}) {
  const log = getLog({logLevel: opts.verbose ? 1 : 0});
  const {errorValue, frequency, initialValue} = {
    errorValue: 'ER',
    frequency: DAYS30,
    initialValue: 'XX',
    ...opts,
  };
  const {name} = path.parse(dbName);
  const fn = fileName(name, opts);
  const now = new Date();
  let etag = undefined;
  let lastModified = undefined;
  try {
    log.debug('Checking stats for "%s"', fn);
    const stats = await fs.stat(fn);
    if ((stats.mtimeMs + frequency) > now.getTime()) {
      log.debug('Last modified %s, no need to run.', new Date(stats.mtimeMs).toISOString());
      // No need to run.
      return;
    }
    const old = await import(fn);
    ({etag, lastModified} = old);
    log.debug('Retrieved from old file: %o', {etag, lastModified});
  } catch (e) {
    // If file doesn't exist, we have to run.
    if (!errCode(e, 'ENOENT')) {
      throw e;
    }
    log.debug('Output file does not exist.  Creating.');
  }

  let {builder, transform, ucd} = opts;
  if (!builder) {
    builder = new UnicodeTrieBuilder(initialValue, errorValue);
  }
  if (!ucd) {
    ucd = await UCD.create({
      ...opts,
    });
  }

  const ucdFile = await ucd.parse(dbName, {
    ...opts,
    etag,
    lastModified,
  });
  log.debug('HTTP Status %d', ucdFile.status);
  if (ucdFile.status === 304) {
    log.debug('Touching %s to remember last time we checked', fn);
    await fs.utimes(fn, now, now);
    return;
  }
  if (!ucdFile.parsed) {
    throw new Error('Unexpected state, no parsed entries');
  }

  if (!transform) {
    transform = first => first?.toString() ?? null;
  }

  for (const {fields} of ucdFile.parsed.entries) {
    const [first, ...vals] = fields;
    if (typeof first === 'string') {
      throw new Error('First field not codepoints');
    }
    const t = transform(...vals);
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

  log.debug('Writing "%s"', fn);
  await fs.writeFile(
    fn,
    builder.toModule({
      ...opts,
      name,
      etag: ucdFile.etag,
      lastModified: ucdFile.lastModified,
    }),
    'utf8'
  );
}
