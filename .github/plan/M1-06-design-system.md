---
title: "M1-06 · Design system + hero screen specs (ux-designer)"
milestone: "M1 · Walking Skeleton"
labels: ["frontend", "critical"]
blocked_by: ["M0-GATE"]
estimate: "5h"
resources: ["LOCK"]
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
Design is 20% of the rubric, and PROJECT.md's Design requirement is a keyboard-first review queue,
field-level provenance, red → green pre-flight and WCAG 2.2 AA. ADR 0012 says every screen is built
to `docs/design/` specs from the `ux-designer` agent and every `frontend` ticket passes the
independent `ui-reviewer`. Without the specs and tokens, M1-07 and every M2 screen would invent
their own look. A judge has three minutes; the first screen must explain itself.

## Scope
1. Run the `ux-designer` agent (`.claude/agents/ux-designer.md`) with PROJECT.md and this ticket.
   It writes `docs/design/README.md`: users (AP clerk, payroll specialist, treasury analyst or ERP
   admin, small-bank ops, hackathon judge) with device, context and job; direction; principles;
   copy rules including the claims discipline ("checked against `<pack>@<version>`", never "the
   bank will accept", never an imminent Swift date).
2. Screen specs in `docs/design/screens/` (purpose; layout at 375/768/1440; components; empty,
   loading, error, partial and success states; keyboard map; copy with i18n keys; accessibility
   notes): `app-shell.md`, `sign-in-and-invite.md`, `upload-and-mapping.md`, `health-report.md`,
   `review-queue.md` (hero: keyboard map j/k/a/e/u/x, bulk approve, risk sort, virtualised),
   `record-detail.md` (field-level provenance with reason per field), `preflight.md` (per-transaction
   red → green), `export.md`. Later screens (accuracy page, attributions, privacy) get specs in
   their own tickets.
3. Record the design direction for Kiro in `.kiro/steering/design.md` (tokens, status vocabulary,
   copy rules) so Kiro and Claude Code read the same rules; log it in `docs/kiro-usage.md`. This
   ticket is design work, not a capability, so it has no `.kiro/specs/` entry.
4. Tokens and base components in `apps/web` (the design-system ticket is the one that puts them in
   code): `apps/web/src/styles/tokens.css` (colour, type, spacing, radius, focus ring; light and
   dark; colour-blind-safe status palette with contrast ≥ 4.5:1 for text), Tailwind 4.3.5 theme
   wired to the tokens, and shadcn/Radix components in `apps/web/src/components/ui/`: Button, Input,
   Select, Table, Dialog, Toast, Tooltip, Skeleton, plus project components `StatusBadge` (icon +
   label + colour, never colour alone), `ProvenanceChip` (the six kinds), `EmptyState`, `ErrorState`
   (problem+json aware), `ProgressPanel` (progress with context, never a bare spinner).
5. i18next 27.1.3 set up in `apps/web/src/i18n/` with `en` keys for every string in the components
   and specs; a test fails on any user-visible literal string in `components/`.
6. A component gallery as a separate Vite entry `apps/web/dev/gallery.html` (dev server only, not
   in the production build) showing every component in every state, for screenshots and axe.
7. LOCK: this ticket adds Tailwind, Radix/shadcn, i18next, `@testing-library/react` and
   `@axe-core/playwright` to `apps/web`. `@testing-library/react` and `@axe-core/playwright` are not
   in PROJECT.md §4: their versions are verified on the npm registry in this ticket.

## Out of scope
- Feature screens and API wiring (M1-07 and the M2 frontend tickets build them to these specs).
- Translations beyond `en` (M3-10 runs the i18n + WCAG pass). Logos of banks (ADR 0021: names as text only).

## Acceptance Criteria
1. `docs/design/README.md` and the eight screen specs exist; each spec has the sections listed in
   Scope step 2, including a keyboard map and all five states; `grep` finds no "will accept",
   "will reject" or "guarantee" in `docs/design/`.
2. `npm run test -w apps/web` passes: component tests render every component in every state, with
   keyboard focus reachable and visible for interactive ones; the no-literal-strings test passes.
3. Playwright + axe on the gallery at 375, 768 and 1440 px, light and dark, reports zero serious or
   critical violations; screenshots are saved to `.review/M1-06/`.
4. `StatusBadge` renders an icon and a text label for every status (asserted in a test), and every
   status colour pair passes 4.5:1 contrast in both themes (a token contrast test computes it).
5. `npm run build -w apps/web` output contains no gallery code (checked by searching the bundle for
   the gallery entry's marker string).
6. `.kiro/steering/design.md` exists and `docs/kiro-usage.md` has an entry for this ticket.
7. The `ui-reviewer` agent (not the builder) returns PASS on the gallery screenshots and axe results
   against `docs/design/README.md`.

## Deliverables
- `docs/design/README.md`, `docs/design/screens/{app-shell,sign-in-and-invite,upload-and-mapping,health-report,review-queue,record-detail,preflight,export}.md`
- `.kiro/steering/design.md`; `docs/kiro-usage.md` entry
- `apps/web/src/styles/tokens.css`, Tailwind config, `apps/web/src/components/ui/*.tsx`,
  `apps/web/src/components/{StatusBadge,ProvenanceChip,EmptyState,ErrorState,ProgressPanel}.tsx`
- `apps/web/src/i18n/{index.ts,en.json}`
- `apps/web/dev/gallery.html`, `apps/web/dev/gallery.tsx`
- `apps/web/test/*.test.tsx`, `apps/web/e2e/gallery-a11y.spec.ts`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
ls docs/design/screens/{app-shell,sign-in-and-invite,upload-and-mapping,health-report,review-queue,record-detail,preflight,export}.md
! grep -rniE "will (accept|reject)|guarantee" docs/design/
npm run typecheck -w apps/web
npm run lint -w apps/web
npm run test -w apps/web
npm run build -w apps/web
! grep -rq "4x35-gallery-entry" apps/web/dist/
npx playwright test -c apps/web/playwright.config.ts gallery-a11y --output "$TMPDIR/m1-06-pw"
test -f .kiro/steering/design.md && grep -q "M1-06" docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff
- M1-07 builds sign-in, accept-invite, upload, batch status, health report and export screens to
  these specs with these components; no new tokens or ad-hoc colours.
- Every M2/M3 `frontend` ticket builds to the matching spec and runs `ui-reviewer`; a screen without
  a spec gets one from `ux-designer` first.
- M3-10 adds locales and runs the full WCAG 2.2 AA pass on top of the keys created here.
