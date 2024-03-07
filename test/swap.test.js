import assert from 'node:assert';
import {swap32} from '../swap.js';

it('swaps 32bit words', () => {
  const buf = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  swap32(buf);
  assert.deepEqual(buf, new Uint8Array([4, 3, 2, 1, 8, 7, 6, 5]));
});
