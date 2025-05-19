#!/usr/bin/env node

import {LineBreak} from './LineBreak.js';

for (const num of process.argv.slice(2)) {
  const n = parseInt(num, 16);
  // eslint-disable-next-line no-console
  console.log(`U+${n.toString(16).padStart(4, '0')}:`, LineBreak.getString(n));
}
