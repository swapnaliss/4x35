# Implementation Plan: Observability (M1-05)

## Overview

Builds the observability baseline in dependency order: logger and serializers, request ID middleware, request ID carried into jobs, job wrapper with `job_timings`, health endpoints, dead-letter listing, then the Render health check. Each property task adds its fast-check test, records one planted bug (failing seed and shrunk counterexample) in `docs/kiro-usage.md`, then restores the real code. Integration tests run against real Postgres and pg-boss with a Test_Job registered only in test files. The language is TypeScript, as in the design.

## Tasks

- [ ] 1. Implement the Logger and Log_Serializer in `apps/server/src/obs/logger.ts` and add `pino` to `apps/server` (M1-05)
  - `createLogger({level, pretty?, destination?})` on pino 10.4.0, level from `LOG_LEVEL`, raw JSON when `NODE_ENV=production`
  - `requestSerializer` and `jobSerializer` build a new object field by field from the allow-list (request: method, route, status, durationMs, requestId, userId, workspaceId, userAgent; job: kind, jobId, batchId, chunk, attempt, outcome, ms); they never spread the input
  - Redaction paths `password`, `token`, `*.original*`, `*.lines*`, `*.name`, censor `"[redacted]"`
  - Example tests in `apps/server/test/logging.int.test.ts` for `LOG_LEVEL` filtering, JSON output in production and each redaction path
  - _Requirements: R1.1, R1.2, R2.1, R2.2, R2.3, R2.4, R2.5_

- [ ] 2. Write property test P4 serializers emit only allow-listed fields in `apps/server/test/logging.int.test.ts` (M1-05)
  - Test name contains `P4`; `numRuns` at least 100; `fc.record` inputs with the allow-listed fields plus `fc.dictionary` extra keys (body, query string, header map, file name), including CJK and Devanagari values
  - Plant the serializer that spreads the raw input (`{ ...input, requestId }`), record the failing seed and shrunk counterexample in `docs/kiro-usage.md`, then restore the field-by-field serializer
  - **Validates: P4**
  - _Requirements: R2.1, R2.2, R2.3, R2.4_

- [ ] 3. Implement Request_Id_Middleware in `apps/server/src/obs/request-id.ts` and register it on the server app (M1-05)
  - Accept `X-Request-Id` only if it matches `^[A-Za-z0-9-]{8,64}$`, otherwise generate one and discard the incoming value; set it on every response, including error responses
  - Bind `{requestId, log}` in an `AsyncLocalStorage`; export `currentRequestContext()`
  - Log one `request completed` line through `requestSerializer` with the matched route pattern, never the raw path or query string
  - Example tests in `logging.int.test.ts` for a valid id echoed, a missing id generated, and a header containing a newline replaced
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5_

- [ ] 4. Implement `meta.requestId` propagation in `apps/server/src/jobs/enqueue.ts` and `apps/server/src/jobs/registry.ts` (M1-05)
  - `JobData` gains optional `meta: {requestId}`; `enqueueInTx` reads `currentRequestContext()` and sets `meta` when present, omits it otherwise
  - `key` and `payload` and the per-kind payload validation are unchanged
  - Example test in `jobs.int.test.ts`: a job enqueued inside a request carries the request's id in `meta`; one enqueued outside a request has no `meta`
  - _Requirements: R5.1, R5.2_

- [ ] 5. Write property test P2 request ID is accepted, generated, echoed and consistent in `apps/server/test/logging.int.test.ts` (M1-05)
  - Test name contains `P2`; `numRuns` at least 100; header arbitrary is absent, matching `^[A-Za-z0-9-]{8,64}$`, or violating it (too short, too long, newline, space, `<`, control characters)
  - Asserts the response header equals the incoming value when valid, is fresh otherwise, and every captured log line for the request carries that `requestId`
  - Plant the middleware that echoes the malformed header verbatim, record the failing seed and shrunk counterexample in `docs/kiro-usage.md`, then restore the discard
  - **Validates: P2**
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.6_

- [ ] 6. Implement Job_Wrapper in `apps/server/src/obs/job-wrapper.ts` and call it from `runJob` in `apps/server/src/jobs/boss.ts` (M1-05)
  - `withJobObservability` binds a child logger with `jobId`, `requestId`, `kind`, `batchId`, `chunk`, `attempt` and passes it to the handler through `JobContext`
  - Outcome is `completed`, `failed` while `attempt < retryLimit`, and `dead_letter` on the final attempt; one `job_timings` row per attempt, inserted outside the handler's transaction
  - Log the error class name only, never the message; re-throw the original error so M1-04 retry and dead-letter behaviour is unchanged; an insert failure never changes the job outcome
  - Example tests in `apps/server/test/job-timings.int.test.ts`: one success gives 1 row `completed`; three failures then dead-letter give 4 rows with the right outcomes; job log lines carry the request's `requestId` and their own `jobId`
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5_

- [ ] 7. Write property test P3 one `job_timings` row per attempt in `apps/server/test/job-timings.int.test.ts` (M1-05)
  - Test name contains `P3`; `numRuns` at least 20 (each run drives real pg-boss attempts with backoff); plans are success at attempt k in 1..`retryLimit + 1` or fail on every attempt; thrown error classes drawn from a small `fc.constantFrom` set
  - Plant the wrapper that inserts the `job_timings` row inside the handler's transaction, record the failing seed and shrunk counterexample in `docs/kiro-usage.md`, then restore the insert outside it
  - **Validates: P3**
  - _Requirements: R5.3, R5.4, R5.5_

