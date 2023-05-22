#!/usr/bin/env node

import { LineBreak } from "./lineBreak.js";

for (const num of process.argv.slice(2)) {
  console.log(LineBreak.get(parseInt(num, 16)));
}
