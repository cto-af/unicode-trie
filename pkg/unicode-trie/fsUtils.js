import * as fs from 'node:fs/promises';
import {errCode} from '@cto.af/utils';

/**
 * Touch a file, only reporting an error if something unexpected like a
 * permissions problem happens.
 *
 * @param {string} out
 * @param {Date} [now]
 * @returns {Promise<string>}
 */
export async function touch(out, now) {
  now ??= new Date();
  try {
    await fs.utimes(out, now, now);
  } catch (e) {
    if (!errCode(e, 'ENOENT')) {
      throw e;
    }
  }
  return out;
}
