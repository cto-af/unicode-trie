/* eslint-disable max-params */
import {
  DATA_BLOCK_LENGTH,
  DATA_GRANULARITY,
  DATA_MASK,
  INDEX_1_OFFSET,
  INDEX_2_BLOCK_LENGTH,
  INDEX_2_BMP_LENGTH,
  INDEX_2_MASK,
  INDEX_SHIFT,
  LSCP_INDEX_2_LENGTH,
  LSCP_INDEX_2_OFFSET,
  MAX_INDEX_1_LENGTH,
  OMITTED_BMP_INDEX_1_LENGTH,
  SHIFT_1,
  SHIFT_1_2,
  SHIFT_2,
  UTF8_2B_INDEX_2_LENGTH,
} from './constants.js';
import {UnicodeTrie} from './index.js';
import {gzipSync} from 'fflate';
import {swap32LE} from './swap.js';

// Number of code points per index-1 table entry. 2048=0x800
const CP_PER_INDEX_1_ENTRY = 1 << SHIFT_1;

// The BMP part of the index-2 table is fixed and linear and starts at offset 0.
// Length=2048=0x800=0x10000>>SHIFT_2.
const INDEX_2_OFFSET = 0;

// The index-1 table, only used for supplementary code points, at offset
// 2112=0x840. Variable length, for code points up to highStart, where the
// last single-value range starts. Maximum length 512=0x200=0x100000>>SHIFT_1.
// (For 0x100000 supplementary code points U+10000..U+10ffff.)
//
// The part of the index-2 table for supplementary code points starts after
// this index-1 table.
//
// Both the index-1 table and the following part of the index-2 table are
// omitted completely if there is only BMP data.

// The illegal-UTF-8 data block follows the ASCII block, at offset 128=0x80.
// Used with linear access for single bytes 0..0xbf for simple error handling.
// Length 64=0x40, not DATA_BLOCK_LENGTH.
const BAD_UTF8_DATA_OFFSET = 0x80;

// The start of non-linear-ASCII data blocks, at offset 192=0xc0.
// !!!!
const DATA_START_OFFSET = 0xc0;

// The null data block.
// Length 64=0x40 even if DATA_BLOCK_LENGTH is smaller,
// to work with 6-bit trail bytes from 2-byte UTF-8.
const DATA_NULL_OFFSET = DATA_START_OFFSET;

// The start of allocated data blocks.
const NEW_DATA_START_OFFSET = DATA_NULL_OFFSET + 0x40;

// The start of data blocks for U+0800 and above.
// Below, compaction uses a block length of 64 for 2-byte UTF-8.
// From here on, compaction uses DATA_BLOCK_LENGTH.
// Data values for 0x780 code points beyond ASCII.
const DATA_0800_OFFSET = NEW_DATA_START_OFFSET + 0x780;

// Start with allocation of 16k data entries. */
const INITIAL_DATA_LENGTH = 1 << 14;

// Grow about 8x each time.
const MEDIUM_DATA_LENGTH = 1 << 17;

// Maximum length of the runtime data array.
// Limited by 16-bit index values that are left-shifted by INDEX_SHIFT,
// and by uint16_t UTrie2Header.shiftedDataLength.
const MAX_DATA_LENGTH_RUNTIME = 0xffff << INDEX_SHIFT;

const INDEX_1_LENGTH = 0x110000 >> SHIFT_1;

// Maximum length of the build-time data array. One entry per 0x110000 code
// points, plus the illegal-UTF-8 block and the null block, plus values for
// the 0x400 surrogate code units.
const MAX_DATA_LENGTH_BUILDTIME = 0x110000 + 0x40 + 0x40 + 0x400;

// At build time, leave a gap in the index-2 table,
// at least as long as the maximum lengths of the 2-byte UTF-8 index-2 table
// and the supplementary index-1 table.
// Round up to INDEX_2_BLOCK_LENGTH for proper compacting.
const INDEX_GAP_OFFSET = INDEX_2_BMP_LENGTH;
const INDEX_GAP_LENGTH =
  ((UTF8_2B_INDEX_2_LENGTH + MAX_INDEX_1_LENGTH) + INDEX_2_MASK) &
    ~INDEX_2_MASK;

// Maximum length of the build-time index-2 array.
// Maximum number of Unicode code points (0x110000) shifted right by SHIFT_2,
// plus the part of the index-2 table for lead surrogate code points,
// plus the build-time index gap,
// plus the null index-2 block.)
const MAX_INDEX_2_LENGTH =
  (0x110000 >> SHIFT_2) +
    LSCP_INDEX_2_LENGTH +
    INDEX_GAP_LENGTH +
    INDEX_2_BLOCK_LENGTH;

// The null index-2 block, following the gap in the index-2 table.
const INDEX_2_NULL_OFFSET = INDEX_GAP_OFFSET + INDEX_GAP_LENGTH;

