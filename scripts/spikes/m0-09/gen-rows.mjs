#!/usr/bin/env node
// M0-09 load spike: deterministic generator of a SYNTHETIC supplier list (PROJECT.md §9.1).
// Every name, street and town is assembled from syllable pools by a seeded PRNG; IBANs are
// IBAN-shaped placeholders with check digits "00", which no real IBAN can carry.
//
// Writes into --out:
//   rows-utf8.csv    mixed scripts (Latin, CJK, Devanagari, Arabic, Cyrillic), UTF-8 with BOM, CRLF
//   rows-cp1252.csv  Latin-only rows encoded as Windows-1252, CRLF
//   rows.xlsx        the rows-utf8.csv rows as one sheet, written by SheetJS loaded from --deps
// Prints a JSON summary (bytes, rows, sha256 per file) to stdout.
//
// Usage: node gen-rows.mjs --deps "$TMPDIR/m009-deps" --seed 42 --rows 20000 --out "$TMPDIR/m009"
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values: opts } = parseArgs({
  options: {
    deps: { type: "string" },
    seed: { type: "string", default: "42" },
    rows: { type: "string", default: "20000" },
    out: { type: "string" },
  },
});
if (!opts.deps || !opts.out) {
  console.error("usage: gen-rows.mjs --deps <dir> --seed <n> --rows <n> --out <dir>");
  process.exit(2);
}
const SEED = Number(opts.seed);
const ROWS = Number(opts.rows);
if (!Number.isInteger(SEED) || !Number.isInteger(ROWS) || ROWS < 1) {
  console.error("gen-rows: --seed and --rows must be integers, --rows >= 1");
  process.exit(2);
}
const MAX_LINE = 35;
const HEADER = [
  "supplier_id",
  "name",
  "adr_line_1",
  "adr_line_2",
  "adr_line_3",
  "adr_line_4",
  "country",
  "iban",
  "bic",
  "currency",
  "payment_terms",
  "contact_email",
  "notes",
];
// Free-text remarks as supplier masters carry them; they bring the CSV near the 10 MB cap (R1).
const NOTES = [
  "Remit advice by email to accounts payable.",
  "Invoices quote the purchase order number.",
  "Bank details confirmed by call-back to the number on file.",
  "Supplier asked to keep the old address until the next quarter.",
  "Payments above the threshold need a second approver.",
  "Use the registered office address on payment instructions.",
  "Credit notes are netted against the next payment run.",
  "Address change requested; awaiting signed letter.",
  "Seasonal supplier; no payments expected in the first quarter.",
  "Withholding tax certificate on file for the current year.",
];
const CURRENCIES = ["EUR", "USD", "GBP", "JPY", "CNY", "INR", "AED", "CHF", "SEK", "PLN"];
const TERMS = ["NET30", "NET45", "NET60", "EOM", "IMMEDIATE"];

// mulberry32: small, fast, and identical on every platform for the same seed.
function prng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const pick = (xs) => xs[int(xs.length)];
  return { next, int, pick };
}

