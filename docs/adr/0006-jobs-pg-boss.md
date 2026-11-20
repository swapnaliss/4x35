# 0006. Jobs in Postgres with pg-boss

- Status: accepted (2026-11-20, Approval 2)

## Context
R2: structuring 20,000 rows must not block requests; no Redis budget or need.

## Decision
pg-boss in the same database. Jobs are enqueued in the same transaction as the state change (no separate outbox relay). Work is chunked (≤ 200 records), results are persisted per record, handlers are idempotent by (batch, pack, step, chunk), retries 3 with jittered backoff, then dead-letter (visible in admin). The same image runs `MODE=web|worker|all`; `all` at launch. The UI polls status; no SSE.

## Alternatives considered
Redis/BullMQ (another service); in-request processing (breaks R2); SSE (adds connection handling for no requirement).

## Consequences
Cost to reverse: Medium. See [architecture](../architecture.md).
