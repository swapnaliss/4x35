---
title: "M2-21 · Pre-flight + red→green"
milestone: "M2 · Core Loop"
labels: ["backend", "frontend", "critical"]
blocked_by: ["M2-08", "M2-09", "M2-20"]
estimate: "6h"
resources: []
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
Pillar P5, journey step 7 and storyboard 1:35–1:55: the payment file is checked against the chosen
bank pack per transaction, first as uploaded (red) and then with the approved addresses applied
(green). Rubric: Design ("red → green pre-flight") and Potential Impact. R2: pre-flight of 500
transactions ≤ 10 s. PreflightRun rows are immutable (architecture §2). Results never claim bank
acceptance: "checked against `<pack>@<version>`" (CLAUDE.md).

## Scope
1. In Kiro, write `.kiro/specs/preflight/{requirements.md (EARS), design.md, tasks.md}` and log the
   session in `docs/kiro-usage.md`. Properties: **F1** the "after" view of a transaction differs from
   "before" only in the `PstlAdr` of linked, applied parties; **F2** every applied address fits the
   element map of the file's message version (no element the version lacks; hybrid ≤ 2 AdrLine,
   TwnNm + Ctry present) and every value fits its XSD length; **F3** the same file, links and pack
   version give the same results (deterministic).
2. `packages/core/src/preflight/{apply.ts,run.ts}` (pure): build the "after" address per party from
   the approved/edited proposal through the element map (.03 PostalAddress6, .09 PostalAddress24;
   .12 read-only: pre-flight runs, "after" is computed, export is not offered), then run the pack's
   rules per transaction for before and after; result per transaction `{ txId, before: findings[],
   after: findings[], status: red|amber|green }` (red = any `reject`, amber = `strip`/`warn` only).
3. Job `preflight` (pg-boss, chunked, idempotent) started by `POST /api/batches/{id}/preflight`
   `{ packId, packVersion }`; writes one immutable `preflight_runs` row and `PreflightCompleted` +
   audit events in one transaction. The spliced "after" XML (via the M2-03 byte-splice writer, in
   memory) is validated against the pain.001 XSD with `xmllint-wasm` (no network); XSD errors are
   findings on the run.
4. `GET /api/preflight-runs/{id}` and `GET /api/batches/{id}/preflight-runs` (workspace-scoped,
   authZ matrix rows).
5. Screen `apps/web/src/routes/batches/$batchId/preflight.tsx` (build to
   `docs/design/screens/preflight.md`; ask `ux-designer` if missing): pack picker (bank packs from
   M2-08/M2-09 with source and retrieved date), summary before → after (reuse the M2-16 band),
   per-transaction list with red/amber/green conveyed by icon and text as well as colour, expandable
   findings, filter by status, a link to unresolved links (M2-20) and unapproved records (M2-18).
   Loading, empty, in-progress (polling), error states; keyboard navigation; i18n keys in
   `apps/web/src/i18n/en/preflight.json`.
6. If the file carries `ds:Signature` (detected by M2-03), the screen shows that applying changes
   invalidates the signature.

## Out of scope
- Writing and downloading the corrected file (M2-22). New rules or packs (M2-07 to M2-09).

## Acceptance Criteria
1. F1–F3 pass at ≥ 1,000 runs.
2. On the synthetic demo pain.001.001.09 (M2-24) checked against each launch bank pack, the
   integration test shows transactions red before and green after for every party with an applied
   approved address, and the counts match the fixture's expected values.
3. The XSD check of the in-memory "after" file passes for .03 and .09 fixtures; a fixture with a
   deliberately over-length applied value yields an XSD/length finding and is never truncated.
4. Pre-flight of 500 transactions completes in ≤ 10 s on the local stack (measured and printed).
5. A PreflightRun row cannot be updated (a test attempts UPDATE through the repository and gets an
   error); a re-run creates a new row.
6. The screen shows "checked against `<pack>@<version>`", never "will accept"/"will reject"; status
   is distinguishable without colour (Playwright checks the text/icon label).
7. Loading, empty, in-progress and error states render; the screen works by keyboard alone; axe
   reports zero WCAG 2.2 AA violations (Playwright).
8. `ui-reviewer` returns PASS on screenshots at 375/768/1440, light and dark, all states.

## Deliverables
- `.kiro/specs/preflight/*`; entry in `docs/kiro-usage.md`
- `packages/core/src/preflight/{apply.ts,run.ts}`, `packages/core/test/preflight/*.property.test.ts`
- `apps/server/src/modules/preflight/{routes.ts,job.ts,repository.ts}`
- `apps/server/test/integration/preflight.test.ts`, authZ matrix rows
- `apps/web/src/routes/batches/$batchId/preflight.tsx`, `apps/web/src/i18n/en/preflight.json`, `apps/web/e2e/preflight.spec.ts`

## Validation Gate
```bash
npx vitest run packages/core/test/preflight
npm run test:integration -w apps/server -- preflight
npm run test:integration -w apps/server -- authz-matrix
npx playwright test apps/web/e2e/preflight.spec.ts
! grep -rniE "will (accept|reject)" apps/web/src apps/server/src
npm run typecheck && npm run lint
```

## Handoff
- **M2-22** exports from a PreflightRun id; publish the run result shape and the "after" builder's
  entry point.
- **M2-26** asserts red → green on production; publish selectors.
- **M3-08** load-tests `POST /api/batches/{id}/preflight` against R2.
