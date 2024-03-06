/* eslint-disable @stylistic/max-len */
/* eslint-disable @stylistic/no-multi-spaces */
/* eslint-disable prefer-destructuring */
import {UnicodeTrie} from '../index.js';
import {UnicodeTrieBuilder} from '../builder.js';
import assert from 'node:assert';
import {gzipSync} from 'fflate';

describe('unicode trie', () => {
  it('set', () => {
    const trie = new UnicodeTrieBuilder(10, 666);
    trie.set(0x4567, 99);
    assert.equal(trie.get(0x4566), 10);
    assert.equal(trie.getString(0x4566), 10);
    assert.equal(trie.get(0x4567), 99);
    assert.equal(trie.get(-1), 666);
    assert.equal(trie.get(0x110000), 666);
  });

  it('set -> compacted trie', () => {
    const t = new UnicodeTrieBuilder(10, 666);
    t.set(0x4567, 99);

    const trie = t.freeze();
    assert.equal(trie.get(0x4566), 10);
    assert.equal(trie.get(0x4567), 99);
    assert.equal(trie.get(-1), 666);
    assert.equal(trie.get(0x110000), 666);
  });

  it('handles set errors', () => {
    const t = new UnicodeTrieBuilder(10, 666);
    assert.throws(() => t.set(-1, 12));
    assert.throws(() => t.set(0x110000, 12));
    t.freeze();
    assert.throws(() => t.set(1, 12));
  });

  it('setRange', () => {
    const trie = new UnicodeTrieBuilder(10, 666);
    trie.setRange(13, 6666, 7788, false);
    trie.setRange(6000, 7000, 9900, true);

    assert.equal(trie.get(12), 10);
    assert.equal(trie.get(13), 7788);
    assert.equal(trie.get(5999), 7788);
    assert.equal(trie.get(6000), 9900);
    assert.equal(trie.get(7000), 9900);
    assert.equal(trie.get(7001), 10);
    assert.equal(trie.get(0x110000), 666);
  });

  it('setRange -> compacted trie', () => {
    const t = new UnicodeTrieBuilder(10, 666);
    t.setRange(13, 6666, 7788, false);
    t.setRange(6000, 7000, 9900, true);

    const trie = t.freeze();
    assert.equal(trie.get(12), 10);
    assert.equal(trie.get(13), 7788);
    assert.equal(trie.get(5999), 7788);
    assert.equal(trie.get(6000), 9900);
    assert.equal(trie.get(7000), 9900);
    assert.equal(trie.get(7001), 10);
    assert.equal(trie.get(0x110000), 666);
  });

  it('handles setRange errors', () => {
    const t = new UnicodeTrieBuilder(10, 666);
    assert.throws(() => t.setRange(-1, 2, 12));
    assert.throws(() => t.setRange(2, -1, 12));
    assert.throws(() => t.setRange(2, 1, 12));
    assert.throws(() => t.setRange(0x110000, 0x110001, 12));
    assert.throws(() => t.setRange(1, 0x110001, 12));
    t.freeze();
    assert.throws(() => t.setRange(1, 2, 12));
  });

  it('toBuffer written in little-endian', () => {
    const trie = new UnicodeTrieBuilder();
    trie.set(0x4567, 99);

    const buf = trie.toBuffer();
    const bufferExpected = new Uint8Array([
      0, 72, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 83, 0, 0, 0,
    ]);
    assert.deepEqual(buf.subarray(0, 16), bufferExpected);
  });

  it('should work with compressed serialization format', () => {
    const t = new UnicodeTrieBuilder(10, 666);
    t.setRange(13, 6666, 7788, false);
    t.setRange(6000, 7000, 9900, true);

    const buf = t.toBuffer();
    const trie = new UnicodeTrie(buf);
    assert.equal(trie.get(12), 10);
    assert.equal(trie.getString(13), 7788);
    assert.equal(trie.get(5999), 7788);
    assert.equal(trie.get(6000), 9900);
    assert.equal(trie.get(7000), 9900);
    assert.equal(trie.get(7001), 10);
    assert.equal(trie.get(0x110000), 666);
  });

  it('should take a Uint8Array as serialization', () => {
    const t = new UnicodeTrieBuilder('XX', 'YY');
    t.setRange(13, 6666, 'ZZ');
    assert.equal(t.getString(13), 'ZZ');

    const buf = t.toBuffer();
    const ubuf = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const trie = new UnicodeTrie(ubuf);
    assert.equal(trie.getString(12), 'XX');
    assert.equal(trie.getString(13), 'ZZ');
    assert.equal(trie.getString(0x110000), 'YY');
  });

  it('should handle the old format without string map', () => {
    const t = new UnicodeTrieBuilder(1);
    const buf = t.toBuffer();
    const strings = gzipSync(JSON.stringify([]));
    const trie = new UnicodeTrie(buf.subarray(0, buf.length - strings.length));
    assert.equal(trie.get(13), 1);
  });

  it('handles out of memory errors', () => {
    const t = new UnicodeTrieBuilder(1);
    for (let i = 0; i < 0x110000; i++) {
      t.set(i, 2);
    }
    assert.equal(t.get(2), 2);
    const trie = t.freeze();
    assert.equal(trie.get(2), 2);
  });

  const rangeTests = [
    {
      ranges: [
        [0,        0,        0,      0],
        [0,        0x40,     0,      0],
        [0x40,     0xe7,     0x1234, 0],
        [0xe7,     0x3400,   0,      0],
        [0x3400,   0x9fa6,   0x6162, 0],
        [0x9fa6,   0xda9e,   0x3132, 0],
        [0xdada,   0xeeee,   0x87ff, 0],
        [0xeeee,   0x11111,  1,      0],
        [0x11111,  0x44444,  0x6162, 0],
        [0x44444,  0x60003,  0,      0],
        [0xf0003,  0xf0004,  0xf,    0],
        [0xf0004,  0xf0006,  0x10,   0],
        [0xf0006,  0xf0007,  0x11,   0],
        [0xf0007,  0xf0040,  0x12,   0],
        [0xf0040,  0x110000, 0,      0],
      ],

      check: [
        [0,        0],
        [0x40,     0],
        [0xe7,     0x1234],
        [0x3400,   0],
        [0x9fa6,   0x6162],
        [0xda9e,   0x3132],
        [0xdada,   0],
        [0xeeee,   0x87ff],
        [0x11111,  1],
        [0x44444,  0x6162],
        [0xf0003,  0],
        [0xf0004,  0xf],
        [0xf0006,  0x10],
        [0xf0007,  0x11],
        [0xf0040,  0x12],
        [0x110000, 0],
      ],
    },
    {
      // Set some interesting overlapping ranges
      ranges: [
        [0,        0,        0,      0],
        [0x21,     0x7f,     0x5555, 1],
        [0x2f800,  0x2fedc,  0x7a,   1],
        [0x72,     0xdd,     3,      1],
        [0xdd,     0xde,     4,      0],
        [0x201,    0x240,    6,      1],  // 3 consecutive blocks with the same pattern but
        [0x241,    0x280,    6,      1],  // Discontiguous value ranges, testing utrie2_enum()
        [0x281,    0x2c0,    6,      1],
        [0x2f987,  0x2fa98,  5,      1],
        [0x2f777,  0x2f883,  0,      1],
        [0x2f900,  0x2ffaa,  1,      0],
        [0x2ffaa,  0x2ffab,  2,      1],
        [0x2ffbb,  0x2ffc0,  7,      1],
      ],

      check: [
        [0,        0],
        [0x21,     0],
        [0x72,     0x5555],
        [0xdd,     3],
        [0xde,     4],
        [0x201,    0],
        [0x240,    6],
        [0x241,    0],
        [0x280,    6],
        [0x281,    0],
        [0x2c0,    6],
        [0x2f883,  0],
        [0x2f987,  0x7a],
        [0x2fa98,  5],
        [0x2fedc,  0x7a],
        [0x2ffaa,  1],
        [0x2ffab,  2],
        [0x2ffbb,  0],
        [0x2ffc0,  7],
        [0x110000, 0],
      ],
    },
    {
      // Use a non-zero initial value
      ranges: [
        [0,        0,        9, 0], // Non-zero initial value.
        [0x31,     0xa4,     1, 0],
        [0x3400,   0x6789,   2, 0],
        [0x8000,   0x89ab,   9, 1],
        [0x9000,   0xa000,   4, 1],
        [0xabcd,   0xbcde,   3, 1],
        [0x55555,  0x110000, 6, 1], // HighStart<U+ffff with non-initialValue
        [0xcccc,   0x55555,  6, 1],
      ],

      check: [
        [0,        9],  // Non-zero initialValue
        [0x31,     9],
        [0xa4,     1],
        [0x3400,   9],
        [0x6789,   2],
        [0x9000,   9],
        [0xa000,   4],
        [0xabcd,   9],
        [0xbcde,   3],
        [0xcccc,   9],
        [0x110000, 6],
      ],
    },
    {
      // Empty or single-value tries, testing highStart==0
      ranges: [
        [0,        0,        3, 0], // Only the element with the initial value.
      ],

      check: [
        [0,        3],
        [0x110000, 3],
      ],
    },
    {
      ranges: [
        [0,        0,        3,  0], // Initial value = 3
        [0,        0x110000, 5, 1],
      ],

      check: [
        [0,        3],
        [0x110000, 5],
      ],
    },
  ];

  it('should pass range tests', () => {
    const result = [];
    for (const test of rangeTests) {
      let initialValue = 0;
      let errorValue = 0x0bad;
      let i = 0;
      if (test.ranges[i][1] < 0) {
        errorValue = test.ranges[i][2];
        i++;
      }

      initialValue = test.ranges[i++][2];
      const trie = new UnicodeTrieBuilder(initialValue, errorValue);

      for (const range of test.ranges.slice(i)) {
        trie.setRange(range[0], range[1] - 1, range[2], range[3] !== 0);
      }

      const frozen = trie.freeze();

      let start = 0;
      result.push(test.check.map(check => {
        let end = 0;
        const result1 = [];
        for (end = check[0]; start < end; start++) {
          assert.equal(trie.get(start), check[1]);
          result1.push(assert.equal(frozen.get(start), check[1]));
        }
        return result1;
      }));
    }
  });

  it('generates a module', () => {
    const trie = new UnicodeTrieBuilder(0, 99);
    let m = trie.toModule();
    assert.match(m, /export const Trie/);
    m = trie.toModule({version: '1.0.0', date: 1, name: 'Foo', quot: "'", semi: ''});
    assert.match(m, /export const Foo/);
  });
});

