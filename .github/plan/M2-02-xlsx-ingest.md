---
title: "M2-02 · XLSX ingest with round-trip"
milestone: "M2 · Core Loop"
labels: ["backend"]
blocked_by: ["M2-01"]
estimate: "5h"
resources: ["LOCK"]
needs: ["P-03", "P-11", "P-12"]
---

## Context
Pillar P1 and R1: most AP and payroll exports arrive as Excel workbooks, and the corrected list must
re-import without remapping. ADR 0011 fixes SheetJS 0.20.3 from the cdn.sheetjs.com tarball with a
pinned integrity hash (npm `xlsx` 0.18.5 has advisories), the `xlsx` book type only, original cells
untouched, new values formula-escaped, and the promise "same columns and values, not identical
formatting". Lost leading zeros produce a finding. R6: original bytes are immutable.

## Scope
1. Write the Kiro spec first: `.kiro/specs/ingest-xlsx/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties:
   **P-XLSX-1** read → write with no new values → read returns the same sheets, headers, cell values
   and cell types for every original cell; **P-XLSX-2** after appending new columns, every original
   cell keeps its value, type and formula text; **P-XLSX-3** every written new value that starts with
   `=`, `+`, `-` or `@` is stored as escaped text, never as a formula.
2. Add SheetJS 0.20.3 to `apps/server` from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
   with its integrity hash in `package-lock.json`. LOCK: this rewrites `package-lock.json`.
3. Codec in `packages/formats/src/xlsx/` (pure functions, no DB access):
   - `parseXlsx(bytes, { sheet? })` → the `ParsedTable` shape from M2-01 plus the sheet name and each
     row's sheet row number; the first sheet with a header row is the default, and the sheet list is
     returned so M2-05 can offer a choice.
   - `writeXlsx(originalBytes, sheet, newColumns, valuesByRow)` → bytes with book type `xlsx`, other
     sheets kept, original cells (values, types, formulas) untouched, new columns appended after the
     last used column.
   - Leading-zero check: a numeric cell in a column whose header or values look like postcodes or
     account numbers, where the source likely lost leading zeros, yields the finding
     `ingest.xlsx.leading_zero_lost` on the record. The value is never padded.
   - Accept only `.xlsx` (zip with `[Content_Types].xml` and `xl/workbook.xml`). `.xls`, `.xlsb`,
     `.ods` and macro-enabled `.xlsm` are rejected with problem+json; the zip checks from M1-08 run first.
4. Upload route accepts XLSX through the same ingest path as CSV (`extractRecords` from M2-01).
5. Synthetic fixtures in `fixtures/ingest/xlsx/` built by `fixtures/ingest/xlsx/make-fixtures.ts`
   with SheetJS itself (multi-sheet, merged header cells, dates, numeric postcodes, formulas,
   non-Latin text). Names and addresses are fictional.

## Out of scope
- Preserving styles, column widths or conditional formatting byte-for-byte (ADR 0011 promises
  values, not formatting).
- The mapping UI's sheet picker (M2-05) and the export endpoint (M2-22).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/ingest-xlsx/` with P-XLSX-1..3 named, and `docs/kiro-usage.md`
   has an entry.
2. `npm ls xlsx -w apps/server` shows 0.20.3 resolved from `cdn.sheetjs.com`, and `package-lock.json`
   holds an `integrity` value for it; no dependency resolves npm `xlsx@0.18.5`.
3. P-XLSX-1..3 pass as fast-check property tests (at least 300 runs each) over generated workbooks
   with strings, numbers, booleans, dates, formulas, empty cells and non-Latin text.
4. A fixture whose postcode column holds the number `1234` for a German row yields
   `ingest.xlsx.leading_zero_lost`, and the value stays `1234`.
5. Uploading `.xls`, `.xlsb`, `.xlsm` and `.ods` fixtures returns problem+json with a distinct type
   for each, and no Records are created (integration test).
6. Uploading a two-sheet fixture through the API creates Records from the default sheet with
   location `{sheet, row, columns}` (integration test on the local Postgres).

## Deliverables
- `.kiro/specs/ingest-xlsx/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `apps/server/package.json` and `package-lock.json` (SheetJS tarball + integrity)
- `packages/formats/src/xlsx/{parse,write,leading-zero,index}.ts` and tests
- `apps/server/test/integration/ingest-xlsx.test.ts`
- `fixtures/ingest/xlsx/make-fixtures.ts` and the generated fixtures

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
make up && make migrate
npm ls xlsx -w apps/server
grep -q 'cdn.sheetjs.com/xlsx-0.20.3' package-lock.json && grep -A3 'cdn.sheetjs.com/xlsx-0.20.3' package-lock.json | grep -q integrity
node fixtures/ingest/xlsx/make-fixtures.ts --check
npx vitest run packages/formats/src/xlsx
npx vitest run apps/server/test/integration/ingest-xlsx.test.ts
npx tsc -b
npx biome check packages/formats/src/xlsx fixtures/ingest/xlsx
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-05** gets the sheet list from `parseXlsx` for a sheet picker and the same `ParsedTable` for
  column detection.
- **M2-22** calls `writeXlsx` for the corrected list in its original layout.
- **M2-24** can emit XLSX demo files with the same fixture builder pattern.