// Syllable pools per script. Words are built from them, so no output is a real name or address.
const SCRIPTS = {
  latin: {
    syl: ["ka", "lor", "ven", "mi", "ta", "bel", "dor", "sen", "ri", "nal", "ber", "gu", "sta"],
    acc: ["é", "ü", "ø", "ñ", "ç", "å", "ö", "à", "ß", "œ", "š", "ž"],
    legal: ["GmbH", "SARL", "S.L.", "Ltd", "B.V.", "AB", "S.p.A.", "Sp. z o.o.", "Inc.", "Oy"],
    street: ["Strasse", "Rue de la", "Calle", "Via", "Road", "Laan", "gatan", "ulica", "Avenue"],
    extra: ["Bâtiment", "Etage", "Unit", "Hof", "Escalera", "Piano", "c/o", "Postfach", "Suite"],
    countries: ["DE", "FR", "ES", "IT", "GB", "US", "NL", "SE", "PL", "BR", "AT", "BE", "CH"],
    sep: " ",
  },
  cjk: {
    syl: ["山", "田", "川", "本", "中", "村", "北", "東", "西", "南", "森", "松", "林", "高", "橋"],
    legal: ["株式会社", "有限公司", "合同会社", "商事", "贸易有限公司"],
    street: ["町", "丁目", "番地", "路", "号", "大街", "区"],
    extra: ["ビル", "階", "号室", "大厦", "楼", "室"],
    countries: ["JP", "CN", "TW"],
    sep: "",
  },
  devanagari: {
    syl: ["क", "र", "म", "न", "स", "त", "ल", "प्र", "वि", "शा", "गो", "पु", "दे", "रा"],
    legal: ["प्राइवेट लिमिटेड", "लिमिटेड", "एंटरप्राइजेज", "ट्रेडर्स"],
    street: ["मार्ग", "रोड", "नगर", "गली", "चौक"],
    extra: ["भवन", "मंजिल", "फ्लैट", "सेक्टर"],
    countries: ["IN"],
    sep: " ",
  },
  arabic: {
    syl: ["ال", "م", "ر", "ك", "ز", "ن", "ب", "ت", "س", "حا", "لي", "دو", "فا"],
    legal: ["ذ.م.م", "للتجارة", "ش.م.ع", "المحدودة"],
    street: ["شارع", "طريق", "حي", "ميدان"],
    extra: ["مبنى", "الطابق", "مكتب", "برج"],
    countries: ["AE", "SA", "EG"],
    sep: " ",
  },
  cyrillic: {
    syl: ["ко", "ва", "ли", "ров", "на", "ст", "ми", "ле", "бо", "го", "ра", "де"],
    legal: ["ООО", "АО", "ТОВ", "ЕООД", "ИП"],
    street: ["ул.", "пр.", "бул.", "пер."],
    extra: ["корп.", "оф.", "кв.", "эт."],
    countries: ["UA", "BG", "KZ", "RS"],
    sep: " ",
  },
};
// Mixed-script weights for rows-utf8.csv and rows.xlsx (percent).
const MIX = [
  ["latin", 50],
  ["cjk", 20],
  ["devanagari", 10],
  ["arabic", 10],
  ["cyrillic", 10],
];
// Windows-1252 has these code points in 0x80-0x9F; everything else it holds is U+0000-U+00FF.
const CP1252_HIGH = new Map([
  [0x20ac, 0x80],
  [0x201a, 0x82],
  [0x0192, 0x83],
  [0x201e, 0x84],
  [0x2026, 0x85],
  [0x2020, 0x86],
  [0x2021, 0x87],
  [0x02c6, 0x88],
  [0x2030, 0x89],
  [0x0160, 0x8a],
  [0x2039, 0x8b],
  [0x0152, 0x8c],
  [0x017d, 0x8e],
  [0x2018, 0x91],
  [0x2019, 0x92],
  [0x201c, 0x93],
  [0x201d, 0x94],
  [0x2022, 0x95],
  [0x2013, 0x96],
  [0x2014, 0x97],
  [0x02dc, 0x98],
  [0x2122, 0x99],
  [0x0161, 0x9a],
  [0x203a, 0x9b],
  [0x0153, 0x9c],
  [0x017e, 0x9e],
  [0x0178, 0x9f],
]);

function encodeCp1252(text) {
  const out = Buffer.allocUnsafe(text.length);
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    let b = CP1252_HIGH.get(cp);
    if (b === undefined && (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff))) b = cp;
    if (b === undefined) throw new Error(`gen-rows: U+${cp.toString(16)} is not in Windows-1252`);
    out[n++] = b;
  }
  return out.subarray(0, n);
}

// Cut at 35 code points (the MT line width); the generator never emits a longer line.
const clip = (s) => [...s].slice(0, MAX_LINE).join("").trim();

