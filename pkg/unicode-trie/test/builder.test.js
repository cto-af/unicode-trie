import {UnicodeTrieBuilder} from '../builder.js';
import assert from 'node:assert';
import fs from 'node:fs';

const temp = new URL(`./test-module-builder-${process.pid}.js`, import.meta.url);

describe('unicode trie builder', () => {
  after(() => {
    try {
      fs.rmSync(temp);
    } catch (e) {
      if (e.code !== 'ENOENT') {
        throw e;
      }
    }
  });

  it('generates a module', async () => {
    const trie = new UnicodeTrieBuilder(0, 99);
    const lastModified = {'Foo.txt': new Date().toUTCString()};
    const etag = {'Foo.txt': 'MyEtag'};
    let m = trie.toModule({etag, lastModified});
    assert.match(m, /export const Trie/);
    m = trie.toModule({
      version: '1.0.0',
      date: 1,
      name: 'Foo',
      quot: "'",
      semi: ';',
      etag,
      lastModified,
    });
    assert.match(m, /export const Foo/);
    fs.writeFileSync(temp, m, 'utf8');
    const mod = await import(temp);
    assert(mod);
    assert.deepEqual(mod.etag, etag);
    assert.deepEqual(mod.lastModified, lastModified);
    assert.deepEqual(mod.inputFileDate, new Date(1));
  });
});
