---
title: "M3-07 · Accuracy report in CI + public accuracy page"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["eval", "frontend"]
blocked_by: ["M3-06"]
estimate: "5h"
resources: []
needs: []
---

## Context
PROJECT.md §2 success metric: invented values = 0; per-field exact match and all-mandatory-fields-
correct rate, led by the hand-labelled set (M3-06), the synthetic set (M2-24) reported apart, n per
country; auto-approvable share at the chosen threshold; time to clear 500 rows. These are shown in the
README and on the app's accuracy page (rubric: Potential Impact and Innovation). Claims discipline: no
number anywhere without a measurement in the repo. Accuracy for countries with little open data is
measured and published, not claimed (PROJECT.md §9).

## Scope
1. Update the Kiro spec `.kiro/specs/accuracy-eval/` (scoring and report part) in Kiro and log the
   session in `docs/kiro-usage.md`. Name these properties: **P-ACC-1** scoring is deterministic (same
   set + same code + same pack versions → identical report bytes); **P-ACC-2** the invented-values count
   is the number of proposed values with no valid provenance, and the CI job fails if it is above 0.
2. `evals/accuracy/score.ts` (`npm run eval:accuracy`, reusing the M2-25 harness in `evals/run.ts`):
   runs the structuring pipeline (deterministic path; LLM off, so CI spends nothing) over
   `evals/hand-labelled/v1/gold.jsonl` and the M2-24 synthetic set in `data/demo/`, per target form, and writes `evals/reports/accuracy.json` and `evals/reports/accuracy.md` with:
   per-field exact match, all-mandatory-correct rate, auto-approvable share at the configured threshold
   and its precision (share of auto-approvable records that are fully correct), invented count, each
   per country with n, and the git SHA and pack versions. Countries with n < 10 are marked "small
   sample".
3. CI job (in the existing workflow) runs `eval:accuracy` on PRs, fails on invented > 0, and posts the
   markdown table as the job summary; the report on `main` is committed by the ticket and refreshed by
   later tickets that change structuring.
4. Public route `/accuracy` in `apps/web` (no login: it holds no personal data) reading
   `GET /api/v1/accuracy` (serves the committed `accuracy.json`). It shows the hand-labelled results
   first, the synthetic results separately, n per country, the date and commit, and plain-language
   notes on what "exact match" means. "Time to clear 500 rows" shows the M3-08 measurement when that
   file exists and "not yet measured" otherwise.
5. Fill the README **Accuracy** section from `accuracy.md` (numbers copied by a script
   `evals/accuracy/readme-snippet.ts`, not by hand).

## Out of scope
- Live LLM accuracy (M3-11 reports it separately)
- Improving parsers to raise numbers (log gaps to `BL-01` with the country and n)

## Acceptance Criteria
1. `npm run eval:accuracy` writes both report files; running it twice gives byte-identical output
   (P-ACC-1 test).
2. The invented count is 0 on both sets; a test feeding one value with no provenance makes the job exit
   non-zero (P-ACC-2).
3. The report has a row per country for every country in either set, with n, and the hand-labelled and
   synthetic results are in separate tables.
4. The README Accuracy section matches `accuracy.md` exactly (a check script diffs them).
5. `/accuracy` renders the committed report; it has loading, empty ("no report yet") and error states;
   every string is an i18n key; tables have header cells and captions; it works by keyboard alone; axe
   reports no WCAG 2.2 AA violations; `ui-reviewer` returns PASS.
6. The page and the report contain no wording that claims bank acceptance ("checked against
   `<pack>@<version>`" only).

## Deliverables
- `.kiro/specs/accuracy-eval/*` (updated); `docs/kiro-usage.md` entry
- `evals/accuracy/{score.ts,readme-snippet.ts}`, `evals/accuracy/test/*.test.ts`
- `evals/reports/accuracy.json`, `evals/reports/accuracy.md`
- `apps/server/src/accuracy/route.ts`, `apps/web/src/routes/accuracy.tsx`, i18n keys
- CI workflow step; README Accuracy section

## Validation Gate
```bash
set -euo pipefail
npm run eval:accuracy
cp evals/reports/accuracy.json "$TMPDIR/a1.json" && npm run eval:accuracy && cmp "$TMPDIR/a1.json" evals/reports/accuracy.json
node -e 'const r=require("./evals/reports/accuracy.json");if(r.handLabelled.invented!==0||r.synthetic.invented!==0)process.exit(1)'
npx vitest run evals/accuracy
npx tsx evals/accuracy/readme-snippet.ts --check README.md
npm run test -w apps/web -- accuracy
grep -niE 'will (accept|reject)' evals/reports/accuracy.md apps/web/src/routes/accuracy.tsx && exit 1 || true
./scripts/landing-checks.sh
```

## Handoff
- **M3-08 (load test)**: write the 500-row time to `evals/reports/load.json` under the key the page reads
  (`timeToClear500Rows`), and the page shows it.
- **M4-01 (README)**, **M4-03 (video)**, **M4-05 (Devpost)**: quote numbers only from
  `evals/reports/accuracy.md`, with n.
- **M3-GATE**: `npm run eval:accuracy` from a clean state.
