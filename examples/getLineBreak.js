#!/usr/bin/env node

// Won't be there in CI
// eslint-disable-next-line n/no-missing-import
import {LineBreak} from './LineBreak.js';

for (const num of process.argv.slice(2)) {
  const n = parseInt(num, 16);
  // eslint-disable-next-line no-console
  console.log(`U+${n.toString(16).padStart(4, '0')}:`, LineBreak.getString(n));
}