// Unicode 15.1, fflate compressed
const EastAsianWidthNew = `\
AAAEAAAAAAD/////tQIAAB+LCAAC0uhlAgPtmj9IHzEUx8+fbam1FLoUCh1aaCl0cSoODgou
iougOAgu4iRO4iQiiDgoCoK4OYi66aabo5M4KKiToC7ioIPoIgjiN5qTeNz9LucvL8l57wcf
ksu/l7x7SV4uv+VSEKyCdbAJwucihUwy+wqsj2JwZLCtY3CWkHdRYdtX4FbG70F1dRB8AF/A
N/AD/Ab/QB0Q5f4jbJBxGzRLWW2WZHZATjhfu5V4lF7k7cp4P+KDsuxApM4wnkeVtHElPoW4
qCvis2VkMQxjlrj9mWEYhmEYhmHyxrw8Ry5YPKPrskLQJ37nDMMw9ih5uLcwDOP3/Wcl32mp
WJP3OBsIN2PWtfBeR0Xc2WyBHQ/Wwc+1T0x/ckNTkJ3Fj0EwV/XEKeI/a17mt+J5MpIWZRv5
NZAftuOCVg/kF3ptKfid6aHHfRP344//hSi4r3iiaaPnKHcJbjLa9EEOdHCXYAPBu/j095H0
WjyLcX5F+D2mjtDDL6SL8C/C8H8bdYjXy3SxZzfKuEqTTGtB2A66wLXS5x6lTqeUHT734Xkg
YQwhtxr2vweG0M6fmP5FfaARlBkDE2AGzKfIfws+YJ4RdrVUqnqGf/wr8k/MAJfo9tGVXkyX
NfGOknTjajWjHH/Wtinsj1JvVPVMjq9cW7pyytWn0IHar7iyWeZNUn0K+6G2yTSdpOnN9Hrm
Ul+25z+FzaTZti/7P5UsX/ydPPhbPvXBlU5MyjPRlm3btS3D5VzPy3nIRf9tjL/S9tLOPjb0
RpGvq2+dfIpx2/RpXM/71+g8qawPfn+S7Zn41kCxXvjwrYdC9mv8LVf7lYv57fM7dXmeoZRt
eu2n8hfz9C58PleZ3vts7tUuv/ln9Zd19l/dOWja93J5XnPh31Ptf76t8VTrsmn/3PSa8QCh
pJTR4EkAAB+LCAAC0uhlAgOLVvJT0lGKVIoFANHfAiwJAAAA`;

