#!/usr/bin/env node
// chromium-i18n address metadata (CC-BY 4.0) -> data/chromium-i18n/<CC>.json, committed as a
// snapshot (M0-08). Files are stored byte for byte as served, so each sha256 in data/sources.json
// is the publisher's bytes. Idempotent: a file whose sha256 matches its pin is not downloaded
// again; an altered file or download exits 3. PIN=1 re-downloads every country and re-pins.
//
// Countries: PROJECT.md §2 parser list (JP IN CN SG HK AE BR DE GB US FR NL ES IT) plus the
// M2-24 demo set (.github/plan/M2-24-synthetic-demo-set.md), 30 countries in all.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const COUNTRIES = [
  ...["JP", "IN", "CN", "SG", "HK", "AE", "BR", "DE", "GB", "US", "FR", "NL", "ES", "IT"],
  ...["SE", "DK", "NO", "FI", "CH", "BE", "AT", "PL", "IE", "KR", "PH", "TW", "MY", "AU", "CA"],
  "MX",
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCES = join(ROOT, "data", "sources.json");
const OUT = join(ROOT, "data", "chromium-i18n");
const ID = "chromium-i18n";
const TIMEOUT_MS = 60_000;
const PIN = process.env.PIN === "1";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const manifestHash = (files) =>
  sha256(
    Object.keys(files)
      .sort()
      .map((cc) => `${cc} ${files[cc].sha256}\n`)
      .join(""),
  );

function fail(code, message) {
  console.error(`${ID}: ${message}`);
  process.exit(code);
}

async function download(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

function checkJson(cc, buf) {
  const doc = JSON.parse(buf.toString("utf8"));
  if (doc.key !== cc) throw new Error(`${cc}.json has key ${JSON.stringify(doc.key)}`);
}

const sources = JSON.parse(readFileSync(SOURCES, "utf8"));
const entry = sources.find((s) => s.id === ID);
if (!entry) fail(2, "no entry in data/sources.json");
const pinned = entry.files ?? {};
if (!PIN && Object.keys(pinned).length === 0) fail(2, "nothing pinned; run with PIN=1 to pin");

mkdirSync(OUT, { recursive: true });
const files = {};
let downloaded = 0;
for (const cc of COUNTRIES) {
  const path = join(OUT, `${cc}.json`);
  const pin = pinned[cc]?.sha256;
  if (!PIN && existsSync(path)) {
    const buf = readFileSync(path);
    const got = sha256(buf);
    if (got !== pin) fail(3, `hash mismatch on existing ${cc}.json: pinned ${pin}, found ${got}`);
    files[cc] = { sha256: got, bytes: buf.length };
    continue;
  }
  if (!PIN && !pin) fail(2, `${cc} has no pinned sha256; run with PIN=1 to pin`);
  const url = entry.url.replace("{CC}", cc);
  let buf;
  try {
    buf = await download(url);
    checkJson(cc, buf);
  } catch (err) {
    fail(4, `${cc}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const got = sha256(buf);
  if (!PIN && got !== pin) fail(3, `hash mismatch on download of ${cc}: pinned ${pin}, got ${got}`);
  writeFileSync(path, buf);
  files[cc] = { sha256: got, bytes: buf.length };
  downloaded += 1;
}

const total = Object.values(files).reduce((n, f) => n + f.bytes, 0);
if (PIN) {
  entry.files = files;
  entry.sha256 = manifestHash(files);
  entry.bytes = total;
  entry.retrieved = new Date().toISOString().slice(0, 10);
  writeFileSync(SOURCES, `${JSON.stringify(sources, null, 2)}\n`);
  console.log(`${ID}: pinned ${COUNTRIES.length} countries, manifest sha256 ${entry.sha256}`);
} else if (manifestHash(files) !== entry.sha256) {
  fail(3, `manifest sha256 mismatch: pinned ${entry.sha256}, computed ${manifestHash(files)}`);
}
console.log(
  `${ID}: ${COUNTRIES.length} countries ok (${downloaded} downloaded, ${COUNTRIES.length - downloaded} up to date, ${total} bytes)`,
);
