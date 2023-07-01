import {Buffer} from 'buffer';
import assert from 'assert';
import {swap32} from '../swap.js';

it('swaps 32bit words', () => {
  const buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
  swap32(buf);
  assert.equal(buf.toString('hex'), '0403020108070605');
});
