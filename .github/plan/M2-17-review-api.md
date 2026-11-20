---
title: "M2-17 · Review API (409, bulk, four-eyes, reopen)"
milestone: "M2 · Core Loop"
labels: ["backend", "security", "critical"]
blocked_by: ["M2-15"]
estimate: "6h"
resources: []
needs: ["P-03", "P-11", "P-12"]
---

## Context
Pillar P4 and journey step 5: a human approves every change (PROJECT.md §9). Decisions are
append-only and transactional (ADR 0004); stale writes return 409 through `records.version`
(architecture §7); the optional four-eyes rule stops the uploader approving (ADR 0013); edits made
through an API token carry `external` provenance and need a UI reviewer's approval (architecture §2).
R2 sets review action p95 ≤ 300 ms. This ticket is the server side the review grid (M2-18), record
detail (M2-19), linking (M2-20) and later the MCP server and Crew app build on.

## Scope
1. In Kiro, write `.kiro/specs/review/{requirements.md (EARS), design.md, tasks.md}` and log the
   session in `docs/kiro-usage.md`. Properties, each a fast-check test over generated decision
   sequences: **V1** the Record state machine is never left (only the transitions in architecture
   §2); **V2** a decision with a stale `proposalVersion` changes nothing; **V3** with four-eyes on,
   the uploader's approve never succeeds; **V4** an `edit` stores values with provenance `human`
   (session) or `external` (token) only, never truncated, and an over-length or out-of-charset value
   becomes a finding, not a cut value.
2. `packages/core/src/review/decide.ts` (pure): validates an action against the record state,
   version, actor, four-eyes setting and the element map for the batch's message version; returns
   the new state and the Decision to append.
3. Endpoints (zod-openapi, CSRF on session mutations, `Idempotency-Key` on POSTs, problem+json):
   - `GET /api/batches/{id}/records?status=&country=&ruleId=&sort=risk&cursor=` → cursor page of
     records with their latest proposal summary.
   - `GET /api/records/{id}` → record, original lines, latest proposal (fields with provenance,
     findings, confidence), decision history.
   - `POST /api/records/{id}/decisions` `{ action: approve|edit|unknown|reopen, proposalVersion,
     fields? }` → 200 with the new state, or 409 problem+json with the current version.
   - `POST /api/batches/{id}/bulk-approve` `{ items: [{ id, proposalVersion }] }` (≤ 1,000 items) →
     per-item results `ok | conflict | forbidden | not_auto_approvable`; one transaction; only
     `auto_approvable` records are approved; anything else is reported, not changed.
4. Each decision writes the Decision row, bumps `records.version`, writes `DecisionRecorded` and an
   audit event in one transaction. When every record is decided, `BatchReviewed` moves the batch to
   `reviewed`; a reopen moves it back to `ready_for_review`.
5. Token actors: an `edit` is stored as `external`; `approve` with a token actor is refused (403)
   until a session reviewer approves. (Token issuing is M3-01; this ticket handles `actor_kind`.)
6. Every endpoint, including each ID in a bulk array, goes through the workspace-scoped repository
   and appears in the authZ matrix test (cross-workspace IDs → 404, reviewer vs owner).

## Out of scope
- The review grid and record detail UI (M2-18, M2-19). API tokens and their scopes (M3-01).
  Linking decisions for payment files (M2-20).

## Acceptance Criteria
1. Properties V1–V4 pass at ≥ 1,000 runs each.
2. Two concurrent approves of the same record at the same `proposalVersion` (integration test,
   two connections): exactly one 200 and one 409; one Decision row; `version` incremented once.
3. Bulk approve of 500 synthetic records with 3 stale versions, 2 foreign-workspace IDs and 5
   non-auto-approvable IDs returns per-item results with exactly those counts, and the database shows
   only the `ok` items approved.
4. With four-eyes on, the uploader's approve returns 403 problem+json and a second member's approve
   succeeds; with four-eyes off, the uploader can approve.
5. Reopen moves an approved record back to `needs_review`, keeps both Decisions, and moves a
   `reviewed` batch back to `ready_for_review`.
6. Repeating a POST with the same `Idempotency-Key` returns the stored response and appends nothing.
7. An `edit` with a 71-character StrtNm returns 200 with a finding `length.exceeded` on that field and
   the full value kept (never truncated); an edit putting a value into `BldgNm` on a pain.001.001.03
   batch is routed per the element map (AdrLine in hybrid if the pack allows, otherwise a finding).
8. Review action p95 ≤ 300 ms over 200 sequential decisions on a 500-record batch on the local stack
   (measured and printed by the integration test).
9. The authZ matrix test covers all four endpoints and passes.

## Deliverables
- `.kiro/specs/review/*`; entry in `docs/kiro-usage.md`
- `packages/core/src/review/decide.ts`, `packages/core/test/decide.property.test.ts`
- `apps/server/src/modules/review/{routes.ts,repository.ts,service.ts}`
- `apps/server/test/integration/review-api.test.ts`, authZ matrix rows
- OpenAPI regenerated (`apps/server/openapi.json` or the path M1-07 chose)

## Validation Gate
```bash
npx vitest run packages/core/test/decide.property.test.ts
npm run test:integration -w apps/server -- review-api
npm run test:integration -w apps/server -- authz-matrix
npm run typecheck && npm run lint
```

## Handoff
- **M2-18/M2-19**: the endpoint shapes, the 409 body (`currentVersion`), the bulk result shape and
  the reason codes; put them in the done note.
- **M2-20** uses `GET /api/records/{id}` and only applies records in `approved | edited`.
- **M2-22** reads Decisions (actor, time) for the audit report.
- **M3-01/M3-02** expose these endpoints to tokens and MCP; `external` handling is ready.