// Unicode 15.1, brotli-compressed
const EastAsianWidthOld = `\
AAAEAAAAAABQAgAAG99JMB6Jsa2CPeYryr2sfj99GygBKkJSf6IyVUDkyleXutZFVhEqYAoA
mJtrCtRv0ZrqSbitMeeLQiLoCh3hSuDeR5eMedj/slD10Y0R5iZ4+1ElV2MAzTz7ie96VxgM
BoNCIFAIDAKBQiFQGMxQI8EMpKCeSXI0syhuvoVSwY4LVLCPs8kIN7NFeMQnCP+GjwxUoAMj
WMEBrmOpccOHwuuBEDTEyKsphJvIPvu382JWAW5AzGWi59pyqq/JBkL7AAd6X0lutmWoXTK8
jsjwhoAZJtQw4MSUXienlP8GngeVYoXLhKPpn04ds0TKLcS+/L9zzLE4iZ7Sb4+w85UVDsyg
8c3APOBwzY6Po64NSwzM3jzeUfk3MNAepfJMo6KX2/yfptV2McXQ0c6pKaP7H0DHF9wCL2LA
VpoRrvPjw+JMsFaoUXSrAnX1xaZnLg2yNZtBrnpYAUeAA4EeR5pISE8+6yfznmtTJd4rBUSh
Ldz0MwSs1VWmteyH40rrGprQhSGL0EL41q07Vp3scFtX1QxMl6kCS6s6iRLFngIY4zQBuAm3
iesqIJrwHuAuIdQEG3mAAXfFAnIa/rPEfFOMA1xncd81oA89/JMZ3XP+FLBSKg3FUOLPLpUA
u53UYL1UHlPJOKMn20b8A2OVN5LoVDAfwnL8t/KhRIdlBmjyhnoCxO2HJTDqLN2BuIRqOWjz
3FoN8fSiXC6+0EnqSiK028ZajciD2V3UhLc0/o1FsII8qw3w1DgGjoNkBjrNMoxlu/GnvnVL
yNjUsU0v3smU+gsEgFsiTiIsIlkiXQM=`;

describe('compatibility', () => {
  it('reads the current format from base64', () => {
    const trie = UnicodeTrie.fromBase64(EastAsianWidthNew);
    assert.equal(trie.get(0x3000), 1);
  });
  it('reads the current format from base64 without Buffer', () => {
    const buf = globalThis.Buffer;
    globalThis.Buffer = {};
    const trie = UnicodeTrie.fromBase64(EastAsianWidthNew);
    assert.equal(trie.get(0x3000), 1);
    globalThis.Buffer = buf;
  });

  it('rejects old versions', () => {
    assert.throws(
      () => UnicodeTrie.fromBase64(EastAsianWidthOld),
      /Trie created with old version of @cto.af\/unicode-trie\./
    );
  });

  it('rejects malformed inputs', () => {
    assert.throws(() => new UnicodeTrie(new Uint8Array([
      0, 72, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255,
    ])), /RangeError: Invalid input length/);
  });
});
