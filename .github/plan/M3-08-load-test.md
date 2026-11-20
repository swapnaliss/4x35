---
title: "M3-08 · Load test against R2/R3 on production"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["infra", "eval"]
blocked_by: ["M2-GATE"]
estimate: "4h"
resources: ["DEPLOY"]
needs: []
---

## Context
R2 (health report p95 ≤ 30 s for 500 rows and ≤ 5 min for 20,000 rows; review action p95 ≤ 300 ms;
pre-flight of 500 transactions ≤ 10 s) and R3 (≤ 20 concurrent users) are assumptions marked "A: load
test (M3-08)" in `docs/architecture.md` §1. ADR 0017 chose the 1 CPU / 2 GB Render instance on the
strength of the M0-09 spike and this test. Claims discipline: the README, accuracy page and video may
quote a speed only from this ticket's measurements. PROJECT.md §2 lists "time to clear 500 rows" as a
success metric.

## Scope
1. Write the Kiro spec `.kiro/specs/performance/{requirements.md (EARS), design.md, tasks.md}` in Kiro
   (R2/R3 as EARS requirements, the method, the pass rule) and log the session in `docs/kiro-usage.md`.
   Name the property **P-LOAD-1**: the generated load files are distinct (different sha256) so upload
   deduplication cannot hide work, and are synthetic (`npm run synth -w packages/synth -- --seed <n>
   --rows <r>` with a different seed per file).
2. `scripts/load/run.mjs` (loads `.env` itself and never prints a value; Node 24 built-ins only: `fetch`, `perf_hooks`; no new dependency) that logs
   in with `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` (the M2-26 e2e user and workspace; LLM off there),
   then runs these scenarios against `APP_BASE_URL`:
   - S1: 10 uploads of distinct 500-row CSVs → time to `ready_for_review` (p50, p95, max)
   - S2: 3 uploads of distinct 20,000-row CSVs → same timings, plus dead-letter count
   - S3: 300 review actions (approve, edit, unknown, bulk of 50) at 5 concurrent sessions → p95
   - S4: 10 pre-flights of a 500-transaction pain.001.001.09 → p95
   - S5: 20 concurrent virtual users for 5 minutes mixing S1/S3/S4 at R3 launch rates → error rate,
     p95 per endpoint
   - S6: time to clear 500 rows by a scripted keyboard-only Playwright run (bulk-approve the
     auto-approvable rows, resolve the rest with recorded decisions); reported as "scripted, excludes
     human reading time"
3. Results to `evals/reports/load.json` (key `timeToClear500Rows` for M3-07) and
   `docs/evidence/load-test.md` (method, date, commit, instance size, numbers vs targets, the Render
   memory and CPU graphs for the run window as screenshots).
4. Rehearse once locally under `docker run --cpus 1 --memory 2g` before touching production. DEPLOY is
   claimed because the run loads the one production service and database; no deploy or sandbox reset
   may run during it.
5. Clean up: every batch this run created (ids recorded by the runner) is deleted through the purge
   path at the end; batches the storyboard e2e owns are left alone.
6. A missed target is a finding, not a pass: profile it, fix it in this ticket if the fix is small and
   inside the measured path, otherwise log it to `BL-01` with the numbers and the owning ticket.

## Out of scope
- The 100× scale shape (architecture §11): described, not built or tested
- Load-testing the LLM step (LLM off for the e2e workspace, so no spend)

## Acceptance Criteria
1. `evals/reports/load.json` holds S1–S6 results with n, p50, p95 and max, the commit SHA, the date and
   the instance size.
2. Each R2 target is met on production, or the report marks it missed with the measured number and a
   `BL-01` entry link; the summary line states which (no rounding in our favour).
3. S5 error rate < 1% and zero jobs in dead-letter after S1–S5.
4. P-LOAD-1: the run asserts all upload sha256 values are distinct before starting.
5. `docs/evidence/load-test.md` includes the Render memory graph for S2 showing peak memory under the
   2 GB limit.
6. After cleanup, none of the run's batch ids exist (API check), `make e2e-prod` still passes, and
   production health is green.

## Deliverables
- `.kiro/specs/performance/requirements.md`, `design.md`, `tasks.md`; `docs/kiro-usage.md` entry
- `scripts/load/run.mjs`, `scripts/load/scenarios/*.mjs`, `scripts/load/clear-500.spec.ts`
- `evals/reports/load.json`, `docs/evidence/load-test.md`, `docs/evidence/load-test/*.png`

## Validation Gate
```bash
set -euo pipefail
python3 scripts/check-prereqs.py --ticket M3-08   # presence of E2E_USER_EMAIL / E2E_USER_PASSWORD only, never values
node scripts/load/run.mjs --target local --quick          # rehearsal against make up, 1 run per scenario
node scripts/load/run.mjs --target prod --out evals/reports/load.json
node -e 'const r=require("./evals/reports/load.json");for(const k of ["S1","S2","S3","S4","S5","S6"])if(!r[k]||r[k].n<1)process.exit(1);if(r.S5.errorRate>=0.01)process.exit(1);console.log(r.summary)'
node scripts/load/run.mjs --target prod --cleanup-check
make e2e-prod
node scripts/load/run.mjs --target prod --health        # GET /healthz on APP_BASE_URL; prints status only
./scripts/landing-checks.sh
```

## Handoff
- **M3-07 (accuracy page)**: `evals/reports/load.json` → `timeToClear500Rows` is now measured.
- **M4-01 (README)**, **M4-03 (video)**, **M4-05 (Devpost)**: the only speed numbers they may quote, with
  the date and instance size.
- **M3-GATE**: the quick run command and the report path.
