# Implementation Plan: Jobs (M1-04)

## Overview

Builds the async foundation in dependency order: pure chunker, test harness, pg-boss lifecycle, in-transaction enqueue, registry, progress, then the idempotency middleware. Each property task adds its fast-check test, records one planted bug (failing seed and shrunk counterexample) in `docs/kiro-usage.md`, then restores the real code. All tests run against real Postgres and pg-boss with a Test_Job registered only in test files.

## Tasks

- [x] 1. Implement the Chunker in `packages/core/src/jobs/chunk.ts` (M1-04)
  - Pure `chunk(ids, 200)`, no I/O, chunks of at most 200 in input order
  - _Requirements: R3.1_

- [x] 2. Write property test P-chunking-covers-once in `packages/core/test/chunk.property.test.ts` (M1-04)
  - Test name contains `P-chunking-covers-once`; `numRuns` at least 500; UUID arrays up to 20,000 plus 199/200/201 boundaries
  - Plant the slice end one short from the design (seed 4041), record the failing seed and counterexample, then restore the real chunker
  - **Validates: P1**
  - _Requirements: R3.1, R3.2_

- [x] 3. Create the integration test harness in `apps/server/test` (M1-04)
  - Real Postgres from `make up` and a real pg-boss; helper to register a Test_Job inside a test file only
  - Confirm no Test_Job is registered in product code
  - _Requirements: R8.1, R4.6_

- [x] 4. Implement Boss_Runtime in `apps/server/src/jobs/boss.ts` and add `pg-boss` to `apps/server` (M1-04)
  - `startBoss(options): Promise<JobRuntime>`: workers for `worker`/`all`, send-only client for `web`; `stopBoss` on SIGTERM waits up to 25 s
  - Write `apps/server/test/mode.int.test.ts`: `web` starts no workers, `worker` does not listen on `PORT`
  - _Requirements: R1.1, R1.2, R1.3, R1.4_

- [x] 5. Implement Enqueuer and Fan_Out in `apps/server/src/jobs/enqueue.ts` (M1-04)
  - `enqueueInTx` runs pg-boss SQL on the caller's Drizzle transaction; data `{key, payload}`; `singletonKey` `<batchId>/<base64url(packRef)>/<step>/<chunk>`
  - `fanOut(tx, batchId, step, ids, {kind, packRef, payload?})` enqueues one job per chunk using the Chunker
  - Tests in `jobs.int.test.ts`: rollback leaves no job, same Job_Key twice holds one job, one job per chunk
  - _Requirements: R2.1, R2.2, R2.3, R2.4, R3.3_

- [x] 6. Implement Job_Registry in `apps/server/src/jobs/registry.ts` (M1-04)
  - `defineJob` creates `<kind>.dlq` first, then `<kind>` with `exclusive` policy, `retryLimit` 3, `retryBackoff` true
  - Validate payload with zod, pass `{tx, payload, jobId}` to the handler
  - Test: an always-throwing Test_Job is attempted 4 times with increasing, non-identical delays, then lands in `<kind>.dlq`
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R5.1, R5.2, R5.3, R5.4_

- [x] 7. Write property test P-handler-idempotent in `apps/server/test/jobs.int.test.ts` (M1-04)
  - Test name contains `P-handler-idempotent`; `numRuns` 20 (each run is two real jobs); forced replay of the same chunk job leaves identical rows
  - Plant the insert-instead-of-upsert handler (seed 4042), record the failing seed and counterexample, then restore the upsert
  - **Validates: P2**
  - _Requirements: R4.4, R4.5_

- [x] 8. Implement Progress_Query in `apps/server/src/jobs/progress.ts` (M1-04)
  - `getBatchProgress(tx, batchId)`: record counts per status, plus queued, active, failed and dead job counts by `singletonKey` prefix `<batchId>/`
  - Test with records in three statuses and jobs in queued, failed and dead-letter states
  - _Requirements: R6.1, R6.2_

- [x] 9. Implement Idempotency_Middleware in `apps/server/src/middleware/idempotency.ts` (M1-04)
  - Apply to every POST by default with a route-level opt-out; 24 h storage, replay, 422 on body mismatch, 409 in flight, 5xx unstored, pass through without workspace, stale rows replaced
  - Example tests in `apps/server/test/idempotency.int.test.ts` for 409, 5xx, no workspace, stale row and opt-out
  - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5_

- [x] 10. Write property test P-idempotency-key-replay in `apps/server/test/idempotency.int.test.ts` (M1-04)
  - Test name contains `P-idempotency-key-replay`; `numRuns` at least 100; same body replays stored response without a second handler call, different body returns 422
  - Plant the route opted out of the middleware (seed 4043), record the failing seed and counterexample, then apply the middleware again
  - **Validates: P3**
  - _Requirements: R7.2, R7.3_

- [x] 11. Record the spec and Kiro usage for M1-04 (M1-04)
  - Add the M1-04 row to `docs/kiro-usage.md` (date, ticket, surface, what ran, Kiro version, credits) with the three planted-bug counterexamples and seeds
  - Confirm `.kiro/specs/jobs/` holds requirements, design and tasks
  - _Requirements: R8.2_

- [x] 12. Final checkpoint (M1-04)
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R8.1_

## Notes

- All items are required; no optional tasks.
- A task is marked `[x]` only after its tests pass.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "3"] },
    { "id": 1, "tasks": ["2", "4", "9"] },
    { "id": 2, "tasks": ["5", "10"] },
    { "id": 3, "tasks": ["6"] },
    { "id": 4, "tasks": ["7"] },
    { "id": 5, "tasks": ["8"] },
    { "id": 6, "tasks": ["11"] },
    { "id": 7, "tasks": ["12"] }
  ]
}
```
