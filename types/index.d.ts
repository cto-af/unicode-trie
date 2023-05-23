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
    constructor(data: Uint8Array | Buffer | {
        data: Int32Array;
        highStart: number;
        errorValue: number;
        values?: string[] | undefined;
    });
    highStart: number;
    errorValue: number;
    /**
     * @type{string[]}
     */
    values: string[];
    /**
     * @type {Int32Array}
     */
    data: Int32Array;
    /**
     * Get the value associated with a codepoint, or the default value, or the
     * error value if codePoint is out of range.
     *
     * @param {number} codePoint
     * @returns {number}
     */
    get(codePoint: number): number;
    /**
     * Get the value associated with the codePoint, stringified if possible.
     *
     * @param {number} codePoint
     * @returns {number|string}
     */
    getString(codePoint: number): number | string;
}
