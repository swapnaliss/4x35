---
title: "M1-04 · Async foundation: pg-boss in-tx, chunks, retries, DLQ, status polling"
milestone: "M1 · Walking Skeleton"
labels: ["backend", "infra", "critical"]
blocked_by: ["M1-02"]
estimate: "5h"
resources: ["LOCK"]
needs: ["P-02", "P-03", "P-11", "P-12"]
---

## Context
R2 (20,000 rows must not block requests) and ADR 0006: pg-boss in the same Postgres, jobs enqueued
in the state-change transaction (no outbox relay), chunks of ≤ 200 records, handlers idempotent by
(batch, pack, step, chunk), 3 retries with jittered backoff, then dead-letter, and the UI polls.
ADR 0005 adds `Idempotency-Key` on POSTs. Every pipeline step from M1-07 onward runs on this.

## Scope
1. Write the Kiro spec `.kiro/specs/jobs/{requirements.md,design.md,tasks.md}` in Kiro with EARS
   requirements and named properties `P-chunking-covers-once`, `P-handler-idempotent`,
   `P-idempotency-key-replay`. Log it in `docs/kiro-usage.md`.
2. `apps/server/src/jobs/boss.ts`: start pg-boss 12.38.2 on `DATABASE_URL`, only when
   `MODE` is `worker` or `all`; graceful stop on SIGTERM (finish active jobs up to 25 s).
   LOCK: this ticket adds `pg-boss` to `apps/server`.
3. `enqueueInTx(tx, kind, payload, key)`: sends the job through pg-boss using the caller's
   transaction (pg-boss `db` executor option), so a rolled-back state change enqueues nothing.
   `key = {batchId, packRef, step, chunk}` becomes the pg-boss `singletonKey`.
4. `chunk(ids, 200)` in `packages/core/src/jobs/chunk.ts` (pure) and `fanOut(tx, batchId, step, ids)`
   that enqueues one job per chunk.
5. Job registry `defineJob({kind, schema, handler})`: payload validated by zod; `retryLimit: 3`,
   exponential backoff with full jitter (verify pg-boss's behaviour; compute `retryDelay` here if it
   has no jitter); after the last failure the job goes to the dead-letter queue `<kind>.dlq`.
   Handlers receive `{tx, payload, jobId}` and must write results by upsert keyed on
   (record, pack ref, step), so a replayed chunk changes nothing.
6. `getBatchProgress(tx, batchId)`: counts of records per status plus queued/active/failed/dead
   job counts for that batch, the query the status endpoint (M1-07) polls.
7. Idempotency middleware `apps/server/src/middleware/idempotency.ts`: on POST with
   `Idempotency-Key`, stores `(key, workspace_id, request_hash, response)` for 24 h; a replay with
   the same body returns the stored response; the same key with a different body returns 422
   problem+json. Applied to every POST by default.
8. Tests run against real Postgres and a real pg-boss using a test-only job kind registered in the
   test file (nothing test-only is registered in product code).

## Out of scope
- Real pipeline jobs (parse, structure, report): M1-07 and M2 tickets register them.
- Logging, correlation IDs and `job_timings` writes (M1-05). The dead-letter admin route (M1-08).
- The HTTP status endpoint and UI polling (M1-07).

## Acceptance Criteria
1. `npm run test:integration -w apps/server -- jobs` passes against `make up` Postgres, including:
   a. a transaction that enqueues a job and then rolls back leaves no job in pg-boss;
   b. `P-chunking-covers-once` (fast-check, ≥ 500 runs): for any list of up to 20,000 IDs, chunks
      are ≤ 200 long and cover every ID exactly once in order;
   c. `P-handler-idempotent`: running the same chunk job twice (forced replay) leaves the same rows
      as running it once;
   d. a handler that always throws is attempted 4 times in total with increasing, non-identical
      delays and then appears in `<kind>.dlq`;
   e. enqueuing the same `(batch, pack, step, chunk)` twice creates one job.
2. `P-idempotency-key-replay`: a POST replayed with the same key and body returns the identical
   status and body without running the handler again; a different body with the same key returns 422.
3. `getBatchProgress` returns correct counts for a batch with records in three statuses and jobs
   in queued, failed and dead-letter states.
4. With `MODE=web` the process does not start pg-boss workers; with `MODE=worker` it does not
   listen on `PORT` (checked by a startup test).
5. `.kiro/specs/jobs/` exists and `docs/kiro-usage.md` has an entry for this ticket.

## Deliverables
- `.kiro/specs/jobs/requirements.md`, `design.md`, `tasks.md`
- `apps/server/src/jobs/{boss,enqueue,registry,progress}.ts`, `packages/core/src/jobs/chunk.ts`
- `apps/server/src/middleware/idempotency.ts`
- `apps/server/test/jobs.int.test.ts`, `apps/server/test/idempotency.int.test.ts`,
  `apps/server/test/mode.int.test.ts`, `packages/core/test/chunk.property.test.ts`
- `docs/kiro-usage.md` entry

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
make down && make up && npm run db:migrate
npm run test -w packages/core -- chunk
npm run test:integration -w apps/server -- --reporter=verbose jobs idempotency mode | tee "$TMPDIR/m1-04-int.log"
for p in P-chunking-covers-once P-handler-idempotent P-idempotency-key-replay; do
  grep -q "$p" "$TMPDIR/m1-04-int.log" || grep -rq "$p" packages/core/test || { echo "missing $p"; exit 1; }
done
test -f .kiro/specs/jobs/requirements.md && grep -q "M1-04" docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff
- M1-05 wraps `defineJob` handlers with logging, correlation IDs and `job_timings` writes, and lists
  dead letters.
- M1-07 registers the parse, country-structuring, report and export jobs with `defineJob`, enqueues
  them with `enqueueInTx`, and serves `getBatchProgress` at the status endpoint.
- Every later POST gets `Idempotency-Key` handling for free; routes that must not be replayed opt
  out explicitly and say why.
