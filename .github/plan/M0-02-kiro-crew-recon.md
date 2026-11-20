---
title: "M0-02 · Kiro + Crew recon spike: specs, steering, hooks, agents, MCP, powers and PBT on real Kiro; Crew SDK fixtures"
milestone: "M0 · Recon & Bootstrap"
labels: ["recon", "agent", "blocker-risk", "critical"]
blocked_by: ["M0-00"]
estimate: "4h"
resources: []
needs: ["P-03", "P-06", "P-10", "P-11", "P-13", "P-29"]
---

## Context

Technological Implementation is 20% of the rubric and is judged on Kiro use; "insufficient Kiro
use" and a missing or ignored `/.kiro` are disqualifiers (`PROJECT.md` §1). ADR 0019 commits to
specs, steering, hooks, a custom agent (`rulepack-author`), `.kiro/settings/mcp.json`, a Kiro power
and a Crew app. Everything known about their formats so far comes from docs read on 16 Nov
(`docs/research/notes/kiro.md`), not from running Kiro. This spike runs each surface once on the
installed Kiro so M0-10, M3-02, M3-03, M3-04 and M3-05 build on verified formats.

Risk from `PROJECT.md` §10: the Crew SDK (`@kirocrew/app-sdk`) is supplied by the Crew runtime and
is not on npm, so the Crew app cannot be tested locally unless fixtures are recorded here.

The spike runs in a scratch workspace under `$TMPDIR/kiro-spike`, so `/.kiro` in the repo stays
clean for M0-10. Credits are scarce (free tier, 50 credits until the free credits arrive), so the
spike measures credit cost per action.

## Scope

1. Record the installed versions: Kiro IDE, Kiro CLI, KiroCrew; the plan and credits remaining.
2. Use the Kiro CLI (logged in by the owner) for every step it supports. A step only the IDE
   supports is written as an exact click path; the owner runs it and the worker attaches the
   evidence (screenshot or exported file) under `docs/recon/m0-02/` (gitignored).
3. In `$TMPDIR/kiro-spike` (a throwaway git repo with a tiny TypeScript function, for example a
   postcode-shape check written for the spike), verify each surface and record path, file format,
   a minimal working example, the trigger or activation behaviour, and the doc URL:
   - **Spec**: `.kiro/specs/<name>/{requirements.md,design.md,tasks.md}`; EARS requirements; how a
     task is run and marked done; what Kiro writes back
   - **Property-based testing**: generate a property test from an EARS requirement; record the
     library Kiro picks for TypeScript and whether the result runs under vitest 5.1.0 with
     fast-check 4.10.2; what Kiro does when a property fails
   - **Steering**: front matter fields and inclusion modes (always, file match, manual)
   - **Hooks**: file format and location, the triggers available (file saved, task completed,
     prompt submit, agent stop), and one hook that runs a shell command on file save, with its
     output captured
   - **Custom agent**: Markdown agent format in `.kiro/agents/`, tool scoping
   - **MCP settings**: `.kiro/settings/mcp.json` with a stdio server and env references (no values)
   - **Power**: the Agent Plugin layout (`plugin.json`, `mcp.json`, `skills/*/SKILL.md`) imported
     from a local path; whether it activates
4. Credits: read the credit balance before and after each action; record the cost per action and a
   plan for the remaining free credits (which M0-10 and M1 spec tasks they can cover).
5. **Crew**: install KiroCrew locally, scaffold a hello app (`app.json` manifest + `defineApp` from
   `@kirocrew/app-sdk`) that calls `fetch()` against a local HTTP echo server
   (`python3 -m http.server` or a 10-line Node server in `$TMPDIR`), load it into Crew and record as
   JSON fixtures in `fixtures/kiro-crew/`:
   - `manifest-validation.json`: Crew's validation output for the hello manifest
   - `app-context.json`: the shape of the context object the SDK passes to the app (keys and
     types; any user-identifying values replaced with synthetic ones)
   - `fetch-roundtrip.json`: the outbound request and response the app made
   - `README.md`: Crew version, how each fixture was captured, and whether the SDK can be imported
     outside the Crew runtime
