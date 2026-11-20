---
title: "M3-11 · Live LLM eval against the real model"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["eval", "agent"]
blocked_by: ["M2-GATE"]
estimate: "2h"
resources: ["LLM"]
needs: ["P-03", "P-04", "P-08", "P-11", "P-12", "P-14", "P-15", "P-16", "P-17", "P-37", "P-38"]
---

## Context
CI evaluates the span labeller on recorded responses only (M2-25), so it spends nothing and stays
deterministic. Architecture §10 and ADR 0020 add a separate live eval: the same suite against the real
`claude-haiku-5-5` (ADR 0014), to catch drift between recorded and live behaviour and to measure real
cost and latency. This is the dedicated live ticket for the LLM; the spend comes from the LLM budget
(≤ $1 per ticket within the $10/month cap, `resources.json`). The guardrails are binding: labels and
substrings only, each substring found exactly once in the NFC input, then the provenance checker.

## Scope
1. Update the Kiro spec `.kiro/specs/llm-labeller/` (requirements in EARS, design, tasks) with the live
   eval requirements in Kiro and log the session in `docs/kiro-usage.md`. Restate the property
   **P-LLM-1** (no value outside the input: every labelled value is a located substring) and add
   **P-LLM-2**: the live run stops before its spend exceeds the configured cap.
2. `npm run eval:live` at the root (`evals/live.ts`, next to the M2-25 suite in `evals/`): runs the M2-25 eval cases plus
   the hand-labelled records the deterministic path leaves unfinished, if M3-06 has landed (otherwise the
   M2-25 cases only, stated in the report), against the provider in `LLM_PROVIDER` / `LLM_MODEL`, with
   `LLM_BATCH_TOKEN_CAP` and a hard per-run cap of $1 enforced by the script from the token counts.
3. Report `evals/reports/llm-live.json` and `.md`: per case located / not-located / ambiguous, invented
   count (must be 0), per-field agreement with the recorded responses, tokens, cost, p50/p95 latency,
   timeouts, retries, model id and prompt version, date.
4. Drift handling: for each case where live differs from recorded, decide (a) refresh the recording
   (the live answer is better or equal and passes the provenance checker) or (b) keep the recording and
   log the regression to `BL-01`. Refreshed recordings go to a new fixture version
   `packages/llm/fixtures/v2/` (recorded with `npm run llm:record -w packages/llm`, M2-14), never an
   in-place edit of `v1`, and the CI eval is pointed at `v2` only if it passes.
5. If M0-03 confirmed Bedrock eu-central-1, run the same suite once with `LLM_PROVIDER=bedrock`
   (`AWS_REGION`) within the same $1, and report it as a separate column.

## Out of scope
- Prompt changes (a prompt change needs the CI suite green first; log ideas to `BL-01`)
- Turning the LLM on for any workspace or sandbox

## Acceptance Criteria
1. The live run completes with total spend ≤ $1 (from the report, computed from token counts) and the
   `llm_usage`-equivalent figures in the report.
2. Invented values = 0 in the live run (P-LLM-1 checked on every live response).
3. P-LLM-2: a test with a tiny cap (fixture-driven) proves the runner stops before the next call would
   exceed it.
4. `evals/reports/llm-live.md` lists every drift case and the decision taken; refreshed recordings make
   the CI suite (M2-25) pass.
5. No API key or response containing it appears in the repo (`gitleaks` clean); the report holds no
   personal data (inputs are synthetic).

## Deliverables
- `.kiro/specs/llm-labeller/*` (updated); `docs/kiro-usage.md` entry
- `evals/live.ts`, `evals/test/live-cap.test.ts`
- `evals/reports/llm-live.json`, `evals/reports/llm-live.md`; `packages/llm/fixtures/v2/` if any recording was refreshed

## Validation Gate
```bash
set -euo pipefail
python3 scripts/check-prereqs.py --ticket M3-11     # presence of the LLM key only, never values
npx vitest run evals/test/live-cap.test.ts
npm run eval:live -- --max-usd 1
node -e 'const r=require("./evals/reports/llm-live.json");if(r.invented!==0||r.costUsd>1)process.exit(1);console.log(r.costUsd,"USD")'
npm run eval
gitleaks detect --source . --no-banner
./scripts/landing-checks.sh
```

## Handoff
- **M4-01 (README)** and **M4-02 (write-up)**: live cost per record and latency, quoted only from
  `evals/reports/llm-live.md`, with the date and model.
- **M3-12 (privacy notice)**: the provider, region and model actually used, for the sub-processor list.
- **M3-GATE**: the report and the CI eval green.
