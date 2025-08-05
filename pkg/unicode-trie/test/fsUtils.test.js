import * as fs from 'node:fs/promises';
import assert from 'node:assert';
import {fileURLToPath} from 'node:url';
import {touch} from '../fsUtils.js';

const touchFile = fileURLToPath(new URL('touchMe.txt', import.meta.url));

async function rmSafe(fn) {
  try {
    await fs.rm(fn, {force: true});
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw e;
    }
  }
}

describe('touch', () => {
  after(async () => {
    await rmSafe(touchFile);
  });

  it('ENOENT', async () => {
    assert.equal(await touch(touchFile), touchFile);
  });

  it('updates', async () => {
    await fs.writeFile(touchFile, Buffer.from(''));
    const d = new Date(0);
    await touch(touchFile, d);
    const s0 = await fs.stat(touchFile);
    assert.equal(s0.mtimeMs, 0);
    assert.equal(s0.atimeMs, 0);
    await touch(touchFile);
    const s1 = await fs.stat(touchFile);
    assert.notEqual(s1.mtime, 0);
    assert.notEqual(s1.atime, 0);
  });

  it('errors on unexpected', async () => {
    await assert.rejects(() => touch(touchFile, 'a'));
  });
});
