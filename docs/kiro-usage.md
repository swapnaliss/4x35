# Kiro usage log

One entry per Kiro action, appended by every ticket that uses Kiro (CLAUDE.md: "log Kiro use"). M4-02 builds the
submission write-up from this file. Credits are read with `kiro-cli chat --no-interactive --trust-workspace "/usage"`
before and after each action. That read costs no credits. The balance has 2 decimals and can lag by one session.

Columns: date · ticket · surface · what ran · Kiro version · credits used · balance after (`kiroween26` pool of 4,000).

| Date | Ticket | Surface | What ran | Kiro | Credits | Balance |
|---|---|---|---|---|---|---|
| 2026-11-24 | M0-02 | Spec | `--mode spec` created `postcode-shape` in a scratch workspace: EARS `requirements.md`, `design.md`, `tasks.md` (3 tasks), with Kiro's refinement sub-agent | CLI 3.5.0 | 4.42 | 4.58 |
| 2026-11-24 | M0-02 | Spec + PBT | Ran all 3 spec tasks. Kiro wrote example tests and 2 fast-check property tests (idempotence, normalisation invariance) under vitest 5.1.0 and marked the tasks `[x]` | CLI 3.5.0 | 2.09 | 6.67 |
| 2026-11-24 | M0-02 | Steering, MCP settings, Hooks | One session: `inclusion: always` steering in context; workspace `.kiro/settings/mcp.json` stdio server called with a `${VAR}` env reference; `SessionStart` and `Stop` hooks fired | CLI 3.5.0 | 0.86 | 7.53 |
| 2026-11-24 | M0-02 | Hooks, Steering | Agent edit with its write tool: the `PostFileSave` hook ran vitest (exit 0, 18 tests); `fileMatch` steering loaded after a `src/**/*.ts` read | CLI 3.5.0 | 0.30 | 7.83 |
| 2026-11-24 | M0-02 | Hooks, Steering, Custom agent, Power | 4 sessions: hook event JSON on stdin captured; `/manual-guide` loaded manual steering; the `spike-reader` Markdown agent with `tools: ["read"]` read a file and could not write one; a local-path power (`plugin.json` + `mcp.json` + skill) activated by keyword | CLI 3.5.0 | 0.34 | 8.17 |
| 2026-11-24 | M0-02 | Spec + PBT | Re-ran spec task 3 with a deliberate bug: Kiro reported the counterexample, seed and shrink, and set the task back to `[-]` | CLI 3.5.0 | 1.30 | 9.47 |
| 2026-11-24 | M0-02 | Crew | Kiro Crew 0.15.0 gateway (source install) loaded the `hello-4x35` app; fixtures recorded in `fixtures/kiro-crew/`. Crew's own LLM path was not used | Crew 0.15.0 | 0 | 9.47 |

**M0-02 total: 9.31 credits** (0.16 → 9.47).

### M0-10 · steering and capability index

| Date | Ticket | Surface | What ran | Kiro | Credits | Balance |
|---|---|---|---|---|---|---|
| 2026-11-24 | M0-10 | Steering | One headless session (`kiro-cli chat --no-interactive --trust-all-tools --trust-workspace`) authored all seven steering files from `PROJECT.md`, `CLAUDE.md`, ADRs 0001/0007/0008/0009/0014/0019 and `docs/engineering-standards.md`: `product.md`, `tech.md`, `structure.md`, `iso20022-addresses.md`, `never-invent.md`, `engineering-standards.md`, `specs.md` | CLI 3.5.0 | 1.79 | 11.26 |
| 2026-11-24 | M0-10 | Steering | Load check: before any tool call Kiro listed the six `inclusion: always` steering files in its context (`tech`, `structure`, `specs`, `product`, `never-invent`, `engineering-standards`); `iso20022-addresses` (`inclusion: fileMatch` on `packages/core/**`, `packages/rulepacks/**`) appeared only after it read `packages/core/package.json` | CLI 3.5.0 | 0.26 | 11.52 |

Per steering file (all from the one authoring session above; the balance is read per session, so credits are not
split per file):

| Steering file | Inclusion | Authored in Kiro | Review edits (Claude Code, against the sources) |
|---|---|---|---|
| `product.md` | always | yes | none |
| `tech.md` | always | yes | removed one rule no source states ("do not bump a version without a ticket") |
| `structure.md` | always | yes | named the tickets that create `packages/formats` (M2-01) and `packages/synth` (M2-24) |
| `iso20022-addresses.md` | fileMatch `packages/core/**`, `packages/rulepacks/**` | yes | none |
| `never-invent.md` | always | yes | completed the ADR 0007 pipeline order and named the datasets |
| `engineering-standards.md` | always | yes | none |
| `specs.md` | always | yes | added the 16-character limit to the boundary lengths and the headless spec command and its two pitfalls from M0-02 |

`.kiro/specs/README.md` (the capability index) was generated from the tickets by a script and checked by hand; no
Kiro credits. **M0-10 total: 2.05 credits** (9.47 → 11.52; the pool is shared, so a concurrent worker's session could fall in a reading).
