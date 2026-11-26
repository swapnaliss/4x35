// Merges the design docs' copy tables into src/i18n/en.json (nested by key segment). Keys already
// in en.json that the docs do not list are kept. Usage (from apps/web): node scripts/sync-copy.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCopyTables } from "./copy-tables.mjs";

const here = import.meta.dirname;
const target = join(here, "..", "src", "i18n", "en.json");
const en = JSON.parse(readFileSync(target, "utf8"));
const seen = new Map();
for (const { file, key, en: text } of readCopyTables(join(here, "..", "..", ".."))) {
  if (seen.has(key) && seen.get(key) !== text)
    throw new Error(`${key} differs between files (${file})`);
  seen.set(key, text);
  const parts = key.split(".");
  let node = en;
  for (const p of parts.slice(0, -1)) {
    if (typeof node[p] === "string") throw new Error(`${key}: ${p} is already a string`);
    node[p] ??= {};
    node = node[p];
  }
  node[parts.at(-1)] = text;
}
writeFileSync(target, `${JSON.stringify(en, null, 2)}\n`);
console.log(`en.json: ${seen.size} keys from docs/design`);
