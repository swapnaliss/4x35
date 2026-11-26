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

### M1-01 · domain-core spec

| Date | Ticket | Surface | What ran | Kiro | Credits | Balance |
|---|---|---|---|---|---|---|
| 2026-11-26 | M1-01 | Spec | `--mode spec` created `.kiro/specs/domain-core/` from the ticket, ADRs 0001/0008, architecture §2 and the steering: EARS `requirements.md` (R1–R9), `design.md` with P1–P8 (`P-never-invent` … `P-record-transitions`) and one planted bug per property, `tasks.md` (19 tasks, dependency graph), `.config.kiro`. Kiro's refinement pass removed criteria the ticket does not state | CLI 3.5.0 | 13.79 | 25.31 |
| 2026-11-26 | M1-01 | Spec (checkpoint) | Task 19 checkpoint: Kiro ran the core tests (`FC_NUM_RUNS=1000`), typecheck and lint, aligned `design.md`/`tasks.md` with the implemented code, recorded the planted-bug results (seed, runs to failure), and marked tasks 1–17 and 19 `[x]` | CLI 3.5.0 | 8.55 | 33.86 |

Tasks 1–17 were implemented by Claude Code from the spec's task list, in order; Kiro authored the spec and ran
the checkpoint. Review edits to Kiro's spec (Claude Code): Invite/Session/ApiToken dropped from task 7 (not in the
ticket); the active-state set for `→ failed` and the `purgeEligible` purge guard adopted from Kiro's design into the
code; the inferred-from-field chain rule added to `design.md`. **M1-01 total: 22.34 credits** (11.52 → 33.86). The
pool is shared and M1-06 ran Kiro in the same window, so both readings are pool deltas and may include its credits
(BL-01 7183592046).

### M1-06 · design steering

| Date | Ticket | Surface | What ran | Kiro | Credits | Balance |
|---|---|---|---|---|---|---|
| 2026-11-26 | M1-06 | Steering | One headless session (`kiro-cli chat --no-interactive --trust-all-tools --trust-workspace`) authored `.kiro/steering/design.md` (`inclusion: fileMatch` on `apps/web/**`, `docs/design/**`) from `docs/design/README.md` (written by the `ux-designer` agent), `apps/web/src/styles/tokens.css` and `app.css`: screens built to spec, token-to-utility map, status and provenance vocabularies, copy and i18n rules, accessibility, components to reuse | CLI 3.6.2 | 1.09 | 34.95 |

Review edits (Claude Code, against the sources): none. Kiro flagged two choices of its own, both checked against
`app.css`: the `ring-ring` and `h-row` / `h-row-compact` utility names exist (theme names `--color-ring`, `--spacing-row`),
and the added rule that a new colour becomes a token in both themes first matches the design README. This ticket is
design work, not a capability, so it has no `.kiro/specs/` entry. **M1-06 total: 1.09 credits** (33.86 → 34.95; the pool
is shared with concurrent workers).

### M1-02 · persistence spec

| Date | Ticket | Surface | What ran | Kiro | Credits | Balance |
|---|---|---|---|---|---|---|
| 2026-11-26 | M1-02 | Spec | `--mode spec` created `.kiro/specs/persistence/` from the ticket, architecture §2/§5/§7, ADRs 0003–0006/0023, the core entities and the steering: EARS `requirements.md` (R1–R11), then (resumed session) `design.md` with P1 (`P-entity-roundtrip`) and the trigger, purge and enum-CHECK decisions, `tasks.md` (12 tasks, dependency graph), `.config.kiro`. Kiro's own review tightened the decisions DELETE rule (depth > 1 **and** parent record gone) | CLI 3.6.2 | 11.32 | 46.27 |
| 2026-11-26 | M1-02 | Spec (checkpoint) | Task 12 checkpoint: Kiro ran `db:migrate` ×2, the db integration tests (20, P1 at 200 runs) and unit tests, `drizzle-kit check`, `db:generate` (no changes), typecheck and biome; aligned `design.md`/`tasks.md` with the implemented code (helper names, `0002_immutability.sql`, harness API, `entityGraph`, the planted bug and its seed) and marked tasks 1–10 and 12 `[x]` | CLI 3.6.2 | 5.85 | 52.12 |

Tasks 1–10 were implemented by Claude Code from the spec's task list; Kiro authored the spec and ran the checkpoint;
task 11 (this entry) is Claude Code's. Review edits to Kiro's spec (Claude Code): none to `requirements.md`; the design's
"purge_after only when null" and "`fc.oneof` over eight entities" were replaced by what was built (always overwritten;
one connected entity graph per run), through the checkpoint prompt. **M1-02 total: 17.17 credits** (34.95 → 52.12; the
pool is shared with concurrent workers, BL-01 7183592046).

### M1-04 · jobs spec

| Date | Ticket | Surface | What ran | Kiro | Credits | Balance |
|---|---|---|---|---|---|---|
| 2026-11-26 | M1-04 | Spec | `--mode spec` created `.kiro/specs/jobs/` from the ticket, ADRs 0005/0006 and the persistence spec, with the pg-boss 12.38.2 decisions supplied in the prompt (equal-jitter backoff, `exclusive` policy, `<kind>.dlq`, `fromDrizzle`-style executor, send-only web client): EARS `requirements.md` (R1–R8), `design.md` with P1 `P-chunking-covers-once`, P2 `P-handler-idempotent`, P3 `P-idempotency-key-replay` and one planted bug each, `tasks.md` (12 tasks, dependency graph), `.config.kiro` | CLI 3.6.2 | 10.42 | 62.54 |
| 2026-11-26 | M1-04 | Spec (checkpoint) | Task 12 checkpoint: Kiro ran the core chunk tests (4/4) and the server integration tests `jobs idempotency mode` (21/21) against the local Postgres, recorded the three planted-bug results (seeds 4041/4042/4043), aligned `design.md`/`tasks.md` with the code as built (signatures, `fromDrizzle` executor, dead count from pg-boss state `failed`, P2 at 20 runs) and marked tasks 1–10 and 12 `[x]` | CLI 3.6.2 | 3.16 | 65.70 |

Tasks 1–10 were implemented by Claude Code from the spec's task list; Kiro authored the spec and ran the checkpoint;
task 11 (this entry) is Claude Code's. Review edits to Kiro's spec (Claude Code): `requirements.md` trimmed to the
ticket — R2.5 (job data shape) removed, R1.2/R2.3/R5.2/R5.4/R6.2 reworded to what the ticket states, R7.4–R7.7 (409 in
flight, 5xx not stored, no-workspace pass-through, 24 h-stale replace) moved to design decisions, R7.5 "every POST by
default" added from the ticket's scope; the design's open question on P2's `numRuns` closed (the ticket names none).
**M1-04 total: 13.58 credits** (52.12 → 65.70; the pool is shared with concurrent workers, BL-01 7183592046).
