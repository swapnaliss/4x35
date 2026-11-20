---
title: "M3-GATE · Developer surfaces and proof, re-proved from a clean state"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["gate"]
blocked_by: ["M3-01", "M3-02", "M3-03", "M3-04", "M3-05", "M3-06", "M3-07", "M3-08", "M3-09", "M3-10", "M3-11", "M3-12"]
estimate: "2h"
resources: []
needs: ["P-03"]
---

## Context
PROJECT.md §8: "M3-GATE: MCP, power, Crew app, accuracy, load test". M4 writes the README, the Kiro
write-up and the video on top of these results, so every number and every surface they will cite must
work from a clean state now (`/gate`: gates are empirical; a feature is never deferred to pass).

## Scope
Run `/gate M3-GATE`: confirm every blocker is closed, rebuild from a clean state (fresh `make up`,
migrations, seed), re-prove every AC below, check production, post the results table on the issue.

## Out of scope
- New features or fixes (a failure is logged to `BL-01` and goes back to its ticket)
- The M4 documents

## Acceptance Criteria
Re-prove, each with evidence:
1. **M3-01**: token create/use/revoke integration tests, the P-TOK properties, the authZ matrix with the
   token column, and the OpenAPI snapshot contract test pass; `/settings/tokens` passes axe.
2. **M3-02**: MCP contract and property tests pass on a fresh build; the packed tarball runs
   `4x35-mcp --version` in an empty directory.
3. **M3-03**: the power validates; its `mcp.json` command answers `tools/list` from a clean copy with
   network calls blocked; `.kiro/settings/mcp.json` starts the server; Kiro evidence exists.
4. **M3-04**: the Crew repo is public with Apache-2.0 and a tracked `.kiro/`; its CI is green on its
   default branch; the live-run evidence exists.
5. **M3-05**: hook validation and hook script tests pass; the copied-text check passes on every pack.
6. **M3-06**: `gold.jsonl` has ≥ 150 records, zero open flags, per-country n as recorded.
7. **M3-07**: `npm run eval:accuracy` is byte-identical to the committed report; invented = 0; the
   README Accuracy section matches; `/accuracy` loads without login on production.
8. **M3-08**: `evals/reports/load.json` exists with S1–S6; a quick re-run of S1 and S3 on production is
   within 20% of the recorded p95 or the gap is explained on the issue.
9. **M3-09**: `sandbox:status` on production shows 6 judge sandboxes with a successful reset in the last
   26 hours; a judge login reaches seeded data.
10. **M3-10**: `a11y.spec.ts` passes over every route, including `/privacy`, `/attributions`,
    `/accuracy` and `/settings/tokens`; the i18n check passes.
11. **M3-11**: `evals/reports/llm-live.md` exists with invented = 0 and spend ≤ $1; the CI eval passes.
12. **M3-12**: `/privacy` and `/attributions` load without login on production; P-ATTR-1 passes.
13. Every M3 capability has `.kiro/specs/<capability>/{requirements,design,tasks}.md` and a
    `docs/kiro-usage.md` entry: api-tokens, mcp-server, kiro-power, kiro-automation, accuracy-eval,
    performance, judge-sandboxes, accessibility-i18n, llm-labeller, privacy-attribution (crew-app in
    the Crew repo).
14. Earlier gates still hold: the storyboard e2e (M2-26) passes on production.

## Deliverables
- Gate result comment on the issue: the AC table with evidence, the numbers (accuracy headline per
  set, load p95s, sandbox count, live LLM spend)
- Screenshots in `.review/M3-GATE/`

## Validation Gate
```bash
set -euo pipefail
npm ci
make reset            # down with volumes, then up: migrate + seed (M0-06)
./scripts/landing-checks.sh
npm run test -w apps/server -- tokens openapi authz
npm run test:integration -- tokens sandbox purge
npm run build -w apps/mcp && npm run test -w apps/mcp
npm run build -w integrations/kiro-power && npm run validate -w integrations/kiro-power && npm run test -w integrations/kiro-power
python3 -c "import json;json.load(open('.kiro/settings/mcp.json'))"
gh repo view swapnaliss/4x35-crew --json visibility,licenseInfo -q '.visibility+" "+.licenseInfo.spdxId' | grep -qx 'PUBLIC Apache-2.0'
gh run list -R swapnaliss/4x35-crew --branch main --limit 1 --json conclusion -q '.[0].conclusion' | grep -qx success
node scripts/kiro/validate-hooks.mjs .kiro/hooks && node --test scripts/kiro/test/
npx tsx evals/hand-labelled/scripts/check-gold.ts evals/hand-labelled/v1/gold.jsonl --stats
cp evals/reports/accuracy.json "$TMPDIR/acc.json" && npm run eval:accuracy && cmp "$TMPDIR/acc.json" evals/reports/accuracy.json
npx tsx evals/accuracy/readme-snippet.ts --check README.md
node scripts/load/run.mjs --target prod --quick --scenarios S1,S3 --compare evals/reports/load.json
npm run sandbox:status -- --target prod
npx playwright test -c apps/web/playwright.config.ts apps/web/e2e/a11y.spec.ts
node -e 'const r=require("./evals/reports/llm-live.json");if(r.invented!==0||r.costUsd>1)process.exit(1)'
node scripts/licences.mjs --check && npm run test -w packages/core -- attribution
for c in api-tokens mcp-server kiro-power kiro-automation accuracy-eval performance judge-sandboxes accessibility-i18n llm-labeller privacy-attribution; do
  for f in requirements design tasks; do test -s ".kiro/specs/$c/$f.md"; done
  grep -q "$c" docs/kiro-usage.md
done
make e2e-prod
```

## Handoff
- **M4-01, M4-02, M4-03, M4-05**: the gate comment is the single source of the numbers they quote,
  with dates and commit SHAs.
