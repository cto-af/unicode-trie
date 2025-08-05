import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import {writeFile} from '../file.js';

const temp = new URL(`./test-module-file-${process.pid}.js`, import.meta.url);
const dirURL = new URL('./', import.meta.url);
const dirPath = fileURLToPath(dirURL);

async function rmSafe(fn) {
  try {
    await fs.rm(fn);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
}

describe('writeFile', () => {
  after(async () => {
    await rmSafe(temp);
  });

  it('db as string', async () => {
    const out = await writeFile('LineBreak.txt', {
      cacheDir: dirPath,
      out: temp,
      verbose: true,
    });
    const lb = await import(out);
    assert(lb);
  });

  it('db as array', async () => {
    const out = await writeFile([{name: 'LineBreak.txt'}], {
      cacheDir: dirPath,
      dir: dirURL,
      out: temp,
      frequency: 0,
    });
    assert(out instanceof URL);

    const out2 = await writeFile([{name: 'LineBreak.txt'}], {
      cacheDir: dirPath,
      dir: dirURL,
      out: temp,
      frequency: Infinity,
    });
    assert(out2 instanceof URL);
  });

  it('handles empty inputs', async () => {
    assert.rejects(() => writeFile('test.txt', {
      cacheDir: dirPath,
      dir: Buffer.from(dirPath),
      out: temp,
      CI: false,
      frequency: 0,
    }));
    await rmSafe(temp);
    const out = await writeFile('test.txt', {
      cacheDir: dirPath,
      dir: Buffer.from(dirPath),
      out: temp,
      CI: true,
    });
    assert(out instanceof URL);
  });

  it('handles non-codepoint inputs', async () => {
    await rmSafe(temp);
    await assert.rejects(() => writeFile('testBad.txt', {
      cacheDir: dirPath,
      dir: Buffer.from(dirPath),
      out: temp,
      CI: true,
    }), /First field not codepoints/);
  });

  it('allows direct modification of the builder', async () => {
    await rmSafe(temp);
    let count = 0;
    await writeFile([{transform(b) {
      assert.equal(b.constructor.name, 'UnicodeTrieBuilder');
      count++;
    }}], {
      out: temp,
    });
    assert.equal(count, 1);
  });

  it('handles bad inputs', async () => {
    await assert.rejects(() => writeFile(0));
    await assert.rejects(() => writeFile([]));
  });
});
