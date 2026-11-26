# Requirements Document

## Introduction

Ticket M1-04 (ADR 0005, ADR 0006) gives 4x35 its async foundation. Work runs as pg-boss jobs in the same Postgres. Jobs are enqueued inside the state-change transaction, split into chunks of at most 200 records, retried 3 times with jittered backoff, then dead-lettered. Progress is polled. POST requests carry an `Idempotency-Key`. Real pipeline jobs, logging, `job_timings` writes, the dead-letter admin route and the HTTP status endpoint are out of scope.

Decisions taken before this spec (not reopened): `retryLimit` 3 with `retryBackoff` true (pg-boss equal jitter, increasing non-identical delays; full jitter rejected because it cannot guarantee R5.1); the dead-letter queue `<kind>.dlq` is created before `<kind>`; queue policy `exclusive`; `singletonKey` is `<batchId>/<base64url(packRef)>/<step>/<chunk>`; job data is `{key, payload}`; `MODE=web` is a send-only pg-boss client.

## Glossary

- **Job_System**: the pg-boss 12.38.2 integration in `apps/server/src/jobs` (`boss`, `enqueue`, `registry`, `progress`).
- **Boss_Runtime**: the part of Job_System that starts and stops pg-boss for a process `MODE`.
- **Enqueuer**: `enqueueInTx(tx, kind, payload, key)`, which runs pg-boss SQL on the caller's Drizzle transaction through an `IDatabase` executor.
- **Fan_Out**: `fanOut(tx, batchId, step, ids)`, which enqueues one job per chunk.
- **Chunker**: the pure function `chunk(ids, 200)` in `packages/core/src/jobs/chunk.ts`.
- **Job_Registry**: `defineJob({kind, schema, handler})`, which registers a job kind with a zod payload schema and a handler.
- **Job_Key**: `{batchId, packRef, step, chunk}`, stored as the pg-boss `singletonKey`.
- **Dead_Letter_Queue**: the pg-boss queue `<kind>.dlq` for a job kind.
- **Progress_Query**: `getBatchProgress(tx, batchId)`.
- **Idempotency_Middleware**: `apps/server/src/middleware/idempotency.ts`, applied to every POST by default.
- **MODE**: the process mode `web`, `worker` or `all`.
- **Test_Job**: a job kind registered only inside a test file.

## Requirements

### Requirement 1: Boss lifecycle by MODE

**User Story:** As an operator, I want one image to run as web, worker or both, so that work scales without a second service.

#### Acceptance Criteria

1. WHERE MODE is `worker` or `all`, THE Boss_Runtime SHALL start pg-boss workers on `DATABASE_URL`.
2. WHERE MODE is `web`, THE Boss_Runtime SHALL start no pg-boss workers.
3. WHERE MODE is `worker`, THE Job_System SHALL run without listening on `PORT`.
4. WHEN the process receives SIGTERM, THE Boss_Runtime SHALL stop pg-boss and wait up to 25 seconds for active jobs to finish.

### Requirement 2: Enqueue in the state-change transaction

**User Story:** As a developer, I want jobs enqueued in the same transaction as the state change, so that a rollback leaves no orphan job.

#### Acceptance Criteria

1. WHEN `enqueueInTx` is called, THE Enqueuer SHALL send the job through pg-boss on the caller's transaction.
2. IF the caller's transaction rolls back after `enqueueInTx`, THEN THE Job_System SHALL hold no job for that call in pg-boss.
3. THE Enqueuer SHALL use the Job_Key as the pg-boss `singletonKey`.
4. WHEN the same Job_Key is enqueued twice for a kind, THE Job_System SHALL hold one job.

### Requirement 3: Chunking and fan-out

**User Story:** As a developer, I want records split into chunks of at most 200, so that 20,000 rows never block a request.

#### Acceptance Criteria

1. THE Chunker SHALL return chunks of at most 200 IDs.
2. FOR ALL lists of up to 20,000 IDs, THE Chunker SHALL return chunks that cover every ID exactly once and in input order (`P-chunking-covers-once`, at least 500 runs).
3. WHEN `fanOut` is called with a batch, a step and a list of IDs, THE Fan_Out SHALL enqueue one job per chunk.

### Requirement 4: Job registry and handlers

**User Story:** As a developer, I want a registry that validates payloads and gives handlers a transaction, so that every job kind behaves the same.

#### Acceptance Criteria

1. WHEN `defineJob` is called, THE Job_Registry SHALL register the kind with its zod payload schema and its handler.
2. WHEN a job is received, THE Job_Registry SHALL validate the payload with the registered zod schema before calling the handler.
3. WHEN a handler is called, THE Job_Registry SHALL pass `{tx, payload, jobId}`.
4. THE Job_Registry SHALL require handlers to write results by upsert keyed on (record, pack ref, step).
5. FOR ALL chunk jobs, running the same job twice SHALL leave the same rows as running it once (`P-handler-idempotent`).
6. THE Job_System SHALL register no Test_Job in product code.

### Requirement 5: Retries and dead letter

**User Story:** As an operator, I want failed jobs retried with jittered backoff and then dead-lettered, so that transient errors recover and permanent ones are visible.

#### Acceptance Criteria

1. IF a handler always throws, THEN THE Job_System SHALL attempt the job 4 times in total with increasing, non-identical delays.
2. THE Job_Registry SHALL set `retryLimit` to 3 with exponential, jittered backoff for every kind.
3. WHEN the last attempt fails, THE Job_System SHALL place the job in the Dead_Letter_Queue.
4. WHEN a job kind is registered, THE Job_Registry SHALL give it the Dead_Letter_Queue `<kind>.dlq`.

### Requirement 6: Batch progress

**User Story:** As a UI developer, I want per-batch counts, so that the status endpoint can poll them.

#### Acceptance Criteria

1. WHEN `getBatchProgress` is called, THE Progress_Query SHALL return the count of records per status for the batch.
2. WHEN `getBatchProgress` is called, THE Progress_Query SHALL return the counts of queued, active, failed and dead jobs for the batch.

### Requirement 7: Idempotency-Key on POST

**User Story:** As an API client, I want a replayed POST to return the original response, so that retries do not repeat work.

#### Acceptance Criteria

1. WHEN a POST carries an `Idempotency-Key`, THE Idempotency_Middleware SHALL store `(key, workspace_id, request_hash, response)` for 24 hours.
2. WHEN a POST repeats a stored key with the same body, THE Idempotency_Middleware SHALL return the stored status and body without running the handler again (`P-idempotency-key-replay`).
3. IF a POST repeats a stored key with a different body, THEN THE Idempotency_Middleware SHALL return 422 problem+json.
4. WHERE a route opts out, THE Idempotency_Middleware SHALL skip that route (ticket Handoff: routes that must not be replayed opt out explicitly and say why).
5. THE Idempotency_Middleware SHALL apply to every POST by default.

### Requirement 8: Verification environment

**User Story:** As a reviewer, I want tests on real infrastructure, so that transaction and queue behaviour is proven.

#### Acceptance Criteria

1. THE Job_System SHALL be tested against a real Postgres and a real pg-boss using a Test_Job.
2. THE Job_System SHALL record this spec at `.kiro/specs/jobs/` and an entry for M1-04 in `docs/kiro-usage.md`.
