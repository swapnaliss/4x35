---
title: "M2-19 · Record detail: provenance + edit"
milestone: "M2 · Core Loop"
labels: ["frontend"]
blocked_by: ["M2-18"]
estimate: "6h"
resources: []
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
"Every field shows its provenance and reason" (journey step 5) and "a field left empty rather than
guessed" (storyboard 0:55–1:35) are what make the never-invent promise visible (R6, ADR 0008).
Rubric: Design ("field-level provenance") and Innovation. This screen shows where each value came
from and lets a reviewer fix flagged fields, mark unknowns and reopen, through the M2-17 API.

## Scope
1. In Kiro, update `.kiro/specs/review/` with record-detail requirements (EARS) and tasks and log
   the session in `docs/kiro-usage.md`. Property: **D1** for any `span` or `transform` field, the
   highlighted range in the original lines is exactly the field's source offsets (fast-check over
   generated proposals, testing the pure highlight function).
2. Build to `docs/design/screens/record-detail.md`; if missing, ask the `ux-designer` agent first.
3. Route `apps/web/src/routes/batches/$batchId/records/$recordId.tsx` (also usable as a side panel
   from the grid): original lines (immutable) with the source span of the focused field highlighted;
   one row per element of the target form with value, provenance kind, reason:
   - `span`: the highlighted substring and, if LLM-labelled, "labelled by the LLM, located in your
     input";
   - `transform`: transform table entry and version (for example "ISO 9 Cyrillic, v1");
   - `dataset`: the dataset, record key and licence attribution (GeoNames / chromium-i18n / Japan Post);
   - `inferred`: the rule that inferred it; `human` / `external`: actor and time;
   - empty: why it was left empty ("not found in the input; not guessed").
   Findings with severity and "checked against `<pack>@<version>`".
4. Edit mode: inline inputs per element with live validation from shared zod schemas and the element
   map of the batch's message version (length, pack charset, element availability in .03); an
   over-length value shows a finding and is never cut. Save posts `edit` with `proposalVersion`;
   `u` marks unknown; reopen for decided records; decision history list.
5. Keyboard: `Tab` through fields, `Esc` cancels edit, `Ctrl+Enter` saves, `[`/`]` previous/next
   record in the current grid filter.
6. States: loading, error with retry, record not found (404), conflict (409: show both versions and
   reload).
7. Strings as i18n keys in `apps/web/src/i18n/en/record.json`.

## Out of scope
- Changing how proposals are built. Editing original lines. Linking (M2-20).

## Acceptance Criteria
1. D1 passes at ≥ 1,000 runs.
2. On seeded synthetic records (one Japanese, one Indian, one German, one with an empty mandatory
   element), Playwright asserts each field's provenance label, the highlighted span text, the dataset
   citation and the "not guessed" reason for the empty field.
3. Editing StrtNm to 71 characters shows `length.exceeded`, saves the full value (API response
   checked) and never shortens it in the UI.
4. On a pain.001.001.03 batch, the Flr input is absent or routed to AdrLine per the element map, as
   the pack allows (Playwright).
5. A 409 on save shows both versions and reload works.
6. `[`/`]`, `Esc`, `Ctrl+Enter` work by keyboard alone; focus returns to the grid row on close.
7. axe: zero WCAG 2.2 AA violations in view, edit and error states.
8. No hard-coded user-facing string; no text says the bank "will accept" or "reject".
9. `ui-reviewer` returns PASS on screenshots at 375/768/1440, light and dark, all states.

## Deliverables
- `.kiro/specs/review/*` (updated); entry in `docs/kiro-usage.md`; `docs/design/screens/record-detail.md` (if written)
- `apps/web/src/routes/batches/$batchId/records/$recordId.tsx`, `apps/web/src/components/record/*`
- `apps/web/src/lib/highlight.ts` + `apps/web/src/lib/highlight.property.test.ts`
- `apps/web/src/i18n/en/record.json`, `apps/web/e2e/record-detail.spec.ts`

## Validation Gate
```bash
npx vitest run apps/web/src/lib/highlight.property.test.ts
npx playwright test apps/web/e2e/record-detail.spec.ts
! grep -rniE "will (accept|reject)" apps/web/src
npm run typecheck -w apps/web && npm run lint -w apps/web
```

## Handoff
- **M2-26** expands the JP/IN/DE records and checks the empty field on production; publish the
  record selectors and the seeded record keys used.
- **M3-10** extends the i18n keys in `record.json`.
