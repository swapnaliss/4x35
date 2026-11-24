#!/usr/bin/env node
// stdin (a publisher file's bytes) -> stdout (Postgres COPY text) through the loader prototype in
// packages/db/src/seed/datasets.ts (Node 24 strips the types). Stats go to stderr as JSON.
// Usage: unzip -p data/raw/geonames-allCountries.zip allCountries.txt \
//          | node scripts/data/copy-stream.mjs geonames_postal | psql -c "COPY ... FROM STDIN"
import { once } from "node:events";
import { streamCopy } from "../../packages/db/src/seed/datasets.ts";

const kind = process.argv[2];
if (!["geonames_postal", "jp_post_roman", "jp_post_kana"].includes(kind)) {
  console.error("usage: copy-stream.mjs geonames_postal|jp_post_roman|jp_post_kana");
  process.exit(2);
}
const stats = await streamCopy(kind, process.stdin, async (text) => {
  if (!process.stdout.write(text)) await once(process.stdout, "drain");
});
console.error(JSON.stringify(stats));
