---
title: "M3-03 · Kiro power: local pain.001 address checks for any Kiro user"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["agent"]
blocked_by: ["M3-02"]
estimate: "4h"
resources: []
needs: []
---

## Context
A Kiro power (Agent Plugin: `plugin.json` + `mcp.json` + `skills/*/SKILL.md`, shared via GitHub, per
the M0-02 recon) lets any Kiro user check payment-file addresses locally, with no data leaving the
machine (ADR 0019). Powers are a named item in the Kiro usage write-up and the Technological
Implementation criterion (PROJECT.md §2 rubric table, §7 deliverables). It wraps the MCP server from
M3-02. This ticket also wires the project's own MCP server into the repo's `.kiro/settings/mcp.json`
so Kiro uses it while building.

## Scope
1. Write or update the Kiro spec `.kiro/specs/kiro-power/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro and log the session in `docs/kiro-usage.md`. Name the property **P-PWR-1** the power's
   `mcp.json` starts the bundled server with no network access and no env values (references only).
2. `integrations/kiro-power/`: `plugin.json` (name `4x35`, description, version, licence Apache-2.0),
   `mcp.json` (stdio command for the bundled `4x35-mcp`), and skills:
   `skills/check-payment-file/SKILL.md` (pre-flight a pain.001 against a chosen pack and explain the
   findings), `skills/structure-address/SKILL.md` (structure one 4 × 35 address, show provenance, never
   fill a field without one), `skills/explain-rule/SKILL.md`. Skill text carries the domain wording
   rules ("checked against `<pack>@<version>`", Swift date not set).
3. A build step `npm run build -w integrations/kiro-power` that copies the built MCP server and packs
   into the power directory so it installs from GitHub without `npm install` at the user's side, or
   documents the exact install command if Kiro requires one (from the M0-02 recon fixtures).
4. A structural validation script `integrations/kiro-power/scripts/validate.ts` that checks the files
   against the format recorded in M0-02 (required keys, skill frontmatter, relative paths exist).
5. `.kiro/settings/mcp.json` in this repo wiring the project's own MCP server (env references only).
6. Install and use the power in real Kiro once on a synthetic pain.001 from the M2-24 set; record the
   transcript and a screenshot in `docs/evidence/kiro-power/` (synthetic data only).

## Out of scope
- Publishing to any registry beyond the GitHub path the rules describe (M4-SUBMIT makes the repo public)
- New MCP tools (M3-02 owns the tool set)
- LLM or dataset use inside the power

## Acceptance Criteria
1. `npm run validate -w integrations/kiro-power` passes and fails on a deliberately broken copy (missing
   `plugin.json` key) in a temp directory.
2. Starting the server with the exact command in `integrations/kiro-power/mcp.json` from a clean temp
   copy of the power directory answers `tools/list` with the four M3-02 tools (scripted SDK client).
3. P-PWR-1: a test asserts `mcp.json` contains no literal env values and no URL, and the started
   process opens no socket during a `preflight_pain001` call.
4. `.kiro/settings/mcp.json` is valid JSON, tracked, references no secret values, and starts the server
   (same scripted check as AC 2 with the repo path).
5. `docs/evidence/kiro-power/` holds a screenshot and transcript of the power installed in Kiro and
   running `check-payment-file` on a synthetic file, and `docs/kiro-usage.md` links them.
6. Skill files contain no "will accept" / "will reject" wording and no imminent-date claim (grep check).

## Deliverables
- `.kiro/specs/kiro-power/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `integrations/kiro-power/{plugin.json,mcp.json,package.json,README.md}`
- `integrations/kiro-power/skills/{check-payment-file,structure-address,explain-rule}/SKILL.md`
- `integrations/kiro-power/scripts/validate.ts`, `integrations/kiro-power/test/power.test.ts`
- `.kiro/settings/mcp.json`
- `docs/evidence/kiro-power/` (screenshot, transcript)

## Validation Gate
```bash
set -euo pipefail
npm run build -w apps/mcp
npm run build -w integrations/kiro-power
npm run validate -w integrations/kiro-power
npm run test -w integrations/kiro-power
tmp=$(mktemp -d "$TMPDIR/power.XXXX") && cp -r integrations/kiro-power "$tmp/p"
node -e 'const j=require(process.argv[1]+"/plugin.json");delete j.name;require("fs").writeFileSync(process.argv[1]+"/plugin.json",JSON.stringify(j))' "$tmp/p"
if npm run validate -w integrations/kiro-power -- --dir "$tmp/p"; then echo "validator accepted a broken power"; exit 1; fi
python3 -c "import json;json.load(open('.kiro/settings/mcp.json'))"
grep -rniE 'will (accept|reject)|imminent' integrations/kiro-power/skills && exit 1 || true
ls docs/evidence/kiro-power/
./scripts/landing-checks.sh
```

## Handoff
- **M4-01 (README)** and **M4-02 (Kiro write-up)**: the install command, the screenshot path, and what
  the power does in one sentence.
- **M4-03 (video)**: the power screenshot for the "How Kiro built it" scene.
- **M3-GATE**: AC 2 and AC 3 re-run from a clean clone.
