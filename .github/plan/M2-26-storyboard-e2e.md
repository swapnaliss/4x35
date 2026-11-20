---
title: "M2-26 · Storyboard e2e (Playwright) on production"
milestone: "M2 · Core Loop"
labels: ["eval", "infra", "critical", "blocker-risk"]
blocked_by: ["M2-19", "M2-22", "M2-24"]
estimate: "4h"
resources: ["DEPLOY"]
needs: ["P-03", "P-11", "P-12", "P-18", "P-25", "P-26", "P-27"]
---

## Context
PROJECT.md §2 says the demo storyboard is "run for real at the end of M2", and the M2 gate is
"storyboard e2e passes on production" (§8). Rubric: Presentation and Best Demo; the claims
discipline (CLAUDE.md) needs measured numbers for the health report, bulk approve and time to clear
500 rows. ADR 0016 puts Playwright e2e on the core flow on main. This is the dedicated live ticket
for the core loop: it runs against the deployed Render service with synthetic data.

## Scope
1. In Kiro, write `.kiro/specs/storyboard-e2e/{requirements.md (EARS), design.md, tasks.md}` mapping
   each storyboard scene (0:35 → 2:10) to a test step, and log the session in `docs/kiro-usage.md`.
2. Deploy main to Render (DEPLOY, exclusive: this ticket deploys and writes to the production
   database), confirm migrations ran and `/healthz` is green.
3. `e2e/storyboard.spec.ts` (root Playwright project, `e2e/playwright.config.ts`, base URL from
   `APP_BASE_URL`), signing in as a dedicated e2e user in a dedicated e2e workspace on production
   (credentials from `E2E_USER_EMAIL` and `E2E_USER_PASSWORD`; the owner creates the invite once):
   1. upload `data/demo/contractors.csv`, confirm the auto-detected mapping, pick the CBPR+ pack and
      structured form;
   2. health report: read before/after totals and the per-country table; record them;
   3. review: open the seeded Japanese, Indian and German records, assert per-field provenance and
      one empty-not-guessed field; bulk-approve all auto-approvable; clear the rest by keyboard;
   4. upload `data/demo/payroll.pain.001.001.09.xml`, link to the master list, resolve the ambiguous
      links, run pre-flight against one bank pack; assert red → green counts;
   5. export: download the corrected pain.001, the corrected CSV and the audit report; verify
      sha256 against the audit report, XSD validity of the pain.001 (`xmllint-wasm`) and that the CSV
      re-imports with unchanged original columns.
4. Measurements written to `docs/evidence/storyboard-run-<date>.json`: health totals, counts per
   state, bulk-approved count, red/green counts, time to clear 500 rows, per-step wall times, the
   deployed commit SHA and pack versions. These are the numbers the video and README may use.
5. `make e2e-prod` target running the spec; screenshots and trace to `.review/M2-26/`.
6. The workflow runs this spec on main after deploy only if the e2e credentials are configured as CI
   secrets; otherwise it is run by `/gate` (documented in the spec).

## Out of scope
- The Crew app scene (M3-04) and the Kiro scene (M4-03). Video recording (M4-03). Load testing (M3-08).
- Fixing product defects found here: each goes to BL-01 with a `blocker` comment on the owning
  ticket; this ticket does not change product code.

## Acceptance Criteria
1. `make e2e-prod` passes against production at the deployed main SHA, recorded in the evidence file.
2. The evidence file contains every measurement in Scope step 4, taken from that run.
3. Time to clear 500 rows is measured and recorded (the target is under 10 minutes; a miss is
   recorded as a finding on BL-01, not hidden).
4. The downloaded artefacts' sha256 values equal the audit report's, and the corrected pain.001
   passes XSD validation.
5. No product-path mock: the run uses the real API, database and packs (the spec contains no
   `page.route` stubs; a grep proves it).
6. A second consecutive run passes too (the spec is repeatable: each run uploads into a new batch
   whose content differs only by a run ID column, so upload deduplication does not short-circuit it).

## Deliverables
- `.kiro/specs/storyboard-e2e/*`; entry in `docs/kiro-usage.md`
- `e2e/storyboard.spec.ts`, `e2e/playwright.config.ts`, `Makefile` target `e2e-prod`
- `docs/evidence/storyboard-run-<date>.json`

## Validation Gate
```bash
python3 scripts/check-prereqs.py --ticket M2-26
make e2e-prod
make e2e-prod                                          # repeatable
! grep -n "page.route" e2e/storyboard.spec.ts
ls docs/evidence/storyboard-run-*.json
```

## Handoff
- **M2-GATE** re-runs `make e2e-prod` from a clean deploy.
- **M3-08** reuses the flow for the load test; **M4-01/M4-03** take every number from the evidence
  file, never from memory.
- **M0-00 owner list**: the e2e user and workspace on production, and the two env vars.
