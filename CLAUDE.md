# 4x35: Node 24 + TypeScript web app on Render (Postgres), built with Kiro. No modules; no blockchain, no Vercel, no Neon.

4x35 turns MT-era free-text payment addresses (4 × 35 lines) into ISO 20022 structured or hybrid
addresses with per-field provenance and human review, then pre-flights pain.001 files against
published bank rule packs. Kiroween 2026 entry (Resurrection). Deadline: Fri 4 Dec 2026 14:00 PT.

## Read first
- `PROJECT.md`: facts, product, storyboard, milestones, data policy (§9.1), risks
- `docs/architecture.md` + `docs/adr/`: the design. `docs/engineering-standards.md`: rules every ticket follows
- `WORKFLOW.md`: how work moves. `.github/plan/`: tickets (IDs are permanent)
- `.kiro/steering/` and `.kiro/specs/<capability>/`: the spec for the capability you touch

## Commands
`/status` · `/start <ticket>` · `/start-milestone <n>` (run `python3 scripts/waves.py <n>` first) · `/gate <n>` · `/backlog`

## Stack
npm workspaces: `packages/{core,formats,rulepacks,db,llm,synth}`, `apps/{server,web,mcp}`, `integrations/kiro-power`.
Hono + zod-openapi, Drizzle + Postgres 17, pg-boss, React 19 + Vite + TanStack + Tailwind/shadcn,
vitest + fast-check + Playwright, biome. Versions: `PROJECT.md` §4. TypeScript stays on 6.0.x (drizzle-kit).

## Hackathon rules that disqualify
- `/.kiro` must stay at the root and tracked; never gitignore it.
- No code from any earlier project (Carnet included). Only standard libraries, frameworks, templates.
- Kiro must be used for real: start capability work from its `.kiro/specs/` tasks; log Kiro use in `docs/kiro-usage.md`.
- Third-party data and models only within their licences (NOTICE + in-app attributions). Swift's address model is excluded.
- Other AI tools used are disclosed in the README.

## Domain rules that are easy to get wrong
- **Never invent.** Every value needs provenance `span | transform | dataset | inferred | human | external` (ADR 0008). No provenance → field empty → review.
- **Never truncate.** Over-length is a finding.
- Dataset values only on a **unique** match backed by an input span; `dataset`, `inferred`, `external` are never auto-approvable.
- The LLM returns labels + substrings only, never values (ADR 0014). It is opt-in per workspace.
- pain.001.001.03 lacks BldgNm, Flr, PstBx, Room, TwnLctnNm, DstrctNm: use the element map (ADR 0009).
- Hybrid: TwnNm + Ctry mandatory, ≤ 2 AdrLine, no duplication.
- Never say "the bank will accept/reject". Say "checked against `<pack>@<version>`".
- Never present Swift's cutover date as imminent: it is not set (deferred 27 Aug 2026).
- XML is edited by byte splice of `PstlAdr` ranges only; reject `<!DOCTYPE`.

## Architecture rules
`packages/core` is pure (no I/O). Modules talk via core interfaces and events, never each other's
tables. Every query on workspace data goes through the workspace-scoped repository layer; global read-only reference data (GeoNames, Japan Post, chromium-i18n) uses a separate read-only dataset repository. Jobs are idempotent by
(batch, pack, step, chunk) and enqueued in the state-change transaction. Full list:
`docs/engineering-standards.md`.

## Data policy
All supplier, employee and payment data in tests, demo and sandboxes is synthetic. Real: ISO 20022
schemas, public bank guides (rules encoded, text never copied), chromium-i18n, GeoNames, Japan Post.
No mocks or demo mode in the product path; tests replay recorded real responses. Uploads purge after 30 days.

## UI/UX
Build to `docs/design/` (from `ux-designer`). Every `frontend` ticket passes `ui-reviewer` (never the
builder). Keyboard-first, WCAG 2.2 AA, empty/loading/error states, i18n keys.

## Claims discipline
No number in the README, app or video without a measurement in the repo (eval output, load test).
Accuracy is reported per country with n.

## Standing approvals
Decided by the owner on 24 Nov 2026 (issue #2, comment 7122839563; M0-00 P-05). Allow rules live in
`.claude/settings.json`; a rule's wildcard never widens the class beyond what is written here.
1. **Merge PRs whose CI and landing checks are green: approved.** `gh pr checks` must be green first;
   never merge red or pending. Squash-merge, delete the branch.
2. **Deploy main to Render and reset judge sandboxes: approved.** Only the `main` commit, only
   sandbox workspaces (`is_sandbox = true`). Rollback, plan changes and other production writes are not
   covered. M0-07 and M3-09 align the allow rules with the real command names.
3. **Real LLM spend: NOT approved.** No standing approval at any amount. Every ticket that would spend
   real tokens asks the owner on its issue first, stating the amount, and waits for a yes. Without it,
   replay recorded responses only.

Budget ceiling: $108 to 29 Jan 2027 (`docs/budget.md`).

## `.env` STRICT RULE
Never read, print, cat, grep, echo or commit `.env` or any value from it. Check presence only with
`python3 scripts/check-prereqs.py`. Key *names* live in `.env.example`; locations in `.dev-refs.md`.

## Tooling notes
- `gh`, `git init` and writes under `.claude/` run outside the sandbox.
- Temp files go under `$TMPDIR`.

## Hot files (coordinate; one ticket at a time)
`packages/db/src/schema/*`, `drizzle/` migrations, `packages/core/src/provenance.ts`,
`packages/rulepacks/schema.ts`, `render.yaml`, `.github/workflows/*`, `package-lock.json`.

## Never
- Commit secrets, real personal data, or copied bank guide text
- Add a Claude co-author line to commits
- Rewrite git history, force-push main, or make the repo public before M4-SUBMIT with the owner's OK
- Cut or defer a feature to pass a gate
