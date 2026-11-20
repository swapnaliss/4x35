---
title: "M3-09 · Judge sandbox workspaces + nightly reset"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["infra", "backend", "frontend", "security"]
blocked_by: ["M2-GATE"]
estimate: "4h"
resources: ["DEPLOY"]
needs: []
---

## Context
The rules require the app to stay testable until 29 Jan 2027 (PROJECT.md §1). ADR 0013 gives each judge
a sandbox workspace (cloned seed, nightly reset) with credentials in Devpost's private field; ADR 0023
exempts sandboxes from the 30-day purge until 29 Jan 2027. The organiser also allows a hosted demo with
sample data and no login, but the product stays invite-only (R8): judges sign in to their own sandbox,
so one judge's edits never change what another sees. The seed is the synthetic 500-row / 30-country
demo set (M2-24), so a judge can run the storyboard end to end.

## Scope
1. Write the Kiro spec `.kiro/specs/judge-sandboxes/{requirements.md (EARS), design.md, tasks.md}` in
   Kiro and log the session in `docs/kiro-usage.md`. Name these properties: **P-SBX-1** reset is
   idempotent and complete: after `reset(s)` the sandbox equals the seed snapshot, and
   `reset(reset(s)) = reset(s)`; **P-SBX-2** a reset touches only workspaces with `is_sandbox = true`.
2. `npm run sandbox:provision -- --count <n>` (admin script in `apps/server/src/sandbox/provision.ts`,
   run on Render through the one-off job or shell): creates `n` sandbox workspaces (`is_sandbox = true`,
   `purge_after` = 2027-01-30), one judge user per sandbox (owner role in that workspace only), and
   writes the credentials to a local gitignored file `.sandbox-credentials.md` for the owner to paste into
   Devpost's private field. Passwords are generated (≥ 20 chars), never logged.
3. Seed snapshot: the M2-24 demo master list and payment file uploaded, structured and left at
   `ready_for_review`, captured once per sandbox as a reproducible seed (same files, same pack versions).
4. Nightly reset: a pg-boss scheduled job at 03:00 UTC (`sandbox.reset`) deletes the sandbox's batches
   and derived rows through the purge cascade and re-seeds; sessions are kept so a judge mid-review is
   not logged out, and the reset writes an audit event. One extra workspace `synthetic-check` runs the
   daily synthetic core-flow check from ADR 0015 (this ticket owns it; M1-05 defers it here).
5. LLM stays off in sandboxes (no spend from judges); quotas from ADR 0013 apply.
6. A sandbox banner in the app shell ("Sandbox: resets nightly at 03:00 UTC; synthetic data only") for
   sandbox workspaces.
7. Live: provision 6 judge sandboxes on production and run one reset by hand. DEPLOY is claimed because
   this writes to the production database and adds a scheduled job that a deploy must not race.
8. Add `.sandbox-credentials.md` to `.gitignore`.

## Out of scope
- A no-login public demo mode (the product path has no demo mode)
- Email delivery of credentials (no email provider; the owner pastes them into Devpost)

## Acceptance Criteria
1. P-SBX-1 and P-SBX-2 property tests pass on real Postgres (integration test): random review actions
   on a sandbox followed by reset produce the seed snapshot (compared by a content hash of records,
   proposals and decision counts); a non-sandbox workspace is untouched.
2. The purge job skips sandboxes until 2027-01-30 (integration test with a clock set to 2026-12-31 and
   2027-01-30).
3. Provisioning on production created 6 sandboxes; each judge login reaches its own workspace's health
   report with the seed data, and cannot read another sandbox (authZ matrix row for sandbox users).
4. The scheduled job is registered (`pg-boss` schedule row visible from the admin view) and the manual
   reset on production completed with an audit event and a `job_timings` row.
5. `.sandbox-credentials.md` is gitignored (`git check-ignore` succeeds) and no password appears in logs
   (grep of the provision run's log output for the generated passwords finds nothing).
6. The banner shows only in sandbox workspaces; it is an i18n key, meets contrast, does not obscure focus
   (WCAG 2.2 SC 2.4.11), and `ui-reviewer` returns PASS on the app shell with and without it.

## Deliverables
- `.kiro/specs/judge-sandboxes/requirements.md`, `design.md`, `tasks.md`; `docs/kiro-usage.md` entry
- `apps/server/src/sandbox/{provision,reset,seed}.ts`, `apps/server/test/sandbox.int.test.ts`
- `apps/web/src/components/SandboxBanner.tsx`, i18n keys
- `.gitignore` update; `docs/evidence/sandboxes.md` (count, reset time, run log without secrets)

## Validation Gate
```bash
set -euo pipefail
npm run test:integration -- sandbox purge
npm run test -w apps/web -- SandboxBanner
git check-ignore -q .sandbox-credentials.md
test -f .sandbox-credentials.md && ! git ls-files --error-unmatch .sandbox-credentials.md 2>/dev/null
npm run sandbox:status -- --target prod     # prints count, last reset time and outcome per sandbox, no credentials
./scripts/landing-checks.sh
```

## Handoff
- **M4-05 (Devpost)** and **M4-SUBMIT**: the credentials file path (local, gitignored) for the private
  field; the reset time to state in the testing instructions.
- **M4-03 (video)**: record in a fresh sandbox right after a reset.
- **M3-GATE**: `npm run sandbox:status -- --target prod` and the P-SBX integration tests.
