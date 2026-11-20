---
title: "M2-23 · 30-day purge cascade"
milestone: "M2 · Core Loop"
labels: ["backend", "security"]
blocked_by: ["M1-GATE"]
estimate: "3h"
resources: []
needs: []
---

## Context
R5 and ADR 0023: uploads and derived records are deleted 30 days after upload, cascading to
proposals, decisions, links, pre-flight runs and exports; audit events keep only hashes; locked
batches and judge sandboxes (until 29 Jan 2027) are skipped. Addresses are personal data under GDPR
and DPDP (PROJECT.md §9.1). The Batch state machine ends in `purged` (tombstone).

## Scope
1. In Kiro, write `.kiro/specs/retention/{requirements.md (EARS), design.md, tasks.md}` and log the
   session in `docs/kiro-usage.md`. Properties (fast-check over generated batch sets and clocks):
   **T1** a batch is purged iff `purge_after < now`, it is not `locked`, and its workspace is not a
   sandbox (or the date is after 2027-01-29); **T2** after a purge no row in `records`, `proposals`,
   `decisions`, `payment_file_links`, `preflight_runs` or `exports` references the batch, and its
   original bytes are gone; **T3** running the purge twice is the same as once.
2. `packages/core/src/retention/eligible.ts` (pure): the T1 rule with the clock passed in; the
   sandbox cut-off date is a named constant.
3. `apps/server/src/modules/retention/purge-job.ts`: a pg-boss scheduled job (daily, 03:00 UTC)
   that selects eligible batches and purges each in its own transaction, deleting child rows in
   dependency order (exports, preflight_runs, payment_file_links where either side is the batch,
   decisions, proposals, records), clearing `original` bytes and `column_map`, setting status
   `purged`, and writing an audit event `batch.purged` with the batch sha256 and counts only. Through
   the repository layer with an explicit system actor; no migration.
4. `llm_cache` rows older than 30 days are deleted in the same job (they hold substrings of
   addresses).
5. Job timings to `job_timings`; failures retry 3 times then dead-letter (ADR 0006).

## Out of scope
- A UI or API to lock batches (a later ticket if needed; log to BL-01). Nightly sandbox reset
  (M3-09). Backup retention (Render-managed; described in the privacy notice, M3-12).

## Acceptance Criteria
1. T1–T3 pass at ≥ 1,000 runs.
2. Integration test with an injected clock: of five batches (expired, not expired, expired+locked,
   expired in a sandbox before 2027-01-30, expired in a sandbox after), exactly the first and last
   are purged; row counts per table prove the cascade.
3. After a purge, `audit_events` still has every earlier event for the batch plus `batch.purged`,
   and no audit event contains address text (test scans `data_hash` and payload fields).
4. A purge interrupted mid-batch (forced error after the first delete) leaves the batch fully
   intact (transaction rolled back) and succeeds on retry.
5. The job is registered on server start with a daily schedule (test lists pg-boss schedules).

## Deliverables
- `.kiro/specs/retention/*`; entry in `docs/kiro-usage.md`
- `packages/core/src/retention/eligible.ts`, `packages/core/test/retention.property.test.ts`
- `apps/server/src/modules/retention/{purge-job.ts,repository.ts}`
- `apps/server/test/integration/purge.test.ts`

## Validation Gate
```bash
npx vitest run packages/core/test/retention.property.test.ts
npm run test:integration -w apps/server -- purge
npm run typecheck && npm run lint
```

## Handoff
- **M3-09** sets `is_sandbox` on judge workspaces; the purge already skips them until 2027-01-29.
- **M3-12** states the 30-day rule and the audit-hash exception in the privacy notice.
- New child tables added later must be added to the purge order; say so in the done note.
