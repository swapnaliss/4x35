---
title: "M1-02 · DB schema + migrations (incl. audit, jobs, idempotency)"
milestone: "M1 · Walking Skeleton"
labels: ["backend", "critical"]
blocked_by: ["M1-01"]
estimate: "5h"
resources: ["SCHEMA", "LOCK"]
needs: ["P-02", "P-03", "P-11", "P-12"]
---

## Context
ADR 0003 (Postgres + Drizzle, uploads as `bytea`), ADR 0004 (transactions, `records.version`),
ADR 0005 (idempotency keys), ADR 0006 (jobs in the same database) and R5/R6/R8 (immutable
originals, append-only decisions and audit). Identity (M1-03), jobs (M1-04) and the thin slice
(M1-07) all need these tables, so the schema lands once, in one migration chain.

## Scope
1. Write the Kiro spec `.kiro/specs/persistence/{requirements.md,design.md,tasks.md}` in Kiro (EARS
   requirements for each constraint below; named property `P-entity-roundtrip`) and log it in
   `docs/kiro-usage.md`.
2. Drizzle schema in `packages/db/src/schema/` (hot files), one file per module, for the tables in
   `docs/architecture.md` §5: `workspaces`, `users` (email `citext` unique), `memberships`,
   `invites`, `sessions`, `api_tokens`, `batches`, `records`, `proposals`, `decisions`,
   `payment_file_links`, `preflight_runs`, `exports`, `audit_events`, `idempotency_keys`,
   `job_timings`. Not here: `geonames_postal`/`jp_post` (dataset seed, M2-11) and
   `llm_cache`/`llm_usage` (M2-14).
3. Constraints: unique `batches (workspace_id, sha256, pack_id, pack_version, form)`; index
   `records (batch_id, status)`; `records.version integer not null default 0`; check constraints
   for every enum (status, role, kind, form, action, actor_kind); `purge_after` set on insert to
   `created_at + 30 days`; foreign keys with `ON DELETE CASCADE` from batch-owned rows to `batches`
   (purge in M2-23 relies on it).
4. Immutability in the migration: triggers that raise on `UPDATE` or `DELETE` of `decisions` and
   `audit_events`, and on `UPDATE` of `batches.original`, `batches.sha256` and
   `records.original_lines`. (`DELETE` of batches is allowed for the purge.)
5. Generate the migration into `packages/db/drizzle/` with drizzle-kit and run it with the M0-06
   migrations runner. SCHEMA: this ticket owns the migration sequence while it adds the first chain.
   LOCK: it adds `drizzle-orm`, `drizzle-kit` and `pg` to `packages/db`.
6. `packages/db/src/client.ts`: a pooled `pg` client from `DATABASE_URL` with a statement timeout,
   and `withTx(fn)`. Typed row ↔ core entity mappers in `packages/db/src/mappers/`.
7. Integration-test harness `packages/db/test/harness.ts`: creates a fresh database per test file
   (name suffixed with `PORT_OFFSET` and a random id) on the local Postgres from `make up`, runs all
   migrations, drops it after. Root script `test:integration` runs every workspace's
   `*.int.test.ts`.

## Out of scope
- The workspace-scoped repository layer and authZ (M1-03). pg-boss schema (managed by pg-boss, M1-04).
- Append-only audit writes from features (M1-08); rate-limit storage (M1-08).
- Seed data beyond what the migrations need (sandbox seed is M3-09; demo set M2-24).

## Acceptance Criteria
1. On an empty database, `npm run db:migrate` applies every migration, and running it a second
   time is a no-op (exit 0, no new migration rows).
2. `npm run test:integration -w packages/db` passes, including:
   a. inserting two batches with the same `(workspace_id, sha256, pack_id, pack_version, form)`
      fails with a unique violation;
   b. `UPDATE` or `DELETE` on `decisions` and `audit_events` raises; `UPDATE` of
      `batches.original` and `records.original_lines` raises;
   c. deleting a batch removes its records, proposals, decisions, links, pre-flight runs and exports;
   d. `P-entity-roundtrip`: a fast-check property writes random valid core entities through the
      mappers and reads them back equal (≥ 200 runs);
   e. `users.email` is case-insensitive unique.
3. `drizzle-kit check` reports no drift between `packages/db/src/schema/` and `packages/db/drizzle/`.
4. `npm run typecheck` passes for the whole repo; `packages/core` still has no `pg` or Drizzle import.
5. `.kiro/specs/persistence/` exists and `docs/kiro-usage.md` has an entry for this ticket.

## Deliverables
- `.kiro/specs/persistence/requirements.md`, `design.md`, `tasks.md`
- `packages/db/src/schema/{identity,batches,review,linking,preflight,export,audit,ops}.ts`, `index.ts`
- `packages/db/drizzle/0000_*.sql` (+ drizzle meta), `packages/db/drizzle.config.ts`
- `packages/db/src/client.ts`, `packages/db/src/mappers/*.ts`
- `packages/db/test/harness.ts`, `packages/db/test/schema.int.test.ts`, `packages/db/test/roundtrip.int.test.ts`
- root `package.json` script `test:integration`; `docs/kiro-usage.md` entry

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
make down && make up
npm run db:migrate
npm run db:migrate 2>&1 | tee "$TMPDIR/m1-02-second-migrate.log"
npm run test:integration -w packages/db
npx drizzle-kit check --config packages/db/drizzle.config.ts
npm run typecheck
test -f .kiro/specs/persistence/requirements.md && grep -q "M1-02" docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff
- M1-03 builds the workspace-scoped repositories on `client.ts` and these tables.
- M1-04 writes `job_timings` and `idempotency_keys`; pg-boss installs its own schema beside these.
- M1-07 stores uploads in `batches.original` and proposals as `buildProposal` JSON.
- M1-08 adds the rate-limit table as the next migration in this chain and writes `audit_events`.
- M2-11 and M2-14 add their tables as later migrations (claim SCHEMA). The test harness is the one
  every integration test uses.