function makeRow(r, i, scriptName, latin1Only) {
  const s = SCRIPTS[scriptName];
  const word = (min, max) => {
    const n = min + r.int(max - min + 1);
    let w = "";
    for (let k = 0; k < n; k++) w += r.pick(s.syl);
    if (scriptName === "latin" && r.next() < 0.3) w += r.pick(s.acc);
    return scriptName === "latin" ? w[0].toUpperCase() + w.slice(1) : w;
  };
  const num = () => String(1 + r.int(250));
  const country = r.pick(s.countries);
  let name = [word(2, 3), word(2, 4), r.pick(s.legal)].join(s.sep);
  // Exercise CSV quoting: an embedded quote or comma in some names.
  const quirk = r.next();
  if (quirk < 0.05) name = `"${word(2, 3)}" ${name}`;
  else if (quirk < 0.1) name = `${word(2, 3)}, ${name}`;
  const street =
    scriptName === "latin"
      ? `${r.pick(s.street)} ${word(2, 4)} ${num()}`
      : [word(2, 3), r.pick(s.street), num()].join(s.sep);
  const extra = [r.pick(s.extra), num(), word(1, 2)].join(s.sep);
  const postcode = String(10000 + r.int(89999));
  const town = `${postcode} ${word(2, 4)}`;
  const lines = [street, extra, town, `${word(2, 3)}${s.sep}${word(1, 3)} ${country}`];
  if (r.next() < 0.15) lines[3] = ""; // some suppliers use three lines only
  if (latin1Only && r.next() < 0.05) lines[1] = `${lines[1]} €`; // a cp1252 0x80-0x9F character
  const bban = Array.from({ length: 18 }, () => r.int(10)).join("");
  const bic = `${word(1, 1)
    .toUpperCase()
    .replace(/[^A-Z]/g, "X")
    .padEnd(4, "X")
    .slice(0, 4)}${country}XX`;
  return [
    `S${String(i + 1).padStart(6, "0")}`,
    clip(name),
    ...lines.map(clip),
    country,
    `${country}00SYNTH${bban}`,
    bic,
    r.pick(CURRENCIES),
    r.pick(TERMS),
    `ap.${String(i + 1).padStart(6, "0")}@supplier.example`,
    Array.from({ length: 4 + r.int(5) }, () => r.pick(NOTES)).join(" "),
  ];
}

function generate(seed, rows, latin1Only) {
  const r = prng(seed);
  const total = MIX.reduce((a, [, w]) => a + w, 0);
  const out = [];
  for (let i = 0; i < rows; i++) {
    let script = "latin";
    if (!latin1Only) {
      let x = r.int(total);
      for (const [name, w] of MIX) {
        if (x < w) {
          script = name;
          break;
        }
        x -= w;
      }
    }
    out.push(makeRow(r, i, script, latin1Only));
  }
  return out;
}

const csvField = (v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const toCsv = (rows) =>
  `${[HEADER, ...rows].map((r) => r.map(csvField).join(",")).join("\r\n")}\r\n`;

const outDir = resolve(opts.out);
mkdirSync(outDir, { recursive: true });
const mixed = generate(SEED, ROWS, false);
// A separate stream for the Latin-only file, so it does not depend on the mixed file's draws.
const latin = generate((SEED ^ 0x5eed1252) >>> 0, ROWS, true);

const files = {
  "rows-utf8.csv": Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(toCsv(mixed))]),
  "rows-cp1252.csv": encodeCp1252(toCsv(latin)),
};
const require = createRequire(join(resolve(opts.deps), "package.json"));
const XLSX = require("xlsx");
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([HEADER, ...mixed]), "suppliers");
files["rows.xlsx"] = XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });

const summary = { seed: SEED, rows: ROWS, out: outDir, files: {} };
for (const [name, bytes] of Object.entries(files)) {
  writeFileSync(join(outDir, name), bytes);
  summary.files[name] = {
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
console.log(JSON.stringify(summary));
