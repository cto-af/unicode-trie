import {
  DATA_GRANULARITY,
  DATA_MASK,
  INDEX_1_OFFSET,
  INDEX_2_MASK,
  INDEX_SHIFT,
  LSCP_INDEX_2_OFFSET,
  OMITTED_BMP_INDEX_1_LENGTH,
  SHIFT_1,
  SHIFT_2,
} from './constants.js';
import {Buffer} from 'node:buffer';
import {brotliDecompressSync} from 'node:zlib';
import {swap32LE} from './swap.js';

export class UnicodeTrie {
  /**
   * @typedef {object} TrieValues
   * @prop {Int32Array} data
   * @prop {number} highStart
   * @prop {number} errorValue
   * @prop {string[]} [values]
   */

  /**
   * Createa a trie, either from compressed data or pre-parsed values.
   *
   * @param {Buffer|Uint8Array|TrieValues} data
   */
  constructor(data) {
    if (data instanceof Uint8Array) {
      // Read binary format
      let uncompressedLength = 0;
      if (Buffer.isBuffer(data)) {
        this.highStart = data.readUInt32LE(0);
        this.errorValue = data.readUInt32LE(4);
        uncompressedLength = data.readUInt32LE(8);
      } else {
        const view = new DataView(data.buffer);
        this.highStart = view.getUint32(0, true);
        this.errorValue = view.getUint32(4, true);
        uncompressedLength = view.getUint32(8, true);
      }

      // Don't swap UTF8-encoded text.
      const values = data.subarray(12 + uncompressedLength);

      /**
       * @type{string[]}
       */
      this.values = values.length ?
        JSON.parse(brotliDecompressSync(values).toString('utf8')) :
        [];

      // Inflate the actual trie data
      data = brotliDecompressSync(data.subarray(12, 12 + uncompressedLength));

      // Swap bytes from little-endian
      swap32LE(data);

      /**
       * @type {Int32Array}
       */
      this.data = new Int32Array(data.buffer);
    } else {
      // Pre-parsed data
      ({
        data: this.data,
        highStart: this.highStart,
        errorValue: this.errorValue,
        values: this.values = [],
      } = data);
    }
  }

  /**
   * Get the value associated with a codepoint, or the default value, or the
   * error value if codePoint is out of range.
   *
   * @param {number} codePoint
   * @returns {number}
   */
  get(codePoint) {
    let val = this.errorValue;
    if ((codePoint < 0) || (codePoint > 0x10ffff)) {
      val = this.errorValue;
    } else if (
      (codePoint < 0xd800) || ((codePoint > 0xdbff) && (codePoint <= 0xffff))
    ) {
      // Ordinary BMP code point, excluding leading surrogates.
      // BMP uses a single level lookup.  BMP index starts at offset 0 in the
      // index. data is stored in the index array itself.
      const index = (this.data[codePoint >> SHIFT_2] << INDEX_SHIFT) +
        (codePoint & DATA_MASK);
      val = this.data[index];
    } else if (codePoint <= 0xffff) {
      // Lead Surrogate Code Point.  A Separate index section is stored for
      // lead surrogate code units and code points.
      //   The main index has the code unit data.
      //   For this function, we need the code point data.
      const index = (
        this.data[LSCP_INDEX_2_OFFSET + ((codePoint - 0xd800) >> SHIFT_2)] <<
          INDEX_SHIFT
      ) + (codePoint & DATA_MASK);
      val = this.data[index];
    } else if (codePoint < this.highStart) {
      // Supplemental code point, use two-level lookup.
      let index = this.data[
        (INDEX_1_OFFSET - OMITTED_BMP_INDEX_1_LENGTH) + (codePoint >> SHIFT_1)
      ];
      index = this.data[index + ((codePoint >> SHIFT_2) & INDEX_2_MASK)];
      index = (index << INDEX_SHIFT) + (codePoint & DATA_MASK);
      val = this.data[index];
    } else {
      val = this.data[this.data.length - DATA_GRANULARITY];
    }

    return val;
  }

  /**
   * Get the value associated with the codePoint, stringified if possible.
   *
   * @param {number} codePoint
   * @returns {number|string}
   */
  getString(codePoint) {
    const val = this.get(codePoint);
    return this.values[val] ?? val;
  }
}
