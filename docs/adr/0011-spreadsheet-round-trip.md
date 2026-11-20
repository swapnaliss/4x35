# 0011. Spreadsheet round-trip

- Status: accepted (2026-11-20, Approval 2)

## Context
P1: the corrected list must re-import into the ERP without remapping.

## Decision
CSV: papaparse with encoding detection (a chardet-class library + iconv-lite, versions verified in M0-05); written back in the original encoding, delimiter, quoting and EOL. XLSX: SheetJS 0.20.3 from cdn.sheetjs.com (pinned tarball + integrity), workbook book type only. Original cells are untouched; only new values are written and escaped against formula injection. The promise is "same columns and values", not identical formatting. Lost leading zeros produce a finding.

## Alternatives considered
npm `xlsx` 0.18.5 (stale, advisories); exceljs (stale).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
