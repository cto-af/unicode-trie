export class UnicodeTrieBuilder {
    /**
     * Create a builder.  Ideally this is called from tooling at build time,
     * and is not included in your runtime.  It is optimized for generating
     * small output that can be looked up fast, once frozen.
     *
     * @param {number|string} initialValue Default value if none other specified.
     * @param {number|string} errorValue Error value for out of range inputs.
     * @param {string[]} [values=[]] Initial set of strings that are mapped to numbers.
     */
    constructor(initialValue: number | string, errorValue: number | string, values?: string[] | undefined);
    values: string[];
    valueMap: {
        [k: string]: number;
    };
    initialValue: number;
    errorValue: number;
    index1: Int32Array;
    index2: Int32Array;
    highStart: number;
    data: Uint32Array;
    dataCapacity: number;
    firstFreeBlock: number;
    isCompacted: boolean;
    map: Int32Array;
    dataNullOffset: number;
    dataLength: number;
    index2NullOffset: number;
    index2Length: number;
    /**
     * Set a single codePoint's value.
     *
     * @param {number} codePoint
     * @param {number|string} value
     * @returns {this}
     */
    set(codePoint: number, value: number | string): this;
    /**
     * Sets a value for a range of codePoints.
     *
     * @param {number} start
     * @param {number} end
     * @param {number|string} value
     * @param {boolean} overwrite
     * @returns {this}
     */
    setRange(start: number, end: number, value: number | string, overwrite: boolean): this;
    /**
     * Get the value for a codePoint.
     *
     * @param {number} c CodePoint.
     * @param {boolean} fromLSCP
     * @returns {number}
     */
    get(c: number, fromLSCP?: boolean): number;
    /**
     * Get the string associated with a codePoint.
     *
     * @param {number} c
     * @returns {number|string}
     */
    getString(c: number): number | string;
    /**
     * Compact the storage and prepare data for fast lookups.
     *
     * @returns {UnicodeTrie}
     */
    freeze(): UnicodeTrie;
    /**
     * Generates a Buffer containing the serialized and compressed trie.
     * Trie data is compressed using the brotli algorithm to minimize file size.
     * Format:
     *   uint32_t highStart;
     *   uint32_t errorValue;
     *   uint32_t compressedDataLength;
     *   uint8_t trieData[compressedDataLength];
     *   uint8_t compressedJSONstringValuesArray[];
     * @returns {Buffer}
     */
    toBuffer(): Buffer;
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
    toModule(opts?: {
        /**
         * Version of the source file, usually the Unicode
         * version.
         */
        version?: string | undefined;
        /**
         * Date the source file was created.  Can be parsed
         * from most UCD files.
         */
        date?: string | undefined;
        /**
         * Name exported from the module with the Trie
         * instance.
         */
        name?: string | undefined;
        /**
         * Quote.  Should be single or double.
         */
        quot?: string | undefined;
        /**
         * Include semicolons? Pass in "" to disable.
         */
        semi?: string | undefined;
        /**
         * Package name for this
         * package.  Mostly useful for internal tooling.
         */
        pkg?: string | undefined;
    } | undefined): string;
    #private;
}
import { UnicodeTrie } from "./index.js";
