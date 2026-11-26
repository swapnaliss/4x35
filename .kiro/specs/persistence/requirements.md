# Requirements Document

## Introduction

Ticket M1-02 lands the persistence layer of 4x35 once, in one migration chain: the 16 Postgres tables of `docs/architecture.md` §5 that the ticket lists, their constraints and immutability triggers, the pooled client with `withTx`, typed row to core entity mappers, and the integration-test harness every later database test uses. Decisions follow ADR 0003 (Postgres with Drizzle, uploads as `bytea`), ADR 0004 (one transaction per decision, optimistic concurrency on `records.version`), ADR 0005 (idempotency keys), ADR 0006 (jobs in the same database) and ADR 0023 (30-day purge that cascades). Out of scope: the workspace-scoped repository layer and authorization (M1-03), the pg-boss schema (M1-04), audit writes from features and rate-limit storage (M1-08), `geonames_postal` and `jp_post` (M2-11), `llm_cache` and `llm_usage` (M2-14), and seed data beyond what the migrations need.

## Glossary

- **Schema_Module**: the Drizzle table definitions in `packages/db/src/schema/`, one file per module.
- **Migration_Chain**: the ordered SQL migrations in the repo-root `drizzle/` folder, starting after `0000_baseline`, with drizzle-kit metadata.
- **Migration_Runner**: the M0-06 runner in `packages/db/src/migrate.ts`, started by `npm run db:migrate`.
- **Immutability_Triggers**: the database triggers in the Migration_Chain that raise on forbidden `UPDATE` or `DELETE` statements.
- **DB_Client**: `packages/db/src/client.ts`, which builds the pooled `pg` client and exposes `withTx`.
- **Row_Mappers**: the typed functions in `packages/db/src/mappers/` that convert between database rows and core entities.
- **Core_Entity**: one of the entity types of `packages/core`: Workspace, User, Membership, Batch, Record, StoredProposal, Decision and AuditEvent.
- **Test_Harness**: `packages/db/test/harness.ts`, which gives each integration test file a fresh database.
- **Integration_Runner**: the root `test:integration` script, which runs every workspace's `*.int.test.ts` files.
- **Persisted_Tables**: the 16 tables `workspaces`, `users`, `memberships`, `invites`, `sessions`, `api_tokens`, `batches`, `records`, `proposals`, `decisions`, `payment_file_links`, `preflight_runs`, `exports`, `audit_events`, `idempotency_keys` and `job_timings`.
- **Batch_Owned_Tables**: the tables whose rows belong to a batch: `records`, `proposals`, `decisions`, `payment_file_links`, `preflight_runs` and `exports`.
- **Enum_Column**: a column whose value set the core entities define: `status`, `role`, `kind`, `form`, `action` or `actor_kind`.
- **Batch_Key**: the tuple `(workspace_id, sha256, pack_id, pack_version, form)` of a batch.
- **Append_Only_Tables**: `decisions` and `audit_events`.
- **Frozen_Columns**: `batches.original`, `batches.sha256` and `records.original_lines`.

## Requirements

### Requirement 1: Tables

**User Story:** As a developer, I want every persisted entity to have a table, so that identity, jobs and the thin slice build on one schema.

#### Acceptance Criteria

1. THE Schema_Module SHALL define the 16 Persisted_Tables with the key columns listed for them in `docs/architecture.md` §5, one file per module.
2. THE Migration_Chain SHALL create the Persisted_Tables.
3. THE Schema_Module SHALL store the upload in `batches.original` as `bytea`.
4. THE Schema_Module SHALL define `users.email` as a `citext` column with a unique constraint.
5. WHEN two users are inserted with emails that differ only in letter case, THE Persisted_Tables SHALL reject the second insert with a unique violation.

### Requirement 2: Batch uniqueness

**User Story:** As an AP clerk, I want a repeated upload to be recognised, so that the same file is not processed twice.

#### Acceptance Criteria

1. THE Migration_Chain SHALL define a unique constraint on `batches` over the Batch_Key.
2. IF a batch is inserted with the same Batch_Key as an existing batch, THEN THE Persisted_Tables SHALL reject the insert with a unique violation.

### Requirement 3: Record index and optimistic version

**User Story:** As a reviewer, I want fast record lookups by status and a version counter, so that stale writes can be detected (ADR 0004).

#### Acceptance Criteria

1. THE Migration_Chain SHALL define an index on `records (batch_id, status)`.
2. THE Schema_Module SHALL define `records.version` as `integer not null default 0`.
3. WHEN a record is inserted without a version, THE Persisted_Tables SHALL store version 0.

### Requirement 4: Enum check constraints

**User Story:** As a maintainer, I want the database to reject values outside the allowed sets, so that bad data cannot enter through any code path.

#### Acceptance Criteria

1. THE Migration_Chain SHALL define a check constraint for every Enum_Column of the Persisted_Tables, covering `status`, `role`, `kind`, `form`, `action` and `actor_kind`.
2. THE Migration_Chain SHALL define each check constraint with the value set of the matching core entity enum.
3. IF an insert or update sets an Enum_Column to a value outside its set, THEN THE Persisted_Tables SHALL reject the statement with a check violation.

