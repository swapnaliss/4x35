---
title: "M2-18 · Review grid + bulk UI"
milestone: "M2 · Core Loop"
labels: ["frontend", "critical"]
blocked_by: ["M2-16", "M2-17"]
estimate: "6h"
resources: ["LOCK"]
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
The review queue is the hero screen (rubric Design: "keyboard-first review queue, field-level
provenance"; storyboard 0:55–1:35: expand a Japanese, an Indian and a German address, bulk-approve
the high-confidence rest). Success metric: time to clear 500 rows under 10 minutes. ADR 0012 asks
for a virtualised grid, LCP ≤ 2.5 s and INP ≤ 200 ms. This ticket builds the grid and bulk approve
on the M2-17 API.

## Scope
1. In Kiro, update `.kiro/specs/review/` with the UI requirements (EARS) and tasks for the grid and
   log the session in `docs/kiro-usage.md`.
2. Build to `docs/design/screens/review-queue.md`; if it does not cover bulk approve, conflict and
   the keyboard map, ask the `ux-designer` agent to extend it first.
3. Route `apps/web/src/routes/batches/$batchId/review.tsx`: virtualised rows (TanStack Virtual,
   `@tanstack/react-virtual`, **version verified on the npm registry in this ticket**), sorted by
   risk, filters `status`, `country`, `ruleId` as URL search params (from the M2-16 links), cursor
   pagination through TanStack Query. Each row: original lines, proposed elements in compact form,
   provenance kind badges per field, state, top finding. Expanding a row shows per-field reasons
   inline; full detail is M2-19.
4. Keyboard map (shown in a help dialog on `?`): `j`/`k` move, `Enter` expand, `a` approve,
   `u` mark unknown, `e` open edit (M2-19), `x` select, `Shift+A` select all auto-approvable in the
   current filter, `Shift+Enter` bulk-approve the selection. No single-key shortcut fires inside a
   text field (WCAG 2.1.4).
5. Bulk approve: a confirmation dialog stating the count and the pack version; calls
   `POST /api/batches/{id}/bulk-approve` in chunks of ≤ 1,000; shows per-item results; conflicts are
   listed with a refresh action. A single 409 on a row action shows the current version and offers
   reload.
6. Optimistic update only for single approve, rolled back on 409 or error (engineering standards §5).
7. States: loading, empty (nothing to review: link back to the health report), error with retry,
   all-decided (batch reviewed: link to linking/pre-flight).
8. Strings as i18n keys in `apps/web/src/i18n/en/review.json`.

LOCK (exclusive): this ticket adds a dependency to `apps/web` and changes `package-lock.json`.

## Out of scope
- Record detail, edit form and provenance view (M2-19). Linking review (M2-20). API changes beyond
  what M2-17 provides (log to BL-01 if needed).

## Acceptance Criteria
1. On a seeded 500-record synthetic batch, Playwright clears the queue by keyboard only
   (`Shift+A`, `Shift+Enter`, then `j`/`a`/`u` through the rest) and every record ends in a decided
   state; the test prints the elapsed time.
2. Scrolling the 500-record grid renders at most a window of rows in the DOM (asserted) and INP for
   `a` on a row is ≤ 200 ms in a Playwright performance trace on the local build.
3. A forced 409 (a second session approves first) shows the conflict message and a working reload;
   the optimistic row state is rolled back.
4. Bulk approve with 3 stale items shows 3 conflicts and approves the rest; counts match the API.
5. Filters from the URL (`?country=JP&status=needs_review`) restore the same view after reload.
6. Loading, empty, error and all-decided states render (Playwright).
7. Typing `a` inside a text input does not approve anything (Playwright).
8. axe: zero WCAG 2.2 AA violations on every state; visible focus on the active row.
9. No hard-coded user-facing string in the route and component files.
10. `ui-reviewer` returns PASS on screenshots at 375/768/1440, light and dark, all states.

## Deliverables
- `.kiro/specs/review/*` (updated); entry in `docs/kiro-usage.md`; `docs/design/screens/review-queue.md` (if extended)
- `apps/web/src/routes/batches/$batchId/review.tsx`, `apps/web/src/components/review/*`
- `apps/web/src/i18n/en/review.json`
- `apps/web/e2e/review-grid.spec.ts`
- `apps/web/package.json`, `package-lock.json`

## Validation Gate
```bash
npm ls @tanstack/react-virtual -w apps/web
npx playwright test apps/web/e2e/review-grid.spec.ts
npm run typecheck -w apps/web && npm run lint -w apps/web
npm run build -w apps/web
```

## Handoff
- **M2-19** opens from `Enter`/`e` on a row (route `/batches/$batchId/records/$recordId`); keep the
  grid's selection and scroll position on return.
- **M2-26** drives this screen on production; publish the `data-testid`s and the measured local
  time-to-clear in the done note.
