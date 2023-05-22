#!/usr/bin/env node

import { UnicodeTrieBuilder } from "../builder.js";
import fs from "fs/promises";

// Cache linebreak data in local file.  Requires Node v18+.
const INPUT = "LineBreak.txt";
let txt = null;
try {
  txt = await fs.readFile(INPUT, "utf8");
} catch (e) {
  const res = await fetch("https://www.unicode.org/Public/UCD/latest/ucd/LineBreak.txt");
  txt = await res.text();
  fs.writeFile(INPUT, txt, "utf8");
}

// Default value is "XX".  Add a new property value "ER" for errors.
const t = new UnicodeTrieBuilder("XX", "ER");

// Set defaults
t.setRange(0x20000, 0x2FFFD, "ID");
t.setRange(0x30000, 0x3FFFD, "ID");
t.setRange(0x1F000, 0x1FAFF, "ID");
t.setRange(0x1FC00, 0x1FFFD, "ID");
t.setRange(0x20A0, 0x20CF, "PR");

for (const line of txt.split("\n")) {
  // The format is two fields separated by a semicolon.
  // Field 0: Unicode code point value or range of code point values
  // Field 1: Line_Break property, a two-character string
  const m = line.match(/^([0-9A-F]{4})(?:\.\.([0-9A-F]{4}))?;(\S+)/i);
  if (m) {
    if (m[2]) {
      t.setRange(parseInt(m[1], 16), parseInt(m[2], 16), m[3]);
    } else {
      t.set(parseInt(m[1], 16), m[3]);
    }
  }
}

const buf = t.toBuffer();

await fs.writeFile("lineBreak.js", `\
import { UnicodeTrie } from "../index.js"
export const LineBreak = new UnicodeTrie(Buffer.from("${buf.toString("base64")}", "base64"));
`);