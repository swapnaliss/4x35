---
title: "M3-12 · Privacy notice + attributions page"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["docs", "frontend", "security"]
blocked_by: ["M2-GATE"]
estimate: "2h"
resources: []
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
Addresses are personal data under GDPR and India's DPDP law (R5, PROJECT.md §9.1), so the product needs
a privacy notice that matches what the code does: 30-day purge, audit hashes kept, backups, the opt-in
LLM sub-processor (ADR 0014, ADR 0023). ADR 0021 requires a NOTICE file and an in-app attributions page
for chromium-i18n and GeoNames (CC-BY 4.0) and Japan Post data; third-party IP used outside its licence
is a disqualifier (PROJECT.md §1). Both pages are reachable without login so judges and future users can
read them.

## Scope
1. Write the Kiro spec `.kiro/specs/privacy-attribution/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro and log the session in `docs/kiro-usage.md`. Name the property **P-ATTR-1**: every dataset
   loaded by a seed or bundled in a package has an entry on the attributions page and in `NOTICE`, with
   licence and source URL.
2. `/privacy` (public route): who runs the service, what is processed (uploaded lists and payment files,
   account emails), purpose, the 30-day purge and what is kept (audit hashes), Render Frankfurt hosting
   and its daily backups (and how long backups persist per the Render plan), the Anthropic API as an
   opt-in sub-processor (provider and region from M3-11/M0-03), no tracking or analytics cookies, the
   session cookie, judge sandboxes, contact, and "the hosted demo holds synthetic data only". Plain
   English; not presented as legal advice.
3. `/attributions` (public route): chromium-i18n address metadata (CC-BY 4.0), GeoNames postal codes
   (CC-BY 4.0), Japan Post data (its terms), ISO 20022 schemas (per the M0-04 licence finding), bank
   names as text with no logos and "rules encoded from public guides; no guide text copied", and the
   open-source licences of the production dependencies.
4. `scripts/licences.mjs` generates `apps/web/src/generated/licences.json` from installed production
   dependencies' `package.json` licence fields (no new dependency) at build time.
5. A data-source registry `packages/core/src/attribution/sources.ts` (id, name, licence, URL, used by)
   that the page, `NOTICE` check and seed scripts reference.
6. Links to both pages from the app footer and the login screen.

## Out of scope
- A DPA template or terms of service (future upgrade path, PROJECT.md §9.1)
- Cookie banner (no non-essential cookies are set)

## Acceptance Criteria
1. P-ATTR-1 test: every dataset id referenced by the seed scripts and bundled packs is in the registry,
   in `NOTICE`, and rendered on `/attributions`.
2. The privacy page's retention number, purge behaviour and sandbox exemption are read from the same
   config constants the purge job uses (a test fails if they diverge).
3. `licences.json` lists every production dependency with a licence; any dependency without an OSI or
   permissive licence fails the build.
4. Both routes load without a session (e2e), have loading/error states where they fetch, use i18n keys
   only, work by keyboard, pass axe with no WCAG 2.2 AA violations, and `ui-reviewer` returns PASS.
5. Neither page says the bank will accept anything or presents a Swift date as set.

## Deliverables
- `.kiro/specs/privacy-attribution/requirements.md`, `design.md`, `tasks.md`; `docs/kiro-usage.md` entry
- `apps/web/src/routes/{privacy,attributions}.tsx`, i18n keys, footer and login links
- `packages/core/src/attribution/sources.ts`, `scripts/licences.mjs`, `apps/web/src/generated/licences.json`
- `NOTICE` (updated), tests for P-ATTR-1 and the retention constant

## Validation Gate
```bash
set -euo pipefail
node scripts/licences.mjs --check
npm run test -w packages/core -- attribution
npm run test -w apps/web -- privacy attributions
npx playwright test -c apps/web/playwright.config.ts --grep "public pages"
grep -niE 'will (accept|reject)' apps/web/src/i18n/en.json && exit 1 || true
./scripts/landing-checks.sh
```

## Handoff
- **M3-10**: add `/privacy` and `/attributions` to `a11y.spec.ts` if it lands after this ticket.
- **M4-01 (README)** and **M4-05 (Devpost)**: link both pages; the data-sources line comes from the
  registry.
- **M4-CLEANUP**: `NOTICE` and the registry are public files and stay tracked.
