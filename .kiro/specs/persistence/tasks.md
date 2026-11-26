# Implementation Plan: Persistence

## Overview

Ticket M1-02 lands the persistence layer in one migration chain after `0000_baseline`. The language is TypeScript (strict, ESM, Node 24), as in the design. The order is: `enumCheck` helper, schema modules and generated `0001`, hand-written `0002` triggers, `withTx`, mappers, the integration harness and root script, the constraint, trigger, cascade and idempotency tests, the P1 round-trip test with its planted bug, and a final checkpoint.

The hot files `packages/db/src/schema/*`, `drizzle/` and `package-lock.json` are touched only by this ticket. Nothing here edits `0000_baseline`. Nothing here adds scope beyond M1-02: no repositories (M1-03), no pg-boss schema (M1-04), no `geonames_postal`, `jp_post`, `llm_cache` or `llm_usage`.

## Tasks

- [x] 1. Add the `enumCheck` helper built from `@4x35/core` constants (M1-02)
  - Create `packages/db/src/schema/columns.ts` with `enumCheck(table, column, columnName, values)`, which turns a `readonly string[]` into a named `<table>_<column>_check` constraint over a parenthesised SQL `IN (...)` list. The same file defines the `bytea`, `citext` and `timestamptz` (precision 3) column types.
  - Assert that every value is an identifier-safe token before inlining it. Parameters cannot be used in a `CHECK` definition.
  - Read the value sets from the `@4x35/core` constant arrays (`BATCH_STATES`, `RECORD_STATES`, `MEMBERSHIP_ROLES`, `BATCH_KINDS`, `TARGET_FORMS`, `DECISION_ACTIONS`) and the `["session", "token"]` actor kinds. Do not hand-type any value set.
  - Add a unit test (`test/schema.test.ts`) for rejection of an unsafe value.
  - _Requirements: R4.1, R4.2_

- [x] 2. Define the schema modules and generate migration `0001` with drizzle-kit (M1-02)
  - Create `identity.ts`, `batches.ts`, `review.ts`, `linking.ts`, `preflight.ts`, `export.ts`, `audit.ts` and `ops.ts` in `packages/db/src/schema/`, and re-export every table from `index.ts`. Together they define the 16 Persisted_Tables with the columns of `docs/architecture.md` §5 and the design's column list.
  - Store the upload in `batches.original` as `bytea`. Define `users.email` as `citext` with a unique constraint.
  - Add the unique constraint on `batches (workspace_id, sha256, pack_id, pack_version, form)` and the index on `records (batch_id, status)`.
  - Define `records.version` as `integer not null default 0`. Add `proposals.pack_id` and `proposals.rejected jsonb not null default '[]'` as decided in the design.
  - Add `ON DELETE CASCADE` foreign keys from every Batch_Owned_Table to `batches`, directly or through `records`. Do not make `audit_events` batch-owned.
  - Add one `check()` constraint per Enum_Column (`status`, `role`, `kind`, `form`, `action`, `actor_kind`) using the task 1 helper.
  - Run `npx drizzle-kit generate --config packages/db/drizzle.config.ts` to produce `drizzle/0001_*.sql` with its journal entry and snapshot. Do not hand-edit the generated SQL.
  - Run `npx drizzle-kit check --config packages/db/drizzle.config.ts` and confirm it reports no drift.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R2.1, R3.1, R3.2, R4.1, R4.2, R6.1, R8.3_

- [x] 3. Write the hand-written `0002` triggers migration (M1-02)
  - Create `drizzle/0002_immutability.sql` with its journal entry and snapshot, so `drizzle-kit check` still reports no drift.
  - `batches_set_purge_after()`: `BEFORE INSERT` on `batches`, always overwrites `purge_after` with `created_at` plus 30 days (UTC), not only when it is null.
  - `immutable_statement()`: `BEFORE UPDATE` and `BEFORE DELETE` `FOR EACH STATEMENT` on `decisions` and `audit_events`, so a statement that matches no row still raises. A `DELETE` on `decisions` at `pg_trigger_depth() > 1` is passed to the row trigger.
  - `immutable_decision_delete()`: `BEFORE DELETE FOR EACH ROW` on `decisions`, allowed only when `pg_trigger_depth() > 1` and the parent `records` row no longer exists.
  - `immutable_columns()`: `BEFORE UPDATE OF <column> FOR EACH ROW ... WHEN (OLD.<column> IS DISTINCT FROM NEW.<column>)` on `batches` (`original`, `sha256`) and `records` (`original_lines`). An update of any other column passes.
  - Run `npm run db:migrate` against the local Postgres to confirm both migrations apply.
  - _Requirements: R5.1, R7.1, R7.2, R7.3, R7.4, R7.5, R8.1_