6. Findings in `docs/recon/m0-02-kiro-crew.md` (gitignored), each marked "verified on Kiro
   `<version>` on `<date>`" or "not verified: `<reason>`".
7. Start `docs/kiro-usage.md` (tracked; M4-02 builds the write-up from it): one entry per Kiro
   action in this spike (date, surface, what ran, credits used).

## Out of scope

- Writing the project's steering or specs (M0-10), hooks and agent (M3-05), MCP server (M3-02),
  power (M3-03) or Crew app (M3-04)
- Anything inside the repo's `/.kiro` directory
- Buying Kiro Pro (owner decision, tracked by M0-00)

## Acceptance Criteria

1. `docs/recon/m0-02-kiro-crew.md` exists, is gitignored, and has a section for each of: spec,
   PBT, steering, hooks, custom agent, MCP settings, power, Crew; each section marked "verified on
   Kiro `<version>`" or "not verified: `<reason>`".
2. A hook in the scratch workspace ran a shell command on file save; its captured output is quoted
   in the findings.
3. A Kiro-generated property test from an EARS requirement ran under vitest with fast-check
   (exit 0 when the property holds, non-zero after a deliberate bug); the commands and outputs are
   in the findings.
4. Credit cost per action is recorded, with the remaining-credit plan.
5. `fixtures/kiro-crew/{manifest-validation.json,app-context.json,fetch-roundtrip.json}` exist and
   parse as JSON; `fixtures/kiro-crew/README.md` states the Crew version and capture method.
6. Fixtures contain no secret, token or real personal data (`./scripts/check-no-secrets.sh` passes;
   grep for `Authorization` and `token` values finds none).
7. `docs/kiro-usage.md` exists and has at least one entry per verified surface.
8. The repo's `/.kiro` directory is unchanged by this ticket (`git diff --stat -- .kiro` is empty).

## Deliverables

- `fixtures/kiro-crew/manifest-validation.json`, `fixtures/kiro-crew/app-context.json`,
  `fixtures/kiro-crew/fetch-roundtrip.json`, `fixtures/kiro-crew/README.md`
- `docs/kiro-usage.md`
- `docs/recon/m0-02-kiro-crew.md` and `docs/recon/m0-02/` evidence (gitignored)

## Validation Gate

```bash
test -s docs/recon/m0-02-kiro-crew.md && git check-ignore -q docs/recon/m0-02-kiro-crew.md && echo "findings ok"
for s in Spec PBT Steering Hooks "Custom agent" "MCP settings" Power Crew; do grep -q "^## $s" docs/recon/m0-02-kiro-crew.md && echo "section $s" || echo "MISSING $s"; done
grep -cE 'verified on Kiro|not verified:' docs/recon/m0-02-kiro-crew.md      # expect >= 8
for f in manifest-validation app-context fetch-roundtrip; do jq -e . fixtures/kiro-crew/$f.json >/dev/null && echo "json $f"; done
test -s fixtures/kiro-crew/README.md
grep -riE '"(authorization|x-api-key|cookie)"\s*:\s*"[^"<]' fixtures/kiro-crew | wc -l   # expect 0
test -s docs/kiro-usage.md
git diff --stat -- .kiro | wc -l                                              # expect 0
./scripts/landing-checks.sh
```

## Handoff

- **M0-10**: verified steering front matter and inclusion modes, spec layout, EARS style, the PBT
  library and how Kiro runs spec tasks; the credit cost per spec action.
- **M3-05**: hook format and triggers (with the working example), custom agent format.
- **M3-02 / M3-03**: `.kiro/settings/mcp.json` shape with env references; power layout and import
  behaviour.
- **M3-04**: the three Crew fixtures and whether the SDK runs outside Crew (decides how its tests
  replay them).
- **M4-02**: `docs/kiro-usage.md` started; every later Kiro action appends to it.
- If a surface cannot be verified (credits, missing feature), log it to BL-01 with the owner
  ticket that depends on it.
