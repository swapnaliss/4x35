#!/usr/bin/env node
// Recon smoke check (M0-04): validate one XML file against one XSD with xmllint-wasm, resolved from
// a scratch install so the repo's package-lock.json is untouched.
//
//   node scripts/recon/xsd-smoke.mjs <scratch-install-dir> <xsd> <xml> [--overlength-twnnm]
//
// --overlength-twnnm replaces the text of the first <TwnNm> with a 36-character value (TwnNm is
// Max35Text in PostalAddress24), so the same file must then fail validation.
// Prints "valid true" or "valid false" (plus xmllint's errors on stderr). Exit 0 either way;
// exit 2 on a usage or setup error.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, resolve } from "node:path";

const args = process.argv.slice(2);
const overlength = args.includes("--overlength-twnnm");
const [scratchDir, xsdPath, xmlPath] = args.filter((a) => a !== "--overlength-twnnm");
if (!scratchDir || !xsdPath || !xmlPath) {
  console.error("usage: xsd-smoke.mjs <scratch-install-dir> <xsd> <xml> [--overlength-twnnm]");
  process.exit(2);
}

const require = createRequire(resolve(scratchDir, "package.json"));
const { validateXML } = require("xmllint-wasm");

let xml = readFileSync(xmlPath, "utf8");
if (overlength) {
  const town = "T".repeat(36);
  const next = xml.replace(/<TwnNm>[^<]*<\/TwnNm>/, `<TwnNm>${town}</TwnNm>`);
  if (next === xml) {
    console.error("xsd-smoke: --overlength-twnnm given but the XML has no <TwnNm>");
    process.exit(2);
  }
  xml = next;
}

const result = await validateXML({
  xml: [{ fileName: basename(xmlPath), contents: xml }],
  schema: [{ fileName: basename(xsdPath), contents: readFileSync(xsdPath, "utf8") }],
});
for (const e of result.errors) console.error(e.rawMessage);
console.log(`valid ${result.valid}`);
