---
title: "M2-16 · Health report screen"
milestone: "M2 · Core Loop"
labels: ["frontend", "critical"]
blocked_by: ["M2-05", "M2-07", "M2-15"]
estimate: "6h"
resources: []
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
Journey step 4 and storyboard 0:35–0:55: after upload, mapping and pack choice, the user sees what
passes, what fails and why, by country ("412 would fail" is whatever the demo set measures; no
number is hard-coded). Rubric: Design and Potential Impact ("show the before/after pass rate").
M1-07 shipped a country-only thin health report; this ticket replaces it with the full report over
the CBPR+ pack (M2-07) and the classification from M2-15, and adds the owner-only LLM opt-in toggle
whose API M2-14 built.

## Scope
1. In Kiro, update `.kiro/specs/health-report/{requirements.md (EARS), design.md, tasks.md}` (create
   it if M1-07 did not) and log the session in `docs/kiro-usage.md`. Property: **H1** the report's
   totals equal the sum of its per-country rows and the count of the batch's records, for any batch.
2. If `docs/design/screens/health-report.md` is missing or does not cover the states below, ask the
   `ux-designer` agent to write or extend it first; build to it.
3. API `GET /api/batches/{id}/health` (zod-openapi): batch status and progress (polled while
   `parsing | structuring`); `checkedAgainst` `{ packId, version, sourceUrl, retrievedDate,
   effectiveFrom }`; totals **before** (original addresses checked against the pack) and **after**
   (proposals) as `pass | fail | needs_review | auto_approvable | already_valid`; per-country rows
   with n; top failing rules with counts and i18n message keys. Computed by a query over persisted
   proposals and findings; no structuring in the request. Workspace-scoped; added to the authZ matrix.
4. Screen `apps/web/src/routes/batches/$batchId/health.tsx`: summary band (before → after), the
   wording "checked against `<pack>@<version>` (source, retrieved date)", per-country table
   (sortable, keyboard operable), top failing rules, a link per row into the review queue filtered by
   country or rule (route from M2-18; a plain link until then), and the polling progress state.
5. LLM opt-in panel: shows on/off; owners see a toggle calling `PATCH /api/workspaces/{id}/settings`
   with a one-line disclosure that address lines (not names) go to Anthropic when on; reviewers see
   the state only.
6. States: loading (skeleton), empty (batch with zero records), error (problem+json rendered with a
   retry), in-progress (polling with counts), failed batch (reason shown).
7. Strings as i18n keys in `apps/web/src/i18n/en/health.json`. No wording says "the bank will accept"
   or "reject"; no Swift date is shown.

## Out of scope
- Review actions (M2-17/M2-18). Pre-flight of payment files (M2-21). The accuracy page (M3-07).
  Translations into other languages (M3-10 does the i18n pass).

## Acceptance Criteria
1. Against a seeded 500-row synthetic batch, `GET /api/batches/{id}/health` returns totals that
   satisfy H1 (property test plus an integration test on the seeded batch) and responds in
   p95 ≤ 300 ms over 50 local requests (measured, printed by the test).
2. The screen shows before and after totals, the per-country table with n, the top failing rules,
   and "checked against `<pack>@<version>`" with source and retrieved date: proven by a Playwright
   component or page test on the seeded batch.
3. Loading, empty, error, in-progress and failed states each render, proven by Playwright with
   network routing to stub the API responses in the test only (the product path calls the real API).
4. Every control is reachable and operable by keyboard alone (Tab order, Enter/Space on sort and
   toggle), shown by a Playwright keyboard-only test; visible focus on every control.
5. axe reports zero WCAG 2.2 AA violations on all five states.
6. A reviewer cannot toggle LLM opt-in (control absent in the UI, 403 from the API); an owner can,
   and the change is audited.
7. No hard-coded user-facing string in the route files (biome/i18n check or a grep test), and
   "will accept"/"will reject" appear nowhere in `apps/web/src`.
8. `ui-reviewer` returns PASS on screenshots at 375/768/1440, light and dark, all states.

## Deliverables
- `.kiro/specs/health-report/*`; entry in `docs/kiro-usage.md`; `docs/design/screens/health-report.md` (if extended)
- `apps/server/src/modules/preflight/health-route.ts` (or the module that owns the report query), authZ matrix row
- `apps/web/src/routes/batches/$batchId/health.tsx`, `apps/web/src/components/health/*`
- `apps/web/src/i18n/en/health.json`
- `apps/web/e2e/health-report.spec.ts`, `apps/server/test/integration/health-report.test.ts`

## Validation Gate
```bash
npm run test:integration -w apps/server -- health-report
npm run test:integration -w apps/server -- authz-matrix
npx playwright test apps/web/e2e/health-report.spec.ts
! grep -rniE "will (accept|reject)" apps/web/src
npm run typecheck -w apps/web && npm run lint -w apps/web
```

## Handoff
- **M2-18** turns the per-country and per-rule links into review-queue filters (query params
  `country`, `ruleId`, `status`); publish the param names in the done note.
- **M2-21** reuses the before/after band component for pre-flight.
- **M2-26** asserts the health numbers on production; publish the selectors (`data-testid`) used.
