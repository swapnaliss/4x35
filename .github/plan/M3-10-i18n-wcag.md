---
title: "M3-10 · i18n completeness + WCAG 2.2 AA pass over every screen"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["frontend"]
blocked_by: ["M2-GATE"]
estimate: "4h"
resources: []
needs: []
---

## Context
Design is 20% of the rubric, and PROJECT.md §2 names a keyboard-first review queue and WCAG 2.2 AA.
R7 requires i18n keys and WCAG 2.2 AA; ADR 0012 and ADR 0018 make every screen keyboard-usable with
empty, loading and error states and every string an i18n key. Each frontend ticket was reviewed alone;
this ticket checks the whole app at once, after M2, so gaps between screens are found before judging.

## Scope
1. Write the Kiro spec `.kiro/specs/accessibility-i18n/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro and log the session in `docs/kiro-usage.md`. Name the property **P-I18N-1**: every key used in
   `apps/web/src` exists in `en.json`, and no JSX text node or user-visible attribute (`aria-label`,
   `title`, `placeholder`, `alt`) is a string literal.
2. `apps/web/scripts/check-i18n.ts`: static check for P-I18N-1 (TypeScript compiler API), added to the
   web workspace's `lint` script.
3. A pseudo-locale `en-XA` (accented, 35% longer) generated from `en.json`, selectable with `?lng=en-XA`,
   to prove layouts survive longer strings without truncating data values.
4. Address values are rendered with `dir="auto"` and `lang` where known, so Arabic, CJK, Devanagari and
   Cyrillic inputs display correctly (R7).
5. Playwright + axe run over every route and every state (empty, loading, error, populated) at 375,
   768 and 1440 px, light and dark: `apps/web/e2e/a11y.spec.ts` with `@axe-core/playwright` (version
   verified on the npm registry in this ticket), tags `wcag2a, wcag2aa, wcag21aa, wcag22aa`.
6. Manual checks the tools cannot make, recorded in `docs/evidence/accessibility.md`: full storyboard by
   keyboard only (no mouse), visible focus everywhere, focus not obscured by sticky headers or the
   sandbox banner (2.4.11), target size ≥ 24 px (2.5.8), no drag-only action (2.5.7), login allows paste
   and password managers (3.3.8), screen reader pass (Orca or NVDA) on the review grid and record detail.
7. Fix every violation found in the screens' own components; record each fix in the evidence file.

## Out of scope
- Translating the UI into other languages (the pseudo-locale proves readiness; no translation claims)
- Redesigning screens (follow `docs/design/`; a design gap goes to `BL-01` for `ux-designer`)

## Acceptance Criteria
1. `npm run lint -w apps/web` includes the i18n check and passes; it fails on a planted literal in a
   temp copy of one component.
2. axe reports zero violations for every route × state × width × theme in `a11y.spec.ts`; the run's
   JSON is saved to `.review/M3-10/`.
3. The storyboard e2e (M2-26, `e2e/storyboard.spec.ts`) passes locally with `?lng=en-XA`, and no address value is cut off (a test asserts
   each rendered value equals its source string).
4. A record with Arabic lines and one with Japanese lines render with `dir="auto"` and the correct
   reading order (Playwright screenshot assertion).
5. `docs/evidence/accessibility.md` lists each manual check with PASS and evidence (screenshot or note),
   including the keyboard-only storyboard run.
6. `ui-reviewer` returns PASS on the full screenshot set (all screens), with screenshots in
   `.review/M3-10/`.

## Deliverables
- `.kiro/specs/accessibility-i18n/requirements.md`, `design.md`, `tasks.md`; `docs/kiro-usage.md` entry
- `apps/web/scripts/check-i18n.ts`, `apps/web/src/i18n/en-XA.json` (generated) and its generator
- `apps/web/e2e/a11y.spec.ts`; component fixes in `apps/web/src/**`
- `docs/evidence/accessibility.md`

## Validation Gate
```bash
set -euo pipefail
npm run lint -w apps/web
tmp=$(mktemp -d "$TMPDIR/i18n.XXXX") && cp -r apps/web "$tmp/web"
printf 'export const Planted = () => <p>Hard coded text</p>;\n' > "$tmp/web/src/Planted.tsx"
if npx tsx apps/web/scripts/check-i18n.ts --root "$tmp/web/src"; then echo "literal not caught"; exit 1; fi
npx playwright test -c apps/web/playwright.config.ts apps/web/e2e/a11y.spec.ts
PLAYWRIGHT_LNG=en-XA npx playwright test -c e2e/playwright.config.ts e2e/storyboard.spec.ts   # against the local stack
./scripts/landing-checks.sh
```

## Handoff
- **M3-12 (privacy and attribution pages)**: runs in parallel; whichever lands second adds the
  `/privacy` and `/attributions` routes to `a11y.spec.ts`, and both pass the i18n check.
- **M4-01 (README)**: the accessibility statement may cite `docs/evidence/accessibility.md` only.
- **M3-GATE**: `a11y.spec.ts` is the WCAG proof.