// The start of allocated index-2 blocks.
const INDEX_2_START_OFFSET = INDEX_2_NULL_OFFSET + INDEX_2_BLOCK_LENGTH;

// Maximum length of the runtime index array. Limited by its own 16-bit index
// values, and by uint16_t UTrie2Header.indexLength. (The actual maximum
// length is lower,
// (0x110000>>SHIFT_2)+UTF8_2B_INDEX_2_LENGTH+MAX_INDEX_1_LENGTH.)
const MAX_INDEX_LENGTH = 0xffff;

/**
 * @param {Uint32Array|Int32Array} a
 * @param {number} s
 * @param {number} t
 * @param {number} length
 * @returns {boolean}
 * @private
 */
function equal_int(a, s, t, length) {
  for (let i = 0; i < length; i++) {
    if (a[s + i] !== a[t + i]) {
      return false;
    }
  }

  return true;
}

/**
 * @param {Uint8Array} buffer
 * @returns {string}
 * @private
 */
function uint8ArrayToBase64(buffer) {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

// Shared TextEncoder instance.
const ENCODER = new TextEncoder();

export class UnicodeTrieBuilder {
  /**
   * Create a builder.  Ideally this is called from tooling at build time,
   * and is not included in your runtime.  It is optimized for generating
   * small output that can be looked up fast, once frozen.
   *
   * @param {number|string} initialValue Default value if none other specified.
   * @param {number|string} errorValue Error value for out of range inputs.
   * @param {string[]} [values=[]] Initial set of strings that are mapped to
   *   numbers.
   */
  constructor(initialValue, errorValue, values = []) {
    this.values = values;
    this.valueMap = Object.fromEntries(values.map((v, i) => [v, i]));

    if (initialValue == null) {
      initialValue = 0;
    }
    this.initialValue = this.#internString(initialValue);
    if (errorValue == null) {
      errorValue = 0;
    }
    this.errorValue = this.#internString(errorValue);
    this.index1 = new Int32Array(INDEX_1_LENGTH);
    this.index2 = new Int32Array(MAX_INDEX_2_LENGTH);
    this.highStart = 0x110000;

    this.data = new Uint32Array(INITIAL_DATA_LENGTH);
    this.dataCapacity = INITIAL_DATA_LENGTH;

    this.firstFreeBlock = 0;
    this.isCompacted = false;

    // Multi-purpose per-data-block table.
    //
    // Before compacting:
    //
    // Per-data-block reference counters/free-block list.
    //  0: unused
    // >0: reference counter (number of index-2 entries pointing here)
    // <0: next free data block in free-block list
    //
    // While compacting:
    //
    // Map of adjusted indexes, used in compactData() and compactIndex2().
    // Maps from original indexes to new ones.
    this.map = new Int32Array(MAX_DATA_LENGTH_BUILDTIME >> SHIFT_2);

    let i = 0;
    let j = 0;
    for (i = 0; i < 0x80; i++) {
      this.data[i] = this.initialValue;
    }

    for (; i < 0xc0; i++) {
      this.data[i] = this.errorValue;
    }

    for (i = DATA_NULL_OFFSET; i < NEW_DATA_START_OFFSET; i++) {
      this.data[i] = this.initialValue;
    }

    this.dataNullOffset = DATA_NULL_OFFSET;
    this.dataLength = NEW_DATA_START_OFFSET;

    // Set the index-2 indexes for the 2=0x80>>SHIFT_2 ASCII data blocks
    i = 0;
    for (j = 0; j < 0x80; j += DATA_BLOCK_LENGTH) {
      this.index2[i] = j;
      this.map[i++] = 1;
    }

    // Reference counts for the bad-UTF-8-data block
    for (; j < 0xc0; j += DATA_BLOCK_LENGTH) {
      this.map[i++] = 0;
    }

    // Reference counts for the null data block: all blocks except for the
    // ASCII blocks. Plus 1 so that we don't drop this block during
    // compaction. Plus as many as needed for lead surrogate code points.
    // i==newTrie->dataNullOffset
    this.map[i++] =
      ((0x110000 >> SHIFT_2) - (0x80 >> SHIFT_2)) + 1 + LSCP_INDEX_2_LENGTH;
    j += DATA_BLOCK_LENGTH;
    for (; j < NEW_DATA_START_OFFSET; j += DATA_BLOCK_LENGTH) {
      this.map[i++] = 0;
    }

    // Set the remaining indexes in the BMP index-2 block
    // to the null data block
    for (i = 0x80 >> SHIFT_2; i < INDEX_2_BMP_LENGTH; i++) {
      this.index2[i] = DATA_NULL_OFFSET;
    }

    // Fill the index gap with impossible values so that compaction
    // does not overlap other index-2 blocks with the gap.
    for (i = 0; i < INDEX_GAP_LENGTH; i++) {
      this.index2[INDEX_GAP_OFFSET + i] = -1;
    }

    // Set the indexes in the null index-2 block
    for (i = 0; i < INDEX_2_BLOCK_LENGTH; i++) {
      this.index2[INDEX_2_NULL_OFFSET + i] = DATA_NULL_OFFSET;
    }

    this.index2NullOffset = INDEX_2_NULL_OFFSET;
    this.index2Length = INDEX_2_START_OFFSET;

    // Set the index-1 indexes for the linear index-2 block
    j = 0;
    for (i = 0; i < OMITTED_BMP_INDEX_1_LENGTH; i++) {
      this.index1[i] = j;
      j += INDEX_2_BLOCK_LENGTH;
    }

    // Set the remaining index-1 indexes to the null index-2 block
    for (; i < INDEX_1_LENGTH; i++) {
      this.index1[i] = INDEX_2_NULL_OFFSET;
    }

    // Preallocate and reset data for U+0080..U+07ff,
    // for 2-byte UTF-8 which will be compacted in 64-blocks
    // even if DATA_BLOCK_LENGTH is smaller.
    for (i = 0x80; i < 0x800; i += DATA_BLOCK_LENGTH) {
      this.set(i, this.initialValue);
    }
  }

  /**
   * Convert a string to a consistent number.
   *
   * @param {number|string} value
   * @returns {number}
   */
  #internString(value) {
    if (typeof value !== 'number') {
      let v = this.valueMap[value];
      if (v == null) {
        v = this.values.push(value) - 1;
        this.valueMap[value] = v;
      }
      return v;
    }
    return value;
  }

  /**
   * Set a single codePoint's value.
   *
   * @param {number} codePoint
   * @param {number|string} value
   * @returns {this}
   */
  set(codePoint, value) {
    if ((codePoint < 0) || (codePoint > 0x10ffff)) {
      throw new Error('Invalid code point');
    }

    if (this.isCompacted) {
      throw new Error('Already compacted');
    }

    value = this.#internString(value);
    const block = this.#getDataBlock(codePoint, true);
    this.data[block + (codePoint & DATA_MASK)] = value;
    return this;
  }

  /**
   * Sets a value for a range of codePoints.
   *
   * @param {number} start
   * @param {number} end
   * @param {number|string} value
   * @param {boolean} overwrite
   * @returns {this}
   */
  setRange(start, end, value, overwrite) {
    if (overwrite == null) {
      overwrite = true;
    }
    if ((start < 0) ||
      (start > 0x10ffff) ||
      (end < 0) ||
      (end > 0x10ffff) ||
      (start > end)
    ) {
      throw new Error('Invalid code point');
    }

    if (this.isCompacted) {
      throw new Error('Already compacted');
    }

    if (!overwrite && (value === this.initialValue)) {
      return this; // Nothing to do
    }

    value = this.#internString(value);
    let limit = end + 1;
    let block = null;
    let repeatBlock = null;
    if ((start & DATA_MASK) !== 0) {
      // Set partial block at [start..following block boundary
      block = this.#getDataBlock(start, true);

      const nextStart = (start + DATA_BLOCK_LENGTH) & ~DATA_MASK;
      if (nextStart <= limit) {
        this.#fillBlock(
          block,
          start & DATA_MASK,
          DATA_BLOCK_LENGTH,
          value,
          this.initialValue,
          overwrite
        );
        start = nextStart;
      } else {
        this.#fillBlock(
          block,
          start & DATA_MASK,
          limit & DATA_MASK,
          value,
          this.initialValue,
          overwrite
        );
        return this;
      }
    }

    // Number of positions in the last, partial block
    const rest = limit & DATA_MASK;

    // Round down limit to a block boundary
    limit &= ~DATA_MASK;

    // Iterate over all-value blocks
    if (value === this.initialValue) {
      repeatBlock = this.dataNullOffset;
    } else {
      repeatBlock = -1;
    }

    while (start < limit) {
      let setRepeatBlock = false;

      if ((value === this.initialValue) && this.#isInNullBlock(start, true)) {
        start += DATA_BLOCK_LENGTH; // Nothing to do
        continue;
      }

      // Get index value
      let i2 = this.#getIndex2Block(start, true);
      i2 += (start >> SHIFT_2) & INDEX_2_MASK;

      block = this.index2[i2];
      if (this.#isWritableBlock(block)) {
        // Already allocated
        if (overwrite && (block >= DATA_0800_OFFSET)) {
          // We overwrite all values, and it's not a
          // protected (ASCII-linear or 2-byte UTF-8) block:
          // replace with the repeatBlock.
          setRepeatBlock = true;
        } else {
          // Protected block: just write the values into this block
          this.#fillBlock(
            block,
            0,
            DATA_BLOCK_LENGTH,
            value,
            this.initialValue,
            overwrite
          );
        }
      } else if (
        (this.data[block] !== value) &&
        (overwrite || (block === this.dataNullOffset))
      ) {
        // Set the repeatBlock instead of the null block or previous repeat
        // block:
        //
        // If !isWritableBlock() then all entries in the block have the same
        // value because it's the null block or a range block (the repeatBlock
        // from a previous call to utrie2_setRange32()). No other blocks are
        // used multiple times before compacting.
        //
        // The null block is the only non-writable block with the initialValue
        // because of the repeatBlock initialization above. (If
        // value==initialValue, then the repeatBlock will be the null data
        // block.)
        //
        // We set our repeatBlock if the desired value differs from the
        // block's value, and if we overwrite any data or if the data is all
        // initial values (which is the same as the block being the null
        // block, see above).
        setRepeatBlock = true;
      }

      if (setRepeatBlock) {
        if (repeatBlock >= 0) {
          this.#setIndex2Entry(i2, repeatBlock);
        } else {
          // Create and set and fill the repeatBlock
          repeatBlock = this.#getDataBlock(start, true);
          this.#writeBlock(repeatBlock, value);
        }
      }

      start += DATA_BLOCK_LENGTH;
    }

    if (rest > 0) {
      // Set partial block at [last block boundary..limit
      block = this.#getDataBlock(start, true);
      this.#fillBlock(block, 0, rest, value, this.initialValue, overwrite);
    }

    return this;
  }

  /**
   * Get the value for a codePoint.
   *
   * @param {number} c CodePoint.
   * @param {boolean} fromLSCP
   * @returns {number}
   */
  get(c, fromLSCP = true) {
    if ((c < 0) || (c > 0x10ffff)) {
      return this.errorValue;
    }

    if (
      (c >= this.highStart) &&
      (!((c >= 0xd800) && (c < 0xdc00)) || fromLSCP)
    ) {
      return this.data[this.dataLength - DATA_GRANULARITY];
    }

    let i2 = 0;
    if (((c >= 0xd800) && (c < 0xdc00)) && fromLSCP) {
      i2 = (LSCP_INDEX_2_OFFSET - (0xd800 >> SHIFT_2)) + (c >> SHIFT_2);
    } else {
      i2 = this.index1[c >> SHIFT_1] + ((c >> SHIFT_2) & INDEX_2_MASK);
    }

    const block = this.index2[i2];
    return this.data[block + (c & DATA_MASK)];
  }

  /**
   * Get the string associated with a codePoint.
   *
   * @param {number} c
   * @returns {number|string}
   */
  getString(c) {
    const val = this.get(c);
    return this.values[val] ?? val;
  }

  /**
   * @param {number} c
   * @param {boolean} forLSCP
   * @returns {boolean}
   */
  #isInNullBlock(c, forLSCP) {
    let i2 = 0;
    if (((c & 0xfffffc00) === 0xd800) && forLSCP) {
      i2 = (LSCP_INDEX_2_OFFSET - (0xd800 >> SHIFT_2)) + (c >> SHIFT_2);
    } else {
      i2 = this.index1[c >> SHIFT_1] + ((c >> SHIFT_2) & INDEX_2_MASK);
    }

    const block = this.index2[i2];
    return block === this.dataNullOffset;
  }

  /**
   * @returns {number}
   */
  #allocIndex2Block() {
    const newBlock = this.index2Length;
    const newTop = newBlock + INDEX_2_BLOCK_LENGTH;
    if (newTop > this.index2.length) {
      // Should never occur.
      // Either MAX_BUILD_TIME_INDEX_LENGTH is incorrect,
      // or the code writes more values than should be possible.
      throw new Error('Internal error in Trie2 creation.');
    }

    this.index2Length = newTop;
    this.index2.set(
      this.index2.subarray(
        this.index2NullOffset,
        this.index2NullOffset + INDEX_2_BLOCK_LENGTH
      ),
      newBlock
    );

    return newBlock;
  }

  /**
   * @param {number} c
   * @param {boolean} forLSCP
   * @returns {number}
   */
  #getIndex2Block(c, forLSCP) {
    if ((c >= 0xd800) && (c < 0xdc00) && forLSCP) {
      return LSCP_INDEX_2_OFFSET;
    }

    const i1 = c >> SHIFT_1;
    let i2 = this.index1[i1];
    if (i2 === this.index2NullOffset) {
      i2 = this.#allocIndex2Block();
      this.index1[i1] = i2;
    }

    return i2;
  }

  /**
   * @param {number} block
   * @returns {boolean}
   */
  #isWritableBlock(block) {
    return (block !== this.dataNullOffset) &&
      (this.map[block >> SHIFT_2] === 1);
  }

  /**
   * @param {number} copyBlock
   * @returns {number}
   */
  #allocDataBlock(copyBlock) {
    let newBlock = 0;
    if (this.firstFreeBlock === 0) {
      // Get a new block from the high end
      newBlock = this.dataLength;
      const newTop = newBlock + DATA_BLOCK_LENGTH;
      if (newTop > this.dataCapacity) {
        // Out of memory in the data array
        let capacity = 0;
        if (this.dataCapacity < MEDIUM_DATA_LENGTH) {
          capacity = MEDIUM_DATA_LENGTH;
        } else if (this.dataCapacity < MAX_DATA_LENGTH_BUILDTIME) {
          capacity = MAX_DATA_LENGTH_BUILDTIME;
        } else {
          // Should never occur.
          // Either MAX_DATA_LENGTH_BUILDTIME is incorrect,
          // or the code writes more values than should be possible.
          throw new Error('Internal error in Trie2 creation.');
        }

        const newData = new Uint32Array(capacity);
        newData.set(this.data.subarray(0, this.dataLength));
        this.data = newData;
        this.dataCapacity = capacity;
      }
      this.dataLength = newTop;
    } else {
      // Get the first free block
      newBlock = this.firstFreeBlock;
      this.firstFreeBlock = -this.map[newBlock >> SHIFT_2];
    }

    this.data.set(
      this.data.subarray(copyBlock, copyBlock + DATA_BLOCK_LENGTH),
      newBlock
    );
    this.map[newBlock >> SHIFT_2] = 0;
    return newBlock;
  }

  /**
   * @param {number} block
   */
  #releaseDataBlock(block) {
    // Put this block at the front of the free-block chain
    this.map[block >> SHIFT_2] = -this.firstFreeBlock;
    this.firstFreeBlock = block;
  }

  /**
   * @param {number} i2
   * @param {number} block
   */
  #setIndex2Entry(i2, block) {
    ++this.map[block >> SHIFT_2]; // Increment first, in case block == oldBlock!
    const oldBlock = this.index2[i2];
    if (--this.map[oldBlock >> SHIFT_2] === 0) {
      this.#releaseDataBlock(oldBlock);
    }

    this.index2[i2] = block;
  }

  /**
   * @param {number} c
   * @param {boolean} forLSCP
   * @returns {number}
   */
  #getDataBlock(c, forLSCP) {
    let i2 = this.#getIndex2Block(c, forLSCP);
    i2 += (c >> SHIFT_2) & INDEX_2_MASK;

    const oldBlock = this.index2[i2];
    if (this.#isWritableBlock(oldBlock)) {
      return oldBlock;
    }

    // Allocate a new data block
    const newBlock = this.#allocDataBlock(oldBlock);
    this.#setIndex2Entry(i2, newBlock);
    return newBlock;
  }

  /**
   * @param {number} block
   * @param {number} start
   * @param {number} limit
   * @param {number} value
   * @param {number} initialValue
   * @param {boolean} overwrite
   */
  #fillBlock(block, start, limit, value, initialValue, overwrite) {
    let i = 0;
    if (overwrite) {
      for (i = block + start; i < block + limit; i++) {
        this.data[i] = value;
      }
    } else {
      for (i = block + start; i < block + limit; i++) {
        if (this.data[i] === initialValue) {
          this.data[i] = value;
        }
      }
    }
  }

  /**
   * @param {number} block
   * @param {number} value
   */
  #writeBlock(block, value) {
    const limit = block + DATA_BLOCK_LENGTH;
    while (block < limit) {
      this.data[block++] = value;
    }
  }

  /**
   * @param {number} highValue
   * @returns {number}
   */
  #findHighStart(highValue) {
    let prevBlock = 0;
    let prevI2Block = 0;
    const data32 = this.data;
    const {initialValue} = this;
    const {index2NullOffset} = this;
    const nullBlock = this.dataNullOffset;

    // Set variables for previous range
    if (highValue === initialValue) {
      prevI2Block = index2NullOffset;
      prevBlock = nullBlock;
    } else {
      prevI2Block = -1;
      prevBlock = -1;
    }

    const prev = 0x110000;

    // Enumerate index-2 blocks
    let i1 = INDEX_1_LENGTH;
    let c = prev;
    while (c > 0) {
      const i2Block = this.index1[--i1];
      if (i2Block === prevI2Block) {
        // The index-2 block is the same as the previous one, and filled with
        // highValue
        c -= CP_PER_INDEX_1_ENTRY;
        continue;
      }

      prevI2Block = i2Block;
      if (i2Block === index2NullOffset) {
        // This is the null index-2 block
        if (highValue !== initialValue) {
          return c;
        }
        c -= CP_PER_INDEX_1_ENTRY;
      } else {
        // Enumerate data blocks for one index-2 block
        let i2 = INDEX_2_BLOCK_LENGTH;
        while (i2 > 0) {
          const block = this.index2[i2Block + --i2];
          if (block === prevBlock) {
            // The block is the same as the previous one, and filled with
            // highValue
            c -= DATA_BLOCK_LENGTH;
            continue;
          }

          prevBlock = block;
          if (block === nullBlock) {
            // This is the null data block
            if (highValue !== initialValue) {
              return c;
            }
            c -= DATA_BLOCK_LENGTH;
          } else {
            let j = DATA_BLOCK_LENGTH;
            while (j > 0) {
              const value = data32[block + --j];
              if (value !== highValue) {
                return c;
              }
              --c;
            }
          }
        }
      }
    }

    // Deliver last range
    return 0;
  }

  /**
   * @param {number} dataLength
   * @param {number} otherBlock
   * @param {number} blockLength
   * @returns {number}
   */
  #findSameDataBlock(dataLength, otherBlock, blockLength) {
    // Ensure that we do not even partially get past dataLength
    dataLength -= blockLength;
    let block = 0;
    while (block <= dataLength) {
      if (equal_int(this.data, block, otherBlock, blockLength)) {
        return block;
      }
      block += DATA_GRANULARITY;
    }

    return -1;
  }

  /**
   * @param {number} index2Length
   * @param {number} otherBlock
   * @returns {number}
   */
  #findSameIndex2Block(index2Length, otherBlock) {
    // Ensure that we do not even partially get past index2Length
    index2Length -= INDEX_2_BLOCK_LENGTH;
    for (let block = 0; block <= index2Length; block++) {
      if (equal_int(this.index2, block, otherBlock, INDEX_2_BLOCK_LENGTH)) {
        return block;
      }
    }

    return -1;
  }

  #compactData() {
    // Do not compact linear-ASCII data
    let newStart = DATA_START_OFFSET;
    let start = 0;
    let i = 0;

    while (start < newStart) {
      this.map[i++] = start;
      start += DATA_BLOCK_LENGTH;
    }

    // Start with a block length of 64 for 2-byte UTF-8,
    // then switch to DATA_BLOCK_LENGTH.
    let blockLength = 64;
    let blockCount = blockLength >> SHIFT_2;
    start = newStart;
    while (start < this.dataLength) {
      // Start: index of first entry of current block
      // newStart: index where the current block is to be moved
      //           (right after current end of already-compacted data)
      if (start === DATA_0800_OFFSET) {
        blockLength = DATA_BLOCK_LENGTH;
        blockCount = 1;
      }

      // Skip blocks that are not used
      if (this.map[start >> SHIFT_2] <= 0) {
        // Advance start to the next block
        start += blockLength;

        // Leave newStart with the previous block!
        continue;
      }

      // Search for an identical block
      let movedStart = this.#findSameDataBlock(newStart, start, blockLength);
      let mapIndex = 0;
      if (movedStart >= 0) {
        // Found an identical block, set the other block's index value for the
        // current block
        mapIndex = start >> SHIFT_2;
        for (i = blockCount; i > 0; i--) {
          this.map[mapIndex++] = movedStart;
          movedStart += DATA_BLOCK_LENGTH;
        }

        // Advance start to the next block
        start += blockLength;

        // Leave newStart with the previous block!
        continue;
      }

      // See if the beginning of this block can be overlapped with the end of
      // the previous block look for maximum overlap (modulo granularity) with
      // the previous, adjacent block
      let overlap = blockLength - DATA_GRANULARITY;
      while (
        (overlap > 0) &&
          !equal_int(this.data, (newStart - overlap), start, overlap)
      ) {
        overlap -= DATA_GRANULARITY;
      }

      if ((overlap > 0) || (newStart < start)) {
        // Some overlap, or just move the whole block
        movedStart = newStart - overlap;
        mapIndex = start >> SHIFT_2;

        for (i = blockCount; i > 0; i--) {
          this.map[mapIndex++] = movedStart;
          movedStart += DATA_BLOCK_LENGTH;
        }

        // Move the non-overlapping indexes to their new positions
        start += overlap;
        for (i = blockLength - overlap; i > 0; i--) {
          this.data[newStart++] = this.data[start++];
        }
      } else { // No overlap && newStart==start
        mapIndex = start >> SHIFT_2;
        for (i = blockCount; i > 0; i--) {
          this.map[mapIndex++] = start;
          start += DATA_BLOCK_LENGTH;
        }

        newStart = start;
      }
    }

    // Now adjust the index-2 table
    i = 0;
    while (i < this.index2Length) {
      // Gap indexes are invalid (-1). Skip over the gap.
      if (i === INDEX_GAP_OFFSET) {
        i += INDEX_GAP_LENGTH;
      }
      this.index2[i] = this.map[this.index2[i] >> SHIFT_2];
      ++i;
    }

    this.dataNullOffset = this.map[this.dataNullOffset >> SHIFT_2];

    // Ensure dataLength alignment
    while ((newStart & (DATA_GRANULARITY - 1)) !== 0) {
      this.data[newStart++] = this.initialValue;
    }
    this.dataLength = newStart;
  }

  #compactIndex2() {
    // Do not compact linear-BMP index-2 blocks
    let newStart = INDEX_2_BMP_LENGTH;
    let start = 0;
    let i = 0;

    while (start < newStart) {
      this.map[i++] = start;
      start += INDEX_2_BLOCK_LENGTH;
    }

    // Reduce the index table gap to what will be needed at runtime.
    newStart += UTF8_2B_INDEX_2_LENGTH +
      ((this.highStart - 0x10000) >> SHIFT_1);
    start = INDEX_2_NULL_OFFSET;
    while (start < this.index2Length) {
      // Start: index of first entry of current block
      // newStart: index where the current block is to be moved
      //           (right after current end of already-compacted data)

      // search for an identical block
      const movedStart = this.#findSameIndex2Block(newStart, start);
      if (movedStart >= 0) {
        // Found an identical block, set the other block's index value for the
        // current block
        this.map[start >> SHIFT_1_2] = movedStart;

        // Advance start to the next block
        start += INDEX_2_BLOCK_LENGTH;

        // Leave newStart with the previous block!
        continue;
      }

      // See if the beginning of this block can be overlapped with the end of
      // the previous block look for maximum overlap with the previous,
      // adjacent block
      let overlap = INDEX_2_BLOCK_LENGTH - 1;
      while (
        (overlap > 0) &&
          !equal_int(this.index2, (newStart - overlap), start, overlap)
      ) {
        --overlap;
      }

      if ((overlap > 0) || (newStart < start)) {
        // Some overlap, or just move the whole block
        this.map[start >> SHIFT_1_2] = newStart - overlap;

        // Move the non-overlapping indexes to their new positions
        start += overlap;
        for (i = INDEX_2_BLOCK_LENGTH - overlap; i > 0; i--) {
          this.index2[newStart++] = this.index2[start++];
        }
      } else { // No overlap && newStart==start
        this.map[start >> SHIFT_1_2] = start;
        start += INDEX_2_BLOCK_LENGTH;
        newStart = start;
      }
    }

    // Now adjust the index-1 table
    for (i = 0; i < INDEX_1_LENGTH; i++) {
      this.index1[i] = this.map[this.index1[i] >> SHIFT_1_2];
    }

    this.index2NullOffset = this.map[this.index2NullOffset >> SHIFT_1_2];

    // Ensure data table alignment:
    // Needs to be granularity-aligned for 16-bit trie
    // (so that dataMove will be down-shiftable),
    // and 2-aligned for uint32_t data.

    // Arbitrary value: 0x3fffc not possible for real data.
    while ((newStart & ((DATA_GRANULARITY - 1) | 1)) !== 0) {
      this.index2[newStart++] = 0x0000ffff << INDEX_SHIFT;
    }

    this.index2Length = newStart;
  }

  #compact() {
    // Find highStart and round it up
    let highValue = this.get(0x10ffff);
    let highStart = this.#findHighStart(highValue);
    highStart =
      (highStart + (CP_PER_INDEX_1_ENTRY - 1)) & ~(CP_PER_INDEX_1_ENTRY - 1);
    if (highStart === 0x110000) {
      highValue = this.errorValue;
    }

    // Set trie->highStart only after utrie2_get32(trie, highStart).
    // Otherwise utrie2_get32(trie, highStart) would try to read the highValue.
    this.highStart = highStart;
    if (this.highStart < 0x110000) {
      // Blank out [highStart..10ffff] to release associated data blocks.
      const suppHighStart =
        this.highStart <= 0x10000 ? 0x10000 : this.highStart;
      this.setRange(suppHighStart, 0x10ffff, this.initialValue, true);
    }

    this.#compactData();
    if (this.highStart > 0x10000) {
      this.#compactIndex2();
    }

    // Store the highValue in the data array and round up the dataLength.
    // Must be done after compactData() because that assumes that dataLength
    // is a multiple of DATA_BLOCK_LENGTH.
    this.data[this.dataLength++] = highValue;
    while ((this.dataLength & (DATA_GRANULARITY - 1)) !== 0) {
      this.data[this.dataLength++] = this.initialValue;
    }

    this.isCompacted = true;
  }

  /**
   * Compact the storage and prepare data for fast lookups.
   *
   * @returns {UnicodeTrie}
   */
  freeze() {
    if (!this.isCompacted) {
      this.#compact();
    }

    const allIndexesLength = (this.highStart <= 0x10000) ?
      INDEX_1_OFFSET :
      this.index2Length;

    const dataMove = allIndexesLength;

    // Are indexLength and dataLength within limits?

    // For unshifted indexLength
    if ((allIndexesLength > MAX_INDEX_LENGTH) ||
      // For unshifted dataNullOffset
      ((dataMove + this.dataNullOffset) > 0xffff) ||
      // For unshifted 2-byte UTF-8 index-2 values
      ((dataMove + DATA_0800_OFFSET) > 0xffff) ||
      // For shiftedDataLength
      ((dataMove + this.dataLength) > MAX_DATA_LENGTH_RUNTIME)) {
      throw new Error('Trie data is too large.');
    }

    // Calculate the sizes of, and allocate, the index and data arrays
    const indexLength = allIndexesLength + this.dataLength;
    const data = new Int32Array(indexLength);

    // Write the index-2 array values shifted right by INDEX_SHIFT, after
    // adding dataMove
    let destIdx = 0;
    let i = 0;
    for (i = 0; i < INDEX_2_BMP_LENGTH; i++) {
      data[destIdx++] = ((this.index2[i] + dataMove) >> INDEX_SHIFT);
    }

    // Write UTF-8 2-byte index-2 values, not right-shifted
    for (i = 0; i < 0xc2 - 0xc0; i++) { // C0..C1
      data[destIdx++] = (dataMove + BAD_UTF8_DATA_OFFSET);
    }

    for (; i < 0xe0 - 0xc0; i++) { // C2..DF
      data[destIdx++] = (dataMove + this.index2[i << (6 - SHIFT_2)]);
    }

    if (this.highStart > 0x10000) {
      const index1Length = (this.highStart - 0x10000) >> SHIFT_1;
      const index2Offset =
        INDEX_2_BMP_LENGTH + UTF8_2B_INDEX_2_LENGTH + index1Length;

      // Write 16-bit index-1 values for supplementary code points
      for (i = 0; i < index1Length; i++) {
        data[destIdx++] =
          (INDEX_2_OFFSET + this.index1[i + OMITTED_BMP_INDEX_1_LENGTH]);
      }

      // Write the index-2 array values for supplementary code points,
      // shifted right by INDEX_SHIFT, after adding dataMove
      for (i = 0; i < this.index2Length - index2Offset; i++) {
        data[destIdx++] =
          ((dataMove + this.index2[index2Offset + i]) >> INDEX_SHIFT);
      }
    }

    // Write 16-bit data values
    for (i = 0; i < this.dataLength; i++) {
      data[destIdx++] = this.data[i];
    }

    const dest = new UnicodeTrie({
      data,
      highStart: this.highStart,
      errorValue: this.errorValue,
      values: this.values,
    });

    return dest;
  }

  //
  //

  /**
   * Generates a Uint8Array containing the serialized and compressed trie.
   * Trie data is compressed using the brotli algorithm to minimize file size.
   * Format:
   *   uint32_t highStart;
   *   uint32_t errorValue;
   *   uint32_t compressedDataLength;
   *   uint8_t trieData[compressedDataLength];
   *   uint8_t compressedJSONstringValuesArray[];
   * @returns {Uint8Array}
   */
  toBuffer() {
    const trie = this.freeze();

    const data = new Uint8Array(trie.data.buffer);

    // Swap bytes to little-endian
    swap32LE(data);

    const compressed = gzipSync(data, {level: 9});

    const values = ENCODER.encode(JSON.stringify(trie.values));
    const compressedValues = gzipSync(values, {level: 9});

    const arr = new Uint8Array(
      12 + compressed.length + compressedValues.length
    );
    const dv = new DataView(arr.buffer);
    dv.setUint32(0, trie.highStart, true);
    dv.setUint32(4, trie.errorValue, true);
    dv.setUint32(8, compressed.length, true);
    arr.set(compressed, 12);
    arr.set(compressedValues, 12 + compressed.length);

    return arr;
  }

  /**
   * @typedef {object} ModuleOptions
   * @prop {string=} [version] Version of the source file, usually the Unicode
   *   version.
   * @prop {string=} [date] Date the source file was created.  Can be parsed
   *   from most UCD files.
   * @prop {string} [name="Trie"] Name exported from the module with the Trie
   *   instance.
   * @prop {string} [quot='"'] Quote.  Should be single or double.
   * @prop {string} [semi=";"] Include semicolons? Pass in "" to disable.
   * @prop {string} [pkg="@cto.af/unicode-trie"] Package name for this
   *   package.  Mostly useful for internal tooling.
   */

  /**
   * Create a string version of a JS module that will reconstitute this trie.
   * Suitable for saving to a .mjs file.
   *
   * @param {ModuleOptions} [opts={}]
   * @returns {string}
   */
  toModule(opts = {}) {
    const {name, quot: q, semi: s, version, date, pkg} = {
      name: 'Trie',
      quot: '"',
      semi: ';',
      pkg: '@cto.af/unicode-trie',
      ...opts,
    };
    const buf = this.toBuffer();
    let ret = `import {UnicodeTrie} from ${q}${pkg}${q}${s}\n\n`;
    if (version) {
      ret += `export const version = ${q}${version}${q}${s}\n`;
    }
    if (date) {
      ret += `export const inputFileDate = new Date(${q}${new Date(date).toISOString()}${q})${s}\n`;
    }

    /* eslint-disable @stylistic/newline-per-chained-call */
    ret += `\
export const generatedDate = new Date(${q}${new Date().toISOString()}${q})${s}
export const ${name} = UnicodeTrie.fromBase64(
  \`${uint8ArrayToBase64(buf).split(/(.{72})/).filter(x => x).join('\n   ')}\`
)${s}

/**
 * @type {Record<string, number>}
 */
export const names = Object.fromEntries(
  ${name}.values.map((v, i) => [v, i])
)${s}
export const {values} = ${name}${s}
`;
    /* eslint-enable @stylistic/newline-per-chained-call */
    return ret;
  }
}
