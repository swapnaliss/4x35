---
title: "M2-GATE · Core Loop gate: storyboard e2e passes on production"
milestone: "M2 · Core Loop"
labels: ["gate"]
blocked_by: ["M2-01", "M2-02", "M2-03", "M2-04", "M2-05", "M2-06", "M2-07", "M2-08", "M2-09", "M2-10", "M2-11", "M2-12", "M2-13", "M2-14", "M2-15", "M2-16", "M2-17", "M2-18", "M2-19", "M2-20", "M2-21", "M2-22", "M2-23", "M2-24", "M2-25", "M2-26"]
estimate: "3h"
resources: ["DEPLOY"]
needs: ["P-03", "P-18", "P-25", "P-26", "P-27"]
---

## Context
PROJECT.md §8: M2 closes when the storyboard e2e passes on production. M3 (MCP server, Kiro power,
Crew app, accuracy page, load test) builds on every capability of this milestone, so each one must
work from a clean state, not on a warm machine (`/gate`). Rubric: every criterion; the demo
(Presentation) and the never-invent invariant (R6) in particular.

## Scope
1. Confirm every ticket in `blocked_by` is closed.
2. Clean state locally: `make reset` (volumes removed, then up), migrations, seed (GeoNames, Japan
   Post, packs) from scratch; full test suite, property tests, integration tests and eval.
3. Deploy main to Render (DEPLOY, exclusive: the gate deploys and runs against the production
   database), confirm migrations and health, then run the storyboard e2e twice.
4. Re-prove every AC listed below and post the numbers table on the gate issue.

## Out of scope
- New features or fixes inside the gate: a failing AC goes back to its ticket (reopen it) and is
  logged on BL-01. Scope is never cut to pass.

## Acceptance Criteria
Re-prove, from the clean state, **every** Acceptance Criterion of every M2 ticket, recording
PASS/FAIL with evidence per AC:
1. **Ingest (M2-01 to M2-05)**: all ACs of each ticket as written, including CSV encoding round-trip,
   XLSX round-trip, pain.001 .03/.09/.12 SAX reading, byte splice with bytes outside `PstlAdr`
   unchanged, `<!DOCTYPE` rejected, `ds:Signature` detected, MT101 fields 50/59, and column mapping
   API + UI (with its `ui-reviewer` PASS).
2. **Rules (M2-06 to M2-09)**: all ACs, including every pack validating against the schema, each
   pack citing source URL, retrieved date and `effective_from` (or `not_set`), the per-version
   element map, and no copied guide text.
3. **Structuring (M2-10 to M2-15)**: all ACs, including country detection, transform table and
   transliteration properties, dataset values only on a unique corroborated match, every country
   parser's tests, LLM labeller ACs 1–10 on recorded fixtures, confidence properties C1–C5.
4. **Review (M2-16 to M2-19)**: health report ACs 1–8, review API ACs 1–9 (409, bulk, four-eyes,
   reopen, review action p95 ≤ 300 ms), review grid ACs 1–10, record detail ACs 1–9, each frontend
   ticket with its `ui-reviewer` PASS on file.
5. **Linking, pre-flight, export (M2-20 to M2-22)**: linking ACs 1–7, pre-flight ACs 1–8 (500
   transactions ≤ 10 s), export ACs 1–8 (round-trip, XSD-valid, hashes match).
6. **Retention (M2-23)**: ACs 1–5.
7. **Evidence and proof (M2-24 to M2-26)**: synthetic set reproduces byte-for-byte (M2-24 AC 2);
   `npm run eval` green with invented values = 0 and wrong-but-auto-approvable = 0 (M2-25); the
   storyboard e2e passes on production twice at the deployed main SHA (M2-26 ACs 1–6).
8. Every capability built in M2 has a Kiro spec in `.kiro/specs/` and a `docs/kiro-usage.md` entry.
9. Numbers table posted on the gate issue, every value from this gate's runs: rows and countries in
   the demo set; health report before/after totals; counts per Record state; auto-approvable share;
   invented values; per-field exact match (synthetic, overall); time to clear 500 rows; health report
   time for 500 rows; pre-flight time for 500 transactions; review action p95; deployed SHA; pack
   versions.

## Deliverables
- Gate comment on the M2-GATE issue with the AC table and the numbers table
- `docs/evidence/storyboard-run-<date>.json` from the gate run
- Screenshots in `.review/M2-GATE/` (gitignored)

## Validation Gate
```bash
python3 scripts/check-plan.py
make reset
npm ci
npm run db:migrate && npm run db:seed
./scripts/landing-checks.sh                     # full level: typecheck, lint, unit, property, integration, eval
npx playwright test apps/web/e2e
npm run synth -w packages/synth -- --seed 4035 --rows 500 --out "$TMPDIR/synth" && diff -r "$TMPDIR/synth" data/demo --exclude=README.md
npm run eval
! grep -rniE "will (accept|reject)" apps/web/src apps/server/src
ls .kiro/specs/
# deploy main to Render (as in M1-07 / M0-07), then:
curl -fsS "$APP_BASE_URL/healthz"
make e2e-prod
make e2e-prod
```

## Handoff
- **M3-01 to M3-12** start only after this gate passes. The gate comment's numbers table is the
  source for the README (M4-01), the accuracy page (M3-07, synthetic rows) and the video (M4-03).
- **M3-08** load-tests the same flow; **M3-09** seeds judge sandboxes from `data/demo/`.
