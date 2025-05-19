#!/usr/bin/env node

import {UnicodeTrieBuilder} from '@cto.af/unicode-trie/builder';
import {writeFile} from '@cto.af/unicode-trie/file';

// Default value is "XX".  Add a new property value "ER" for errors.
const builder = new UnicodeTrieBuilder('XX', 'ER');

// Set defaults
builder.setRange(0x20000, 0x2FFFD, 'ID');
builder.setRange(0x30000, 0x3FFFD, 'ID');
builder.setRange(0x1F000, 0x1FAFF, 'ID');
builder.setRange(0x1FC00, 0x1FFFD, 'ID');
builder.setRange(0x20A0, 0x20CF, 'PR');

const opts = {
  cacheDir: new URL('./', import.meta.url),
  builder,
  quot: "'",
  verbose: true,
  frequency: 10000,
};

await writeFile('LineBreak.txt', opts);
