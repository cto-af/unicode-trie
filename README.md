# unicode-trie
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
import {UnicodeTrieBuilder} from '@cto.af/unicode-trie/builder.js';
import fs from 'fs';

// create a trie
let t = new UnicodeTrieBuilder();

// optional parameters for default value, and error value
// if not provided, both are set to 0
t = new UnicodeTrieBuilder(10, 999);

// set individual values and ranges
t.set(0x4567, 99);
t.setRange(0x40, 0xe7, 0x1234);

// you can lookup a value if you like
t.get(0x4567); // => 99

// get a compiled trie (returns a UnicodeTrie object)
const trie = t.freeze();

// write compressed trie to a binary file
fs.writeFileSync('data.trie', t.toBuffer());
```

You can also pass in string values to `set` and `setRange`:

```js
t.set(0x4567, 'FOO')
t.setRange(0x40, 0xe7, 'BAR')
```

The intent is that you might use a small number of strings, such as the names
of Unicode property values.  These strings are converted to small integers,
and the mapping is stored into the compressed trie.

## Using a precompiled Trie

Once you've built a precompiled trie, you can load it into the
`UnicodeTrie` class, which is a readonly representation of the
trie.  From there, you can lookup values.

```js
import {UnicodeTrie} from '@cto.af/unicode-trie';
import fs from 'fs'

// load serialized trie from binary file
const data = fs.readFileSync('data.trie');
const trie = new UnicodeTrie(data);

// lookup a value
trie.get(0x4567); // => 99 or 'FOO' (if a string was stored)
```

## License

MIT
