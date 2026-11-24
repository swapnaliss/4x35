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
