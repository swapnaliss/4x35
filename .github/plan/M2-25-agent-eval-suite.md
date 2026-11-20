---
title: "M2-25 · Agent eval suite in CI"
milestone: "M2 · Core Loop"
labels: ["eval", "agent", "infra"]
blocked_by: ["M2-14", "M2-24"]
estimate: "4h"
resources: []
needs: []
---

## Context
Engineering standards (agent architecture §5 and "Rules for every ticket"): a prompt, model or
schema change merges only with the eval suite green. ADR 0020 and architecture §10 put the LLM eval
on recorded responses in CI (live eval is M3-11). The success metric "invented values = 0" is
enforced here as a CI failure. This ticket also produces the synthetic-set structuring report
(reported apart from the hand-labelled set, n per country) that M3-07 publishes.

## Scope
1. In Kiro, write `.kiro/specs/evals/{requirements.md (EARS), design.md, tasks.md}` and log the
   session in `docs/kiro-usage.md`.
2. `evals/run.ts` (`npm run eval` at the root, the script `scripts/landing-checks.sh` already calls):
   runs the full structuring pipeline over `data/demo/` (M2-24) with the LLM step replaying
   `packages/llm/fixtures/v1/` (M2-14) and no network, then scores against `data/demo/gold.jsonl`.
   A harness-only `--inject-fault <name>` option wraps pipeline stages inside the eval process to
   prove the gates catch regressions.
3. Metrics, per country with n and overall, labelled `synthetic`:
   - invented values (any proposed value without valid provenance, or a `span` not reproducible from
     the input) — **must be 0**;
   - per-field exact match; all-mandatory-fields-correct rate; auto-approvable share at the default
     threshold; wrong-but-auto-approvable count (an auto-approvable record with any field ≠ gold);
   - LLM-specific: schema-valid rate, substring-unique rate, labels accepted vs rejected, and the
     fallback-to-review rate on the adversarial fixtures.
4. Adversarial cases in `evals/adversarial/`: prompt-injection lines, a response with a paraphrased
   value, a response with an extra field, an empty response, a timeout fixture. Each must end in
   `needs_review` with no invented value.
5. `evals/baseline.json` (committed): the metrics of the first green run. CI fails if invented > 0,
   wrong-but-auto-approvable > 0, any adversarial case passes through, or per-field exact match
   overall drops more than 2 percentage points below the baseline. Updating the baseline is a
   reviewed change in the same PR as the code that moves it.
6. Output `evals/out/report.json` and `evals/out/report.md` (gitignored; uploaded as a CI artefact).
7. `.github/workflows/ci.yml`: an `eval` job on every PR (fixtures only, no secrets), within the
   PR CI budget of ≤ 5 min (R10).

## Out of scope
- The hand-labelled set and the public accuracy page (M3-06, M3-07). Live LLM calls (M3-11).
  Changing parsers to improve numbers (log gaps to BL-01 with the country and n).

## Acceptance Criteria
1. `npm run eval` exits 0 on main's code and writes `evals/out/report.json` with per-country rows
   (n, exact match, all-mandatory rate, auto-approvable share) for all 30 countries.
2. The report shows invented values = 0 and wrong-but-auto-approvable = 0.
3. `npm run eval -- --inject-fault non-unique-substring` (a harness-only option that wraps the
   locator inside the eval process; product code has no such flag) exits non-zero with the failing
   metric named.
4. Every adversarial case ends in `needs_review` with no invented value (listed in the report).
5. The eval runs with the network disabled (the test runner sets no API key and blocks outbound
   sockets) and takes ≤ 90 s locally (measured and printed).
6. The CI `eval` job runs on a PR and the whole PR workflow stays ≤ 5 min (run time from the
   Actions run recorded in the done note).

## Deliverables
- `.kiro/specs/evals/*`; entry in `docs/kiro-usage.md`
- `evals/{run.ts,score.ts,baseline.json}`, `evals/adversarial/*.json`, `evals/test/*.test.ts`
- root `package.json` script `eval`; `.gitignore` entry for `evals/out/`
- `.github/workflows/ci.yml` (eval job)

## Validation Gate
```bash
npm run eval
node -e 'const r=require("./evals/out/report.json"); if(r.overall.invented!==0||r.overall.wrongAutoApprovable!==0) process.exit(1); console.log(Object.keys(r.countries).length)'   # 30
npx vitest run evals/test
if npm run eval -- --inject-fault non-unique-substring; then echo "fault not caught"; exit 1; fi
```

## Handoff
- **M3-07** reads `evals/out/report.json` (publish its schema in the done note) and shows the
  synthetic rows apart from the hand-labelled rows.
- **M3-11** reuses `evals/run.ts` with live calls under the LLM budget.
- **M2-GATE** and every later prompt/model change run `npm run eval`.
