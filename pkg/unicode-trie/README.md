# @cto.af/unicode-trie

A data structure for fast Unicode character metadata lookup, ported from ICU
This version was copied from https://github.com/foliojs/unicode-trie and
modernized slightly.

## Background

When implementing many Unicode algorithms such as text segmentation,
normalization, bidi processing, etc., fast access to character metadata
is crucial to good performance.  There over a million code points in the
Unicode standard, many of which produce the same result when looked up,
so an array or hash table is not appropriate - those data structures are
fast but would require a lot of memory.  The data is generally
grouped in ranges, so you could do a binary search, but that is not
fast enough for some applications.

The [International Components for Unicode](http://site.icu-project.org) (ICU) project
came up with a data structure based on a [Trie](http://en.wikipedia.org/wiki/Trie) that provides fast access
to Unicode metadata.  The range data is precompiled to a serialized
and flattened trie, which is then used at runtime to lookup the necessary
data.  According to my own tests, this is generally at least 50% faster
than binary search, with not too much additional memory required.

## Installation

    npm install @cto.af/unicode-trie

## Building a Trie

Unicode Tries are generally precompiled from data in the Unicode database
for faster runtime performance.  To build a Unicode Trie, use the
`UnicodeTrieBuilder` class.

```js
import {writeFile} from '@cto.af/unicode-trie/file';
// This will download a local copy of LineBreak.txt, parse it, and add the
// first field to the trie for each range of characters.
await writeFile('LineBreak.txt', {
  // This is the default transform.
  transform(lineBreak) { return lineBreak };
});
```

You can also pass in string values to `set` and `setRange`:

```js
import {UnicodeTrieBuilder} from '@cto.af/unicode-trie/builder';
const t = new UnicodeTrieBuilder('XX', 'ER');
t.set(0x4567, 'FOO')
t.setRange(0x40, 0xe7, 'BAR')
```

The intent is that you might use a small number of strings, such as the names
of Unicode property values.  These strings are converted to small integers,
and the mapping is stored into the compressed trie.

## Using a precompiled Trie

Use the `@cto.af/unicode-trie-runtime' package to load the precompiled trie
into memory.

## License

MIT

---
[![Tests](https://github.com/cto-af/unicode-trie/actions/workflows/node.js.yml/badge.svg)](https://github.com/cto-af/unicode-trie/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/cto-af/unicode-trie/branch/main/graph/badge.svg?token=JVBOYR3GWY)](https://codecov.io/gh/cto-af/unicode-trie)