- [ ] 8. Implement Health_Endpoints in `apps/server/src/obs/health.ts`, add `isBossStarted()` to `apps/server/src/jobs/boss.ts`, and register the routes (M1-05)
  - `GET /healthz` returns 200 without touching the database
  - `GET /readyz` runs `select 1` on a dedicated probe pool (`max: 1`) raced against a 2 s timer; timeout, connection error and query error all return 503; in `worker` and `all` modes it also requires pg-boss started
  - Register both routes as `public` in the AuthZ_Matrix (rebase onto M1-03 if it merged first)
  - Tests in `apps/server/test/health.int.test.ts`: `/readyz` 200 with the stack up; 503 within 3 s with Postgres stopped while `/healthz` stays 200; 503 in `worker` mode before pg-boss starts; matrix entries are `public`
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6_

- [ ] 9. Write property test P-logs-carry-no-content in `apps/server/test/logging.int.test.ts` (M1-05)
  - Test name contains `P-logs-carry-no-content` (P1); `numRuns` at least 50; Marker_Strings from Latin with diacritics (NFC and NFD), CJK and Devanagari, placed in a request body, query string, extra header, file name or job payload field
  - Runs real requests and a real job against a logger writing to an in-memory stream and asserts no captured line contains any marker
  - Plant the request serializer that logs the raw URL including the query string instead of the route pattern, record the failing seed and shrunk counterexample in `docs/kiro-usage.md`, then restore the route pattern
  - **Validates: P1**
  - _Requirements: R3.1_

- [ ] 10. Implement Dead_Letter_Lister in `apps/server/src/obs/dead-letters.ts`, `apps/server/scripts/dead-letters.ts` and the `jobs:dead-letters` npm script (M1-05)
  - `listDeadLetters(tx, {limit})` reads `pgboss.job` rows of `<kind>.dlq` queues and projects only kind, job id, batch id, attempts, error class and failed time; no query selects `data` or `output` in full; newest first, at most `limit` rows
  - `apps/server/scripts/dead-letters.ts` prints one tab-separated line per row with no header and no payload, prints nothing and exits 0 when there are none
  - Add `"jobs:dead-letters"` to `apps/server/package.json` scripts so `npm run jobs:dead-letters -w apps/server` runs it
  - Example test: a job that failed 3 times and dead-lettered appears in the script output without its payload
  - _Requirements: R7.1, R7.2, R7.3, R7.4_

- [ ] 11. Write property test P5 dead-letter listing is bounded, complete and payload-free in `apps/server/test/dead-letters.int.test.ts` (M1-05)
  - Test name contains `P5`; `numRuns` at least 50; `dlqCount` 0..30 and `limit` 0..40 against real Postgres, payloads carrying a marker string
  - Asserts at most `limit` rows, only the allow-listed keys on each row, newest-first order, and no marker in any returned row
  - Plant the lister that also selects `data` and forwards it, record the failing seed and shrunk counterexample in `docs/kiro-usage.md`, then restore the projection
  - **Validates: P5**
  - _Requirements: R7.1, R7.2_

- [ ] 12. Set `healthCheckPath: /readyz` in `render.yaml` (M1-05)
  - One-line change to the web service health check; `render.yaml` is a hot file, touch nothing else
  - _Requirements: R8.1_

- [ ] 13. Record the spec and Kiro usage for M1-05 (M1-05)
  - Add the M1-05 row to `docs/kiro-usage.md` (date, ticket, surface, what ran, Kiro version, credits) with the five planted-bug counterexamples and seeds
  - Confirm `.kiro/specs/observability/` holds requirements, design and tasks
  - _Requirements: R9.1, R9.2_

- [ ] 14. Final checkpoint: run the M1-05 Validation Gate (M1-05)
  - Run the gate from `.github/plan/M1-05-observability.md`: `npm ci`, `make down && make up && npm run db:migrate`, `npm run test:integration -w apps/server -- --reporter=verbose logging health job-timings`, confirm `P-logs-carry-no-content` appears in the log, run `npm run jobs:dead-letters -w apps/server`, check `healthCheckPath: /readyz` in `render.yaml`, check `.kiro/specs/observability/requirements.md` and the `M1-05` entry in `docs/kiro-usage.md`, then `./scripts/landing-checks.sh`
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R3.1, R4.6, R5.5, R6.5, R7.4, R8.1, R9.2_

## Notes

- All items are required; no optional tasks.
- A task is marked `[x]` only after its tests pass.
- Property tasks that write to `docs/kiro-usage.md` sit in separate waves; task 13 adds the summary row afterward.
- `render.yaml` and `package-lock.json` are hot files; change them in these tasks only.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["3", "10"] },
    { "id": 2, "tasks": ["2", "4"] },
    { "id": 3, "tasks": ["5", "6"] },
    { "id": 4, "tasks": ["7", "8"] },
    { "id": 5, "tasks": ["9", "12"] },
    { "id": 6, "tasks": ["11"] },
    { "id": 7, "tasks": ["13"] },
    { "id": 8, "tasks": ["14"] }
  ]
}
```
