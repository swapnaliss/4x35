---
title: "M1-05 · Observability baseline"
milestone: "M1 · Walking Skeleton"
labels: ["backend", "infra"]
blocked_by: ["M1-04"]
estimate: "3h"
resources: []
needs: ["P-03", "P-11", "P-12"]
---

## Context
ADR 0015 and `docs/architecture.md` §9: pino JSON logs with request and job correlation IDs and
**no file content** (R8: addresses are personal data), per-job timings in `job_timings`, a
dead-letter view, and a Render health check. The SLOs (health report p95 ≤ 30 s, job failure rate
< 1%) can only be measured with these in place; M3-08's load test reads `job_timings`.

## Scope
1. Write the Kiro spec `.kiro/specs/observability/{requirements.md,design.md,tasks.md}` in Kiro with
   EARS requirements and the named property `P-logs-carry-no-content`. Log it in `docs/kiro-usage.md`.
2. `apps/server/src/obs/logger.ts`: pino 10.4.0 at `LOG_LEVEL`, JSON in production, with a
   serializer allow-list (request: method, route pattern, status, duration, request id, user id,
   workspace id; job: kind, job id, batch id, chunk, attempt, outcome, ms). Bodies, query strings,
   headers other than `user-agent`, cookies and file names are never logged. Redaction paths cover
   `password`, `token`, `*.original*`, `*.lines*`, `*.name`.
3. Request middleware: accepts an incoming `X-Request-Id` only if it matches `^[A-Za-z0-9-]{8,64}$`,
   otherwise generates one; echoes it in the response; binds a child logger to the request.
4. Job wrapper around `defineJob` (M1-04): a child logger with `jobId` and the originating
   `requestId` (carried in the job payload metadata), and one `job_timings` row per attempt
   (`job_id, kind, batch_id, chunk, ms, outcome`).
5. `GET /healthz` (process up, no DB) and `GET /readyz` (DB `select 1` within 2 s and, in worker
   modes, pg-boss started). Both public, registered in the authZ matrix as `public` once M1-03 has
   landed (rebase onto it if it merged first).
6. `listDeadLetters(tx, {limit})` and `npm run jobs:dead-letters -w apps/server` printing kind,
   job id, batch id, attempts and the error class only (no payload).
7. Point the Render health check at `/readyz` in `render.yaml` (hot file; one line).

## Out of scope
- An owner-only dead-letter HTTP route (M1-08). Tracing, metrics endpoints, APM (ADR 0015 rejects them for now).
- The daily synthetic run of the core flow on a sandbox workspace (needs the slice and sandboxes;
  see M3-09).

## Acceptance Criteria
1. `P-logs-carry-no-content`: an integration test sends requests and runs jobs whose bodies and
   payloads contain random marker strings (fast-check generated, including CJK and Devanagari) and
   asserts no captured log line contains any marker.
2. Every log line from a request carries the same `requestId` as the `X-Request-Id` response
   header; a job enqueued by that request logs the same `requestId` and its own `jobId`.
3. A malformed incoming `X-Request-Id` (e.g. containing a newline) is replaced, not echoed.
4. After a job succeeds once and another fails three times then dead-letters, `job_timings` holds
   1 and 4 rows respectively with the right outcomes, and `npm run jobs:dead-letters` lists the
   second job without its payload.
5. `GET /readyz` returns 200 with the stack up and 503 within 3 s when Postgres is stopped;
   `GET /healthz` returns 200 in both cases.
6. `render.yaml` sets `healthCheckPath: /readyz`.
7. `.kiro/specs/observability/` exists and `docs/kiro-usage.md` has an entry for this ticket.

## Deliverables
- `.kiro/specs/observability/requirements.md`, `design.md`, `tasks.md`
- `apps/server/src/obs/{logger,request-id,job-wrapper,health,dead-letters}.ts`
- `apps/server/scripts/dead-letters.ts`
- `apps/server/test/logging.int.test.ts`, `apps/server/test/health.int.test.ts`, `apps/server/test/job-timings.int.test.ts`
- `render.yaml` (health check path); `docs/kiro-usage.md` entry

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
make down && make up && npm run db:migrate
npm run test:integration -w apps/server -- --reporter=verbose logging health job-timings | tee "$TMPDIR/m1-05-int.log"
grep -q "P-logs-carry-no-content" "$TMPDIR/m1-05-int.log"
npm run jobs:dead-letters -w apps/server > "$TMPDIR/m1-05-dlq.txt"
grep -q "healthCheckPath: /readyz" render.yaml
test -f .kiro/specs/observability/requirements.md && grep -q "M1-05" docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff
- Every later route and job logs through `obs/logger.ts`; adding a logged field means adding it to
  the allow-list, never logging a body.
- M1-08 exposes `listDeadLetters` at an owner-only route. M3-08 reads `job_timings` for the load
  test numbers; M3-09 can build the daily synthetic check on `/readyz` plus the slice flow.
