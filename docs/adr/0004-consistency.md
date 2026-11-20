# 0004. Consistency over availability

- Status: accepted (2026-11-20, Approval 2)

## Context
Audit integrity: a decision or export must never be half-written.

## Decision
One primary. Decisions, bulk approve and exports each run in one transaction. Optimistic concurrency via `records.version` (409 on conflict).

## Alternatives considered
Multi-region or eventual consistency (R4 is 99% single-region).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
