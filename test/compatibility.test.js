import {UnicodeTrie} from '../index.js';
import assert from 'node:assert';

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
