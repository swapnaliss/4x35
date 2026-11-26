# Implementation Plan: Observability (M1-05)

## Overview

Builds the observability baseline in dependency order: logger and serializers, request ID middleware, request ID carried into jobs, job wrapper with `job_timings`, health endpoints, dead-letter listing, then the Render health check. Each property task adds its fast-check test, records one planted bug (failing seed and shrunk counterexample) in `docs/kiro-usage.md`, then restores the real code. Integration tests run against real Postgres and pg-boss with a Test_Job registered only in test files. The language is TypeScript, as in the design.

## Tasks

- [x] 1. Implement the Logger and Log_Serializer in `apps/server/src/obs/logger.ts` and add `pino` to `apps/server` (M1-05)
  - `createLogger({level, destination})` on pino 10.4.0, level from `LOG_LEVEL`, JSON lines in every `NODE_ENV`
  - `requestSerializer` and `jobSerializer` build a new object field by field from the allow-list (request: method, route, status, durationMs, requestId, userId, workspaceId, userAgent; job: kind, jobId, batchId, chunk, attempt, outcome, ms); they never spread the input
  - Redaction is a custom walker in `formatters.log` (not pino's `redact` option) for `password`, `token`, `*.original*`, `*.lines*`, `*.name`, censor `"[redacted]"`; a top-level `LOGGED_FIELDS` allow-list; a `logMethod` hook (an `Error` is logged by class only, no printf interpolation)
  - Example tests in `apps/server/test/logger.test.ts` for JSON output, the allow-list, each redaction path and error class only
  - _Requirements: R1.1, R1.2, R2.1, R2.2, R2.3, R2.4, R2.5_

- [x] 2. Write property test P4 serializers emit only allow-listed fields in `apps/server/test/logger.test.ts` (M1-05)
  - Test name contains `P4`; 1000 runs per serializer (as built); `fc.record` inputs with the allow-listed fields plus `fc.dictionary` extra keys (body, query string, header map, file name), including CJK and Devanagari values
  - Plant the serializer that spreads the raw input (`{ ...input, requestId }`), planted bug caught after 1 run, `seed=5054` (recorded in the test output; copy to `docs/kiro-usage.md` in task 13)
  - **Validates: P4**
  - _Requirements: R2.1, R2.2, R2.3, R2.4_

- [x] 3. Implement `requestLogging` in `apps/server/src/obs/request-id.ts` and register it on the server app (M1-05)
  - Accept `X-Request-Id` only if it matches `^[A-Za-z0-9-]{8,64}$`, otherwise generate one and discard the incoming value; set it on every response, including error responses
  - Bind `{requestId, log}` in an `AsyncLocalStorage`; export `currentContext()` and `runWithContext()`; `app.onError` logs the error class only
  - Log one `request completed` line through `requestSerializer` with the matched route pattern, never the raw path or query string
  - Example tests in `logging.int.test.ts` for a valid id echoed, a missing id generated, and a header containing a newline replaced
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5_

- [x] 4. Implement `meta.requestId` propagation in `apps/server/src/jobs/enqueue.ts` and `apps/server/src/jobs/registry.ts` (M1-05)
  - `JobData` gains optional `meta: {requestId}`; `enqueueInTx` reads `currentContext()` and sets `meta` when present, omits it otherwise
  - `key` and `payload` and the per-kind payload validation are unchanged
  - `enqueueInTx` reads `currentContext()`; covered by the AC 2 test in `logging.int.test.ts` (a job enqueued in a request logs the same `requestId` and its own `jobId`)
  - _Requirements: R5.1, R5.2_

- [x] 5. Write property test P2 request ID is accepted, generated, echoed and consistent in `apps/server/test/logging.int.test.ts` (M1-05)
  - Test name contains `P2`; 200 runs (as built); header arbitrary is absent, matching `^[A-Za-z0-9-]{8,64}$`, or violating it (too short, too long, newline, space, `<`, control characters)
  - Asserts the response header equals the incoming value when valid, is fresh otherwise, and every captured log line for the request carries that `requestId`
  - Plant the middleware that echoes the malformed header verbatim, planted bug caught after 3 runs, `seed=5052`, counterexample `{"v":"Lxwo","ok":false}`
  - **Validates: P2**
  - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.6_

- [x] 6. Implement `observeAttempt` and `failureOutcome` in `apps/server/src/obs/job-wrapper.ts` and call it from `runJob` in `apps/server/src/jobs/boss.ts` (M1-05)
  - `observeAttempt(db, logger, info, run)` binds a child logger with `jobId` and `requestId` and runs the handler in `runWithContext`; the `job attempt` line carries `kind`, `batchId`, `chunk`, `attempt`, `outcome`, `ms`
  - Outcome is `completed`, `failed` while `retryCount < retryLimit`, and `dead_letter` once `retryCount >= retryLimit` (`failureOutcome`); one `job_timings` row per attempt, inserted outside the handler's transaction
  - Log the error class name only, never the message; re-throw the original error so M1-04 retry and dead-letter behaviour is unchanged; an insert failure never changes the job outcome
  - Example tests in `apps/server/test/job-timings.int.test.ts`: one success gives 1 row `completed`; three failures then dead-letter give 4 rows with the right outcomes; job log lines carry the request's `requestId` and their own `jobId`
  - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5_

- [x] 7. Write property test P3 one `job_timings` row per attempt in `apps/server/test/job-timings.int.test.ts` (M1-05)
  - Test name contains `P3`; 100 runs (as built: direct `observeAttempt` calls on a real database, not pg-boss retries); plans are success at attempt k in 1..`retryLimit + 1` or fail on every attempt; chunk 0..50
  - Planted bug (row inserted inside the handler's transaction) caught after 1 run, `seed=5053`, counterexample `[null,0]`
  - **Validates: P3**
  - _Requirements: R5.3, R5.4, R5.5_

- [x] 8. Implement `registerHealth`, `readiness`, `createProbePool` and `selectOne` in `apps/server/src/obs/health.ts`, add `JobRuntime.isStarted()` in `apps/server/src/jobs/boss.ts`, and register the routes (M1-05)
  - `GET /healthz` returns 200 without touching the database
  - `GET /readyz` runs `select 1` on a dedicated probe pool (`max: 1`) raced against a 2 s timer; checks `database` and `jobs` report `ok`, `unavailable`, `timeout` or `not configured`; a failing check returns 503; in `worker` and `all` modes it also requires pg-boss started
  - Registering both routes as `public` in the AuthZ_Matrix belongs to M1-03; no matrix exists in the code yet, so no test here covers it
  - Tests in `apps/server/test/health.int.test.ts`: `/readyz` 200 with the stack up; 503 within 3 s with Postgres stopped (11 ms) or not answering (about 2 s) while `/healthz` stays 200; 200 again when Postgres is back; 503 with `jobs: unavailable` when pg-boss is stopped in a worker mode
  - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.6_

- [x] 9. Write property test P-logs-carry-no-content in `apps/server/test/logging.int.test.ts` (M1-05)
  - Test name contains `P-logs-carry-no-content` (P1); `numRuns` at least 50; Marker_Strings from Latin with diacritics (NFC and NFD), CJK and Devanagari, placed in a request body, query string, extra header, file name or job payload field
  - Runs real requests and a real job against a logger writing to an in-memory stream and asserts no captured line contains any marker
  - Plant the request serializer that logs the raw URL including the query string instead of the route pattern, planted bug caught after 1 run, `seed=5051`, counterexample query marker `東्QSRLYQNRWG`
  - **Validates: P1**
  - _Requirements: R3.1_

- [x] 10. Implement `listDeadLetters` and `formatDeadLetters` in `apps/server/src/obs/dead-letters.ts`, `apps/server/scripts/dead-letters.ts` and the `jobs:dead-letters` npm script (M1-05)
  - `listDeadLetters(tx, {limit})` reads the `<kind>.dlq` rows of `pgboss.job` and projects only `source_name` (kind), `source_id` (job id), the batch id from `data`, attempts, the error class from `source_output ->> 'name'` and `created_on` (`deadAt`); no query selects `data` or `output` as a whole; newest first, at most `limit` rows (1..1000, default 100)
  - `apps/server/scripts/dead-letters.ts` prints `formatDeadLetters` (a header line, then one tab-separated line per row, no payload) and `dead letters: <n>` on stderr; on failure it prints the error class only and exits 1
  - Add `"jobs:dead-letters"` to `apps/server/package.json` scripts so `npm run jobs:dead-letters -w apps/server` runs it
  - Example test (AC 4, in `job-timings.int.test.ts`): a job that failed 4 times and dead-lettered appears in the script output without its payload
  - _Requirements: R7.1, R7.2, R7.3, R7.4_

- [x] 11. Write the dead-letter listing example check in `apps/server/test/job-timings.int.test.ts` (M1-05)
  - Not a property as built: each dead letter needs 4 real pg-boss attempts with backoff, so 50 runs is not runnable. An example-based check replaces P5 (AC 4 test)
  - Asserts the limit is honoured, no payload is returned, and only the error class is carried
  - No planted-bug record, because it is not a property
  - _Requirements: R7.1, R7.2_

- [ ] 12. Set `healthCheckPath: /readyz` in `render.yaml` (M1-05)
  - Blocked: `render.yaml` does not exist on main; it is M0-07's blueprint (issue #9, open), so the one-line health check path waits for M0-07
  - One-line change to the web service health check; `render.yaml` is a hot file, touch nothing else
  - _Requirements: R8.1_

- [x] 13. Record the spec and Kiro usage for M1-05 (M1-05)
  - Add the M1-05 row to `docs/kiro-usage.md` (date, ticket, surface, what ran, Kiro version, credits) with the four planted-bug counterexamples and seeds (P1 5051, P2 5052, P3 5053, P4 5054)
  - Confirm `.kiro/specs/observability/` holds requirements, design and tasks
  - _Requirements: R9.1, R9.2_

- [ ] 14. Final checkpoint: run the M1-05 Validation Gate (M1-05)
  - Run the gate from `.github/plan/M1-05-observability.md`: `npm ci`, `make down && make up && npm run db:migrate`, `npm run test:integration -w apps/server -- --reporter=verbose logging health job-timings`, confirm `P-logs-carry-no-content` appears in the log, run `npm run jobs:dead-letters -w apps/server`, check `healthCheckPath: /readyz` in `render.yaml` (waits for M0-07, task 12), check `.kiro/specs/observability/requirements.md` and the `M1-05` entry in `docs/kiro-usage.md`, then `./scripts/landing-checks.sh`
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R3.1, R4.6, R5.5, R6.5, R7.4, R8.1, R9.2_

## Notes

- All items are required; no optional tasks.
- A task is marked `[x]` only after its tests pass.
- Checkpoint run: the integration tests (15) and unit tests (17) pass, `tsc -b apps/server/test` and `biome check apps/server` are clean. Tasks 12, 13 and 14 stay open: `render.yaml` is absent, `docs/kiro-usage.md` has no M1-05 row yet, and the gate has not run.
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