- [x] 4. Add `withTx` to the database client (M1-02)
  - Move the pool into `packages/db/src/pool.ts` so `migrate.ts` imports neither the schema nor `@4x35/core`. In `packages/db/src/client.ts`, add `createDb(pool)`, the `Tx` type and `withTx<T>(db, fn)`, a typed wrapper over `db.transaction`. It commits when `fn` returns, and rolls back and rethrows the original error unchanged when `fn` throws.
  - Do not catch the `57014` statement-timeout error. It reaches the caller unchanged.
  - Export `withTx` from the package entry point.
  - _Requirements: R9.1, R9.2, R9.3, R9.4_

- [x] 5. Implement the typed Row_Mappers (M1-02)
  - Create `packages/db/src/mappers/identity.ts`, `batches.ts`, `review.ts` and `audit.ts`, with an `index.ts`. They export `<entity>ToRow` and `<entity>FromRow` pairs typed against the Drizzle `$inferInsert` and `$inferSelect` types and the core types.
  - Cover Workspace, User, Membership, Batch, DomainRecord, the stored proposal (`PersistedProposal` and `storedProposal()`), Decision and AuditEvent.
  - Parse every jsonb column through its core zod schema on read. Let a `ZodError` propagate unwrapped.
  - Map `StoredProposal.pack` to `pack_id` and `pack_version`. Map `Batch.original` to `bytea` with `Buffer.from` on write. Return `record.originalLines` as the stored array directly.
  - Keep `pg` and Drizzle imports inside `packages/db`. Add an import-boundary check that `packages/core` imports neither (the migrator check is in `test/schema.test.ts`).
  - Export the mappers from the package entry point.
  - _Requirements: R10.1, R10.3_

- [x] 6. Build the integration harness and wire the root `test:integration` script (M1-02)
  - Create `packages/db/test/harness.ts` exporting `createTestDatabase(label, {migrate?, statementTimeoutMs?})`, a `TestDb` with `dropAndClose()`, `databaseExists` and `sqlState`.
  - Name the database from the label, `PORT_OFFSET` and a random id. Run `CREATE DATABASE` on the base `DATABASE_URL`, then run `runMigrations` on the new database.
  - `dropAndClose()` closes the pool and runs `DROP DATABASE IF EXISTS ... WITH (FORCE)`, which terminates remaining backends.
  - Add `test:integration` to `packages/db/package.json` and confirm the root `test:integration` script and the `integration` project in `vitest.workspace.ts` pick up `packages/db/test/**/*.int.test.ts`. Change them only if they do not.
  - Add the harness test to `packages/db/test/schema.int.test.ts` (there is no `harness.int.test.ts`): two calls with the same label give different database names, and `dropAndClose` leaves no matching row in `pg_database`.
  - _Requirements: R11.1, R11.2, R11.3, R11.4, R11.5_

- [x] 7. Write the constraint integration tests (M1-02)
  - Create `packages/db/test/schema.int.test.ts` using the harness, with synthetic data only.
  - Two users whose emails differ only in case: the second insert raises `23505` (R1.5).
  - Two batches with the same Batch_Key raise `23505` (R2.2).
  - A record inserted without `version` stores `0` (R3.3).
  - One check-violation (`23514`) example per Enum_Column: `status` on `batches` and `records`, `role`, `kind`, `form`, `action`, and `actor_kind` on `decisions` and `audit_events`. Cover both insert and update (R4.3).
  - A batch inserted without `purge_after` stores `created_at` plus 30 days (R5.1).
  - _Requirements: R1.5, R2.2, R3.3, R4.3, R5.1_

- [x] 8. Write the trigger and cascade integration tests (M1-02)
  - Extend `packages/db/test/schema.int.test.ts`.
  - Deleting a batch removes its records, proposals, decisions, payment file links, pre-flight runs and exports (R6.2). The cascade is not blocked by `forbid_direct_delete` (R7.4).
  - A direct `UPDATE` or `DELETE` on `decisions` or `audit_events` raises, and a re-select shows the row unchanged (R7.2).
  - A `DELETE FROM decisions` issued from inside a throwaway function and trigger on a scratch table, with the parent `records` row still present, raises and leaves the row unchanged. This shows the depth check alone does not permit the delete.
  - An `UPDATE` of `batches.original`, `batches.sha256` or `records.original_lines` raises, and a re-select shows the row unchanged (R7.3).
  - An `UPDATE` of only `batches.status` or `records.version` succeeds (R7.5).
  - _Requirements: R6.2, R7.2, R7.3, R7.4, R7.5_

