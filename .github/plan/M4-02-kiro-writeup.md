---
title: "M4-02 · Kiro usage write-up"
milestone: "M4 · Submission"
labels: ["docs", "critical"]
blocked_by: ["M3-GATE"]
estimate: "3h"
resources: []
needs: ["P-03"]
---

## Context
The rules require a Kiro usage write-up covering IDE/CLI/Web/Crew, custom agents, hooks, specs,
steering, MCP, property-based testing and powers (PROJECT.md §1 Artefacts), and "insufficient Kiro use"
is a disqualifier. Technological Implementation (20%) is judged on it. ADR 0019 lists what the project
built with and for Kiro. The raw log is `docs/kiro-usage.md` (appended by the M3-05 hook and by every
spec-driven ticket); this ticket turns it into a judge-readable account with evidence for every claim.

## Scope
1. `docs/kiro-writeup.md` with one section per feature, each saying what we did, why, and where the
   evidence is (tracked file links, screenshots in `docs/evidence/`):
   - **Specs**: the list of `.kiro/specs/<capability>/` with requirement and task counts (computed by a
     script, not typed), and one worked example (requirements in EARS → design → tasks → the PR)
   - **Steering**: the files in `.kiro/steering/` and what rule each holds (ISO 20022 address rules,
     never invent)
   - **Hooks**: the three hooks (M3-05) and evidence they fired
   - **Custom agent**: `rulepack-author`, its run and the copied-text guard
   - **MCP**: the project's own MCP server wired through `.kiro/settings/mcp.json`
   - **Property-based testing**: the properties named in specs, mapped to their fast-check test files
   - **Powers**: the 4x35 power (M3-03)
   - **Crew**: the Crew app repo (M3-04) and its own `.kiro/`
   - **IDE / CLI / Web**: which surfaces were used for what, honestly (including any surface not used)
2. `scripts/kiro-stats.mjs`: counts specs, requirements, tasks done, hooks, steering files, property
   tests and `docs/kiro-usage.md` entries, and writes `docs/evidence/kiro-stats.json`; the write-up
   quotes only these numbers.
3. Fill the README "How Kiro built it" section with a five-line summary and a link to the write-up.
4. A "Kiro and other tools" paragraph: what Kiro did and what Claude Code did, matching the README's AI
   tools disclosure.

## Out of scope
- New Kiro features or specs (anything missing is reported, not built here)
- The blog post (M4-04)

## Acceptance Criteria
1. The write-up has a section for each of: IDE, CLI, Web, Crew, custom agents, hooks, specs, steering,
   MCP, property-based testing, powers (a script checks the headings).
2. Every number in the write-up appears in `docs/evidence/kiro-stats.json` (the M4-01 claims check run
   over the write-up).
3. Every evidence link resolves to a tracked file (link check), and no link points to a path M4-CLEANUP
   untracks.
4. Every property named in a spec maps to an existing test file (the stats script fails otherwise).
5. The README "How Kiro built it" section is filled and links the write-up.

## Deliverables
- `docs/kiro-writeup.md`, `scripts/kiro-stats.mjs`, `docs/evidence/kiro-stats.json`, README section

## Validation Gate
```bash
set -euo pipefail
node scripts/kiro-stats.mjs --out docs/evidence/kiro-stats.json --check-properties
for h in IDE CLI Web Crew 'Custom agent' Hooks Specs Steering MCP 'Property-based testing' Powers; do
  grep -qiE "^## .*$h" docs/kiro-writeup.md || { echo "missing section: $h"; exit 1; }
done
node scripts/check-claims.mjs docs/kiro-writeup.md docs/evidence/claims.md
node scripts/check-links.mjs docs/kiro-writeup.md
grep -q 'docs/kiro-writeup.md' README.md
./scripts/landing-checks.sh
```

## Handoff
- **M4-04 (blog)**: the write-up is the blog's technical source.
- **M4-05 (Devpost)**: the "How we built it" text and the Kiro write-up link (Devpost field).
- **M4-03 (video)**: the 2:10–2:45 scene shows the specs, a property test, the steering and a hook from
  this write-up.
