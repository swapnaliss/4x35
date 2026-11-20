---
title: "M1-GATE · Walking skeleton runs on production from a clean state"
milestone: "M1 · Walking Skeleton"
labels: ["gate"]
blocked_by: ["M1-01", "M1-02", "M1-03", "M1-04", "M1-05", "M1-06", "M1-07", "M1-08"]
estimate: "2h"
resources: ["DEPLOY"]
needs: []
---

## Context
PROJECT.md §8: M1 passes when the thin slice runs on production from a clean state. M2 builds every
format, pack, structuring step and the review loop on this skeleton, so a skeleton that only works
on a warm machine would sink the storyboard at M2-GATE. Run with `/gate M1-GATE`.

## Scope
1. Confirm M1-01 to M1-08 are closed.
2. From a clean state: `make down` with volumes removed, `make up`, migrations, seed, then every
   check below, verbatim.
3. Deploy main to Render (DEPLOY: the gate redeploys production and runs its migrations) and re-run
   the slice against production.
4. Re-prove every Acceptance Criterion listed below and post the result table on the gate issue.

## Out of scope
- Fixing anything: a failing AC fails the gate and goes to `BL-01` with the owning ticket named.
- The post-gate backlog sweep (gate.md step 8; never part of the pass).

## Acceptance Criteria
1. Clean install and stack: `npm ci`, `make up`, `npm run db:migrate` (twice: second is a no-op),
   `npm run db:seed` succeed on emptied volumes.
2. `./scripts/landing-checks.sh` (full) passes: typecheck, lint, unit, property, integration.
3. M1-01 re-proved: every domain-core property (`P-never-invent`, `P-span-exact`,
   `P-transform-replays`, `P-no-truncation`, `P-not-auto-approvable`, `P-proposal-deterministic`,
   `P-batch-transitions`, `P-record-transitions`) runs at ≥ 1,000 runs and passes; the core purity
   test passes.
4. M1-02 re-proved: unique batch constraint, append-only triggers, cascade delete and
   `P-entity-roundtrip` pass; `drizzle-kit check` shows no drift.
5. M1-03 re-proved: the authZ matrix test passes with every route classified;
   `P-cross-workspace-denied` and `P-csrf-required` pass; only hashes of sessions and tokens are stored.
6. M1-04 re-proved: rollback enqueues nothing; `P-chunking-covers-once`, `P-handler-idempotent`,
   `P-idempotency-key-replay` pass; a failing job dead-letters after 4 attempts.
7. M1-05 re-proved: `P-logs-carry-no-content` passes; `/readyz` 200 with the stack up and 503 with
   Postgres stopped; `job_timings` rows written.
8. M1-06 re-proved: gallery axe run has zero serious/critical violations; no gallery code in the
   production bundle; design specs present.
9. M1-07 re-proved locally: the Playwright slice passes (upload → `ready_for_review` → health report
   "checked against core-minimal@0.1.0" → export, original sha256 unchanged); `P-upload-dedup`,
   `P-original-bytes-unchanged`, `P-country-span-only` pass.
10. M1-08 re-proved: guard fixtures rejected; `P-escape-cell-safe`, `P-audit-hash-stable`,
    `P-rate-limit-bound` pass; the sixth login in a minute gets 429; security headers present.
11. Production: after deploying main, `GET $APP_BASE_URL/readyz` returns 200 and the Playwright slice
    passes against `APP_BASE_URL`; the Render deploy log shows migrations applied.
12. Every M1 capability has `.kiro/specs/<capability>/` (`domain-core`, `persistence`, `identity`,
    `jobs`, `observability`, `ingest`, `health-report`, `export`, `security-baseline`),
    `.kiro/steering/design.md` exists, and `docs/kiro-usage.md` has an entry for M1-01 to M1-08.
13. The gate comment records: test counts, property-run counts, slice duration locally and on
    production, and the production URL checked.

## Deliverables
- A gate result comment on the M1-GATE issue (AC table with PASS/FAIL and evidence)
- Screenshots in `.review/M1-GATE/` (gitignored)

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
git checkout main && git pull --ff-only
make down; docker compose down -v
npm ci
make up
npm run db:migrate
npm run db:migrate
npm run db:seed
./scripts/landing-checks.sh
FC_NUM_RUNS=1000 npm run test -w packages/core -- --reporter=verbose | tee "$TMPDIR/m1-gate-core.log"
npm run test:integration -- --reporter=verbose | tee "$TMPDIR/m1-gate-int.log"
for p in P-never-invent P-span-exact P-transform-replays P-no-truncation P-not-auto-approvable \
         P-proposal-deterministic P-batch-transitions P-record-transitions P-entity-roundtrip \
         P-cross-workspace-denied P-csrf-required P-chunking-covers-once P-handler-idempotent \
         P-idempotency-key-replay P-logs-carry-no-content P-upload-dedup P-original-bytes-unchanged \
         P-country-span-only P-escape-cell-safe P-audit-hash-stable P-rate-limit-bound; do
  cat "$TMPDIR"/m1-gate-*.log | grep -q "$p" || { echo "missing $p"; exit 1; }
done
npx drizzle-kit check --config packages/db/drizzle.config.ts
npm run build -w apps/web && ! grep -rq "4x35-gallery-entry" apps/web/dist/
npx playwright test -c apps/web/playwright.config.ts gallery-a11y thin-slice --output "$TMPDIR/m1-gate-local"
for c in domain-core persistence identity jobs observability ingest health-report export security-baseline; do
  test -f ".kiro/specs/$c/requirements.md" || { echo "missing spec $c"; exit 1; }
done
test -f .kiro/steering/design.md
for t in M1-01 M1-02 M1-03 M1-04 M1-05 M1-06 M1-07 M1-08; do grep -q "$t" docs/kiro-usage.md || { echo "no Kiro log for $t"; exit 1; }; done
# production (DEPLOY held): deploy main through the M0-07 pipeline first
curl -fsS "$APP_BASE_URL/readyz"
E2E_BASE_URL="$APP_BASE_URL" npx playwright test -c apps/web/playwright.config.ts thin-slice --output "$TMPDIR/m1-gate-prod"
```

## Handoff
- On PASS, M2 opens: M2-01, M2-03, M2-04, M2-06 and M2-23 are unblocked (`/start-milestone 2` after
  `python3 scripts/waves.py 2`).
- The gate comment's slice timings are the baseline M3-08's load test compares against.