- [x] 9. Write the migration idempotency and `withTx` integration tests (M1-02)
  - Extend the existing `migrate.int.test.ts`: `runMigrations` on an empty database applies every migration in order. A second run applies none, adds no row to `drizzle.__drizzle_migrations`, and exits with code 0 (R8.1, R8.2).
  - In `packages/db/test/schema.int.test.ts` (there is no `client.int.test.ts`), against the real database:
  - `withTx` commits when the callback returns (R9.2).
  - `withTx` rolls back and rethrows the same error when the callback throws (R9.3).
  - A statement longer than the statement timeout surfaces the `57014` error to the caller (R9.4).
  - _Requirements: R8.1, R8.2, R9.2, R9.3, R9.4_

- [x] 10. Write the P1 entity round-trip property test with a planted bug (M1-02)
  - **Validates: P1**
  - Create `packages/db/test/arbitraries.ts` with domain arbitraries and no bare `fc.string()`. Build `dbSafeString` from CJK, Devanagari, Arabic, Cyrillic and Latin-with-diacritics letters. Include whitespace runs of 1, 2 and 3 or more (space, tab, U+00A0), NFC and NFD forms, and lengths around 15/16/17, 34/35/36 and 69/70/71. Exclude U+0000 and lone surrogates.
  - Add one arbitrary per Core_Entity built from the core enum constants, and `entityGraph`: one connected graph of all eight entities per run (not a `fc.oneof` over eight).
  - Create `packages/db/test/roundtrip.int.test.ts`. The test name contains `P1` and `P-entity-roundtrip`, with the tag comment from the design. It uses one `fc.assert` with `numRuns = Math.max(200, Number(process.env.FC_NUM_RUNS ?? 0) || 0)`, so it never runs fewer than 200 times. For each generated graph it writes every entity through its `*ToRow` mapper in one transaction, reads back through `*FromRow`, asserts deep equality, and rolls the transaction back so unique constraints cannot collide between runs.
  - Record one planted bug before restoring real code:
    - Temporarily change `recordFromRow` to return `originalLines: row.originalLines.map((l) => l.normalize("NFC"))`.
    - The property failed after 1 run with seed `-1730475784`, on an NFD `"Ä0"` line (`"A\u0308" + "0"`).
    - The wrong implementation, the counterexample and the seed are recorded as `PLANTED_BUG` and in the header of `roundtrip.int.test.ts`.
    - The direct mapping was restored and P1 passes at 200 runs.
  - _Requirements: R10.2, R10.4, R10.5_

- [x] 11. Log the spec actions in `docs/kiro-usage.md` (M1-02)
  - Append one row per spec action for this ticket (create, refine, run tasks), as required by `.kiro/steering/specs.md` (Logging). Each row has the date, ticket M1-02, surface, what ran, Kiro version, and credits used (from `/usage` before and after).
  - Edit no other part of `docs/kiro-usage.md`.
  - _Requirements: R10.5_

- [x] 12. Final checkpoint
  - Run `npm run db:migrate` twice, `npm run test:integration -w packages/db`, `npm test -w packages/db`, `npx drizzle-kit check --config packages/db/drizzle.config.ts`, `npm run db:generate` (expects no schema changes), `npm run typecheck -w packages/db` and `npx biome check packages/db drizzle`. All passed on 2026-11-26. The root `npm run test:integration` and `npm run lint` were not run.
  - Record the planted-bug seed and counterexample, the passing run count, and the `drizzle-kit check` and typecheck results as the design's Verification result.
  - Confirm the Kiro refinement pass did not mark a task `[x]` before its tests passed.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R8.1, R8.2, R8.3, R10.4, R11.4, R11.5_

## Notes

- States are `[ ]` not started, `[-]` in progress, `[x]` done.
- Task 1 comes before the schema because the schema's `check()` constraints use the helper.
- `package-lock.json` changes only if a dependency is added. The pinned versions in `.kiro/steering/tech.md` apply.
- Test data is synthetic only. There are no mocks or demo mode in the product path.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3", "4"] },
    { "id": 3, "tasks": ["5", "6"] },
    { "id": 4, "tasks": ["7", "9", "10"] },
    { "id": 5, "tasks": ["8"] },
    { "id": 6, "tasks": ["11"] },
    { "id": 7, "tasks": ["12"] }
  ]
}
```
