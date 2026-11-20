---
title: "M2-24 · Synthetic 500-row / 30-country demo set + generator"
milestone: "M2 · Core Loop"
labels: ["eval"]
blocked_by: ["M2-06"]
estimate: "5h"
resources: ["LOCK"]
needs: []
---

## Context
The storyboard runs on "a payroll clerk's 500 contractors in 30 countries" (PROJECT.md §2), and the
data policy (§9.1) makes every supplier, employee and payment record synthetic. ADR 0020 requires a
synthetic eval set from **separate generator templates** so accuracy is not measured on the
parser's own templates; it is always reported apart from the hand-labelled set. This ticket builds a
seeded generator that produces gold structured addresses first and renders them into messy 4 × 35
free text, in every input format, with a matching payment file for linking.

## Scope
1. In Kiro, write `.kiro/specs/synthetic-data/{requirements.md (EARS), design.md, tasks.md}` and log
   the session in `docs/kiro-usage.md`. Properties: **S1** same seed → byte-identical outputs; **S2**
   every gold value occurs in the rendered free text (possibly in a different case or abbreviated
   form recorded in the row's `renderOps`), so the gold set never asks the system to invent;
   **S3** every rendered line is ≤ 35 characters and at most 4 lines; **S4** every IBAN passes
   mod-97 and every person and company name comes from the synthetic name lists.
2. New workspace `packages/synth` (private, not shipped in the image). LOCK (exclusive): this
   ticket adds a workspace and changes `package-lock.json`.
3. Gold generation for 30 countries: JP, IN, DE, CN, SG, HK, AE, BR, GB, US, FR, NL, ES, IT, SE, DK,
   NO, FI, CH, BE, AT, PL, IE, KR, PH, TW, MY, AU, CA, MX. Town/postcode pairs come from the GeoNames
   postal extract produced by the M2-11 loader (read from its file output, not the database; CC-BY
   4.0, attributed in NOTICE); where GeoNames has no postal data for a country, the postcode is
   synthetic, matches the chromium-i18n pattern and is marked `synthetic` in the gold row;
   street names, building numbers, persons and companies from synthetic lists written in this ticket
   (no real person's data). Per-country rendering templates written independently of the M2-12/M2-13
   parsers (separate files, separate author pass), including noise: all caps, missing country,
   town and postcode on one line, "C/O", PO boxes, names and account numbers mixed into lines,
   non-Latin scripts (Japanese, Devanagari, Cyrillic, Arabic) for some rows, and rows whose correct
   result is an empty element (information absent from the input).
4. Outputs to `data/demo/` (committed; all synthetic): `contractors.csv` (UTF-8 BOM, `;`, CRLF),
   `contractors-win1252.csv` (Latin rows only), `contractors.xlsx`, `payroll.pain.001.001.09.xml`,
   `payroll.pain.001.001.03.xml`, `payroll.mt101.txt`, and `gold.jsonl` (per row: id, country,
   target-form gold elements, renderOps, expected link status). The payment files reference the same
   parties by IBAN with deliberate cases: matched, ambiguous (two master records share an account
   and normalised name) and unmatched.
5. `data/demo/README.md`: seed, generator version, counts per country (n), licence notes, and the
   statement that every record is synthetic.
6. `npm run synth -w packages/synth -- --seed <n> --rows 500 --out <dir>` regenerates the set;
   `npm run validate:xsd -w packages/synth -- <files>` validates XML with `xmllint-wasm` against the
   build-time XSDs from M0-04 (no network).

## Out of scope
- The hand-labelled ≥ 150 set (M3-06). Measuring accuracy (M2-25, M3-07). Seeding judge sandboxes
  (M3-09, which reuses these files). Choosing storyboard numbers: whatever the set measures is what
  the demo shows.

## Acceptance Criteria
1. S1–S4 pass at ≥ 200 runs (generation of 50-row sets per run).
2. `npm run synth -- --seed 4035 --rows 500 --out $TMPDIR/synth` reproduces `data/demo/`
   byte-for-byte (diff is empty).
3. `data/demo/` covers exactly 30 countries with n ≥ 10 each, and `README.md` lists n per country.
4. The pain.001.001.09 and .03 files pass XSD validation with `xmllint-wasm`; the CSV/XLSX files load
   through the M2-01/M2-02 readers when those exist (otherwise through papaparse/SheetJS directly).
5. `gold.jsonl` has 500 rows, and the expected link statuses include at least 5 ambiguous and 5
   unmatched parties.
6. A scan finds no e-mail address, phone number or national ID pattern in `data/demo/`, and the
   gitleaks check passes.

## Deliverables
- `.kiro/specs/synthetic-data/*`; entry in `docs/kiro-usage.md`
- `packages/synth/{package.json,src/*.ts,templates/*.ts,lists/*.ts,test/*.test.ts}`
- `data/demo/{contractors.csv,contractors-win1252.csv,contractors.xlsx,payroll.pain.001.001.09.xml,payroll.pain.001.001.03.xml,payroll.mt101.txt,gold.jsonl,README.md}`
- `package.json` (workspaces), `package-lock.json`

## Validation Gate
```bash
npx vitest run packages/synth
npm run synth -w packages/synth -- --seed 4035 --rows 500 --out "$TMPDIR/synth"
diff -r "$TMPDIR/synth" data/demo --exclude=README.md
wc -l < data/demo/gold.jsonl                              # 500
npm run validate:xsd -w packages/synth -- data/demo/payroll.pain.001.001.09.xml data/demo/payroll.pain.001.001.03.xml
npx gitleaks detect --no-git --source data/demo
```

## Handoff
- **M2-25** uses `gold.jsonl` and the input files as the synthetic eval set (reported apart).
- **M2-26** uploads `contractors.csv` and `payroll.pain.001.001.09.xml` on production.
- **M2-20/M2-21/M2-22** can swap their own fixtures for these files.
- **M3-09** seeds judge sandboxes from `data/demo/`.
