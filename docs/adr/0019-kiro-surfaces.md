# 0019. Kiro as the build tool and a product surface

- Status: accepted (2026-11-20, Approval 2)

## Context
Technological Implementation (20%) and the Crew bonus; disqualification for insufficient Kiro use.

## Decision
`.kiro/steering/` (product, ISO 20022 address rules, never-invent principle, engineering standards); one spec per capability in `.kiro/specs/` with EARS requirements and property-test properties; `.kiro/hooks/` (pack JSON saved → schema check + pack tests; core file saved → property tests; spec tasks completed → append to `docs/kiro-usage.md`); a custom agent `rulepack-author`; `.kiro/settings/mcp.json` wiring the project's own MCP server (env references only). Developer surfaces: the MCP server and a Kiro power (Agent Plugin: `plugin.json` + `mcp.json` + `skills/*/SKILL.md`) running locally over stdio with bundled packs, so no data leaves the machine; a Crew app in its own public, licensed repo (`swapnaliss/4x35-crew`) calling the public API with a scoped token. Other AI tools used in the build are disclosed in the README.

## Alternatives considered
Using Kiro only for the write-up (fails the rule's intent).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