### Requirement 5: Purge date

**User Story:** As a data-protection owner, I want every batch to carry its purge date from the start, so that the 30-day retention of ADR 0023 can run.

#### Acceptance Criteria

1. WHEN a batch is inserted, THE Persisted_Tables SHALL set `purge_after` to `created_at` plus 30 days.

### Requirement 6: Cascading deletes

**User Story:** As a data-protection owner, I want deleting a batch to remove everything derived from it, so that the purge of M2-23 leaves nothing behind.

#### Acceptance Criteria

1. THE Migration_Chain SHALL define a foreign key with `ON DELETE CASCADE` from each Batch_Owned_Tables row to its `batches` row, directly or through `records`.
2. WHEN a batch is deleted, THE Persisted_Tables SHALL delete its records, proposals, decisions, payment file links, pre-flight runs and exports.

### Requirement 7: Immutability

**User Story:** As an auditor, I want decisions, audit events and original inputs to be unchangeable, so that the record of what happened stays trustworthy (R5, R6, R8).

#### Acceptance Criteria

1. THE Migration_Chain SHALL define Immutability_Triggers on the Append_Only_Tables and on the Frozen_Columns.
2. IF an `UPDATE` or `DELETE` statement targets a row of an Append_Only_Tables table, THEN THE Immutability_Triggers SHALL raise an error and leave the row unchanged.
3. IF an `UPDATE` statement changes `batches.original`, `batches.sha256` or `records.original_lines`, THEN THE Immutability_Triggers SHALL raise an error and leave the row unchanged.
4. WHEN a batch is deleted, THE Persisted_Tables SHALL allow the delete, and THE Immutability_Triggers SHALL allow the cascade to remove the decisions of that batch.
5. WHEN an `UPDATE` statement changes only columns other than the Frozen_Columns of `batches` or `records`, THE Persisted_Tables SHALL apply the update.

### Requirement 8: Migrations

**User Story:** As a developer, I want the migrations to apply cleanly and repeatably, so that every environment reaches the same schema.

#### Acceptance Criteria

1. WHEN `npm run db:migrate` runs on an empty database, THE Migration_Runner SHALL apply every migration in the Migration_Chain in order.
2. WHEN `npm run db:migrate` runs a second time, THE Migration_Runner SHALL apply no migration, add no row to `drizzle.__drizzle_migrations` and exit with code 0.
3. THE Migration_Chain SHALL contain no drift from the Schema_Module, as reported by `drizzle-kit check`.

### Requirement 9: Database client

**User Story:** As a developer, I want one pooled client with a transaction helper, so that every state change and its event commit together (ADR 0004, ADR 0006).

#### Acceptance Criteria

1. THE DB_Client SHALL create a pooled `pg` client from `DATABASE_URL` with a statement timeout.
2. WHEN a function is passed to `withTx`, THE DB_Client SHALL run it inside one transaction and commit when the function returns.
3. IF the function passed to `withTx` throws, THEN THE DB_Client SHALL roll back the transaction and rethrow the error.
4. WHEN a statement runs longer than the statement timeout, THE DB_Client SHALL surface the database timeout error to the caller.

### Requirement 10: Row mappers

**User Story:** As a developer, I want typed conversions between rows and core entities, so that no caller handles raw rows.

#### Acceptance Criteria

1. THE Row_Mappers SHALL convert each Core_Entity to its row and each row back to the Core_Entity, with typed signatures.
2. WHEN a Core_Entity is written through the Row_Mappers and read back, THE Row_Mappers SHALL return a value equal to the original.
3. THE Row_Mappers SHALL import `pg` and Drizzle only inside `packages/db`, and `packages/core` SHALL import neither.
4. FOR ALL valid Core_Entity values, writing through the Row_Mappers into the Persisted_Tables and reading back SHALL produce an equal Core_Entity, checked with at least 200 runs (P1, P-entity-roundtrip).
5. THE P1 test SHALL fail against one deliberately wrong mapper, and the planted bug, its counterexample and its seed SHALL be recorded before the real mapper is restored.

### Requirement 11: Integration-test harness

**User Story:** As a developer, I want a fresh database per test file, so that integration tests do not interfere with each other.

#### Acceptance Criteria

1. WHEN an integration test file starts, THE Test_Harness SHALL create a new database on the local Postgres from `make up`, with a name suffixed by `PORT_OFFSET` and a random id.
2. WHEN the new database exists, THE Test_Harness SHALL run all migrations on it.
3. WHEN the integration test file ends, THE Test_Harness SHALL drop the database.
4. WHEN `npm run test:integration -w packages/db` runs, THE Integration_Runner SHALL run every `*.int.test.ts` file of the workspace.
5. WHEN the root `test:integration` script runs, THE Integration_Runner SHALL run the `*.int.test.ts` files of every workspace.
