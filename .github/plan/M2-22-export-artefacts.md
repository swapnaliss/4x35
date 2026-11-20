---
title: "M2-22 · Export artefacts"
milestone: "M2 · Core Loop"
labels: ["backend", "frontend", "critical"]
blocked_by: ["M2-02", "M2-04", "M2-21"]
estimate: "6h"
resources: []
needs: []
---

## Context
Journey step 8 and storyboard 1:55–2:10: the user leaves with the corrected payment file, the
corrected list in its original layout and an audit report. Pillar P1 promises "same columns and
values back" (ADR 0011); ADR 0010 promises that a payment file changes only inside the spliced
`PstlAdr` ranges. Exports are new rows; original bytes are never modified (architecture §7). Each
export runs in one transaction (ADR 0004).

## Scope
1. In Kiro, write `.kiro/specs/export/{requirements.md (EARS), design.md, tasks.md}` and log the
   session in `docs/kiro-usage.md`. Properties: **E1** for pain.001 (.03/.09), bytes outside the
   spliced `PstlAdr` ranges are identical to the original; **E2** for CSV/XLSX, every original
   column and value is unchanged and only new columns are added; **E3** every new cell value that
   starts with `=`, `+`, `-`, `@`, tab or CR is escaped, and no original cell is escaped; **E4** the
   audit report has one row per decided record and its hashes match the stored artefacts.
2. Payment file: `packages/core/src/export/payment-file.ts` builds splices from the latest
   PreflightRun's applied addresses and calls the M2-03 byte-splice writer; the result is
   XSD-validated with `xmllint-wasm` before it is stored. If `ds:Signature` is present, the user must
   confirm, and may request a new `MsgId` (the only non-address change, recorded in the audit
   report). pain.001.001.12 is read-only: no corrected file is offered, and the screen says why.
   MT101: the corrected file through the M2-04 adapter's writer, with non-address fields unchanged.
3. Master list: CSV through the M2-01 writer in the original encoding, delimiter, quoting and EOL;
   XLSX through the M2-02 writer, original sheets untouched. New columns appended per target form
   (structured: StrtNm, BldgNb, …, Ctry; hybrid: TwnNm, Ctry, AdrLine1, AdrLine2), plus a status
   column (`approved | edited | unknown | needs_review`). Unknown and undecided rows get empty new
   cells, never a guess.
4. Audit report: CSV and JSON with record location, before (original lines), after (elements with
   provenance), decision, approver, actor kind, decision time, pack id@version with source and
   retrieved date, and sha256 of the original upload and of every artefact.
5. `POST /api/batches/{id}/exports` (CSRF, `Idempotency-Key`; owner or reviewer; runs as a job if
   the batch has more than 500 records, otherwise in the request with a 10 s budget) writes `exports`
   rows (kind, bytes, sha256, actor) and `ExportCreated` + audit events in one transaction and moves
   the batch to `exported`; `GET /api/exports/{id}/download` streams with the original file name plus
   a suffix and `Content-Disposition: attachment`. Workspace-scoped; authZ matrix rows.
6. Screen `apps/web/src/routes/batches/$batchId/export.tsx` (build to
   `docs/design/screens/export.md`; ask `ux-designer` if missing): what will be exported, counts of
   undecided records (export allowed, with a warning), signature warning, previous exports with hash
   and actor, download buttons. Loading, empty, error states; keyboard; i18n keys in
   `apps/web/src/i18n/en/export.json`.

## Out of scope
- Writing pain.001.001.12. PDF reports. Sending files to banks (PROJECT.md §9).

## Acceptance Criteria
1. E1–E4 pass at ≥ 1,000 runs (E1 on generated pain.001 .03 and .09 documents; E2/E3 on generated
   CSV and XLSX).
2. Round-trip fixtures: the synthetic demo CSV (UTF-8 with BOM, `;` delimiter, CRLF), a Windows-1252
   CSV and the demo XLSX each export with the same encoding/delimiter/EOL/sheets; re-importing the
   export through the M2-01/M2-02 readers gives the original columns and values unchanged.
3. The exported pain.001.001.09 and .03 pass XSD validation; a byte diff against the original shows
   changes only inside `PstlAdr` (and `MsgId` when the user chose a new one).
4. A signed fixture refuses export until the user confirms, and the audit report records the
   confirmation.
5. Exporting twice with the same `Idempotency-Key` returns the same export; a later export creates a
   new row; the original upload's sha256 is unchanged.
6. The audit report's artefact hashes equal `sha256sum` of the downloaded files (integration test).
7. The export screen works by keyboard alone, renders loading/empty/error states and has zero axe
   WCAG 2.2 AA violations (Playwright).
8. `ui-reviewer` returns PASS on screenshots at 375/768/1440, light and dark, all states.

## Deliverables
- `.kiro/specs/export/*`; entry in `docs/kiro-usage.md`
- `packages/core/src/export/{payment-file.ts,master-list.ts,audit-report.ts}`, `packages/core/test/export/*.property.test.ts`
- `apps/server/src/modules/export/{routes.ts,service.ts,repository.ts}`
- `apps/server/test/integration/export.test.ts`, `apps/server/test/fixtures/export/*` (synthetic)
- `apps/web/src/routes/batches/$batchId/export.tsx`, `apps/web/src/i18n/en/export.json`, `apps/web/e2e/export.spec.ts`

## Validation Gate
```bash
npx vitest run packages/core/test/export
npm run test:integration -w apps/server -- export
npm run test:integration -w apps/server -- authz-matrix
npx playwright test apps/web/e2e/export.spec.ts
npm run typecheck && npm run lint
```

## Handoff
- **M2-26** downloads every artefact on production and checks hashes and XSD validity; publish the
  download file names and the audit report columns.
- **M2-23** purges `exports` rows with the batch.
- **M3-02** (MCP) and **M3-04** (Crew app) expose export summaries; publish the endpoint shapes.
