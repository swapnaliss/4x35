---
title: "M2-15 · Confidence + auto-approvable"
milestone: "M2 · Core Loop"
labels: ["backend", "critical"]
blocked_by: ["M2-11", "M2-12", "M2-13", "M2-14"]
estimate: "3h"
resources: ["SCHEMA"]
needs: []
---

## Context
The review queue's value is that a person approves high-confidence proposals in bulk and spends
time only on the rest (PROJECT.md journey step 5; success metric "auto-approvable share").
Architecture §2 fixes which provenance kinds can ever be auto-approved: `dataset`, `inferred` and
`external` never; LLM-labelled fields only when the deterministic validators agree (ADR 0008,
ADR 0014). This ticket turns a finished Proposal into a confidence, a risk rank and the Record state
`auto_approvable | needs_review | already_valid`.

## Scope
1. In Kiro, write `.kiro/specs/confidence/{requirements.md (EARS), design.md, tasks.md}` and log
   the session in `docs/kiro-usage.md`. Properties, each a fast-check test: **C1** a Proposal with
   any field of kind `dataset`, `inferred` or `external` is never `auto_approvable`; **C2** a
   Proposal with any `reject` finding is never `auto_approvable`; **C3** an LLM-origin field whose
   validators do not all agree makes the Proposal not `auto_approvable`; **C4** monotonicity: adding
   a finding or removing a field never raises confidence; **C5** the classification is a pure
   function of (Proposal, pack version, table version, threshold).
2. `packages/core/src/structuring/confidence-table.ts`: a closed, versioned table (`version: "1"`)
   giving a field confidence per (provenance kind, LLM origin, validators agree yes/no). Confidence
   of a Proposal = the minimum field confidence over mandatory fields for the target form.
3. `packages/core/src/structuring/classify.ts`: `classify(proposal, pack, form, threshold)` →
   `{ state, confidence, risk, reasons[] }`. `already_valid`: the original input is already a
   structured or hybrid address that passes the pack with no change. `auto_approvable`: C1–C3 hold,
   every mandatory element for the form is present, and confidence ≥ threshold. Otherwise
   `needs_review` with reason codes (i18n keys) explaining why. `risk` orders the review queue:
   reject findings first, then empty mandatory elements, then ascending confidence.
4. Threshold: `workspaces.settings.autoApproveThreshold` (jsonb, no migration), default from the
   table file, documented in the spec; the value used is stored on the Proposal.
5. Migration `drizzle/<next>_proposal_classification.sql` adding `proposals.risk` (integer, indexed with
   `records.batch_id` access in mind) and `proposals.classification` (jsonb: state, reasons, threshold,
   table version). SCHEMA (exclusive): this ticket adds a migration.
6. The final step of the structuring job calls `classify`, persists confidence and risk on the
   Proposal and moves the Record from `proposed` to its state in the same transaction as the
   `StructuringCompleted` event.

## Out of scope
- Changing parser or dataset outputs (M2-10 to M2-13). Measuring the auto-approvable share on real
  data (M2-25 on the synthetic set, M3-07 on the hand-labelled set). Any UI (M2-16, M2-18).

## Acceptance Criteria
1. Properties C1–C5 pass with fast-check at ≥ 1,000 runs each.
2. A table-driven unit test covers every row of the confidence table and every reason code.
3. An integration test structures 20 records from the synthetic fixtures and finds each in exactly
   one of `auto_approvable | needs_review | already_valid`, with confidence, risk and threshold
   persisted on its Proposal.
4. Re-running classification on unchanged data produces identical states and confidences
   (idempotent job, keyed by (batch, pack, step, chunk)).
5. `packages/core` still has no I/O import (the existing import-boundary check passes).

## Deliverables
- `.kiro/specs/confidence/{requirements.md,design.md,tasks.md}`; entry in `docs/kiro-usage.md`
- `packages/core/src/structuring/{confidence-table.ts,classify.ts}`
- `packages/core/test/{classify.test.ts,classify.property.test.ts}`
- `apps/server/test/integration/classify-job.test.ts`
- `packages/db/src/schema/proposals.ts` (columns), `drizzle/<next>_proposal_classification.sql`

## Validation Gate
```bash
npx vitest run packages/core/test/classify.test.ts packages/core/test/classify.property.test.ts
make reset && npm run db:migrate      # migration applies on a fresh database
npm run test:integration -w apps/server -- classify-job
npm run typecheck -w packages/core && npm run lint -w packages/core
```

## Handoff
- **M2-16** shows counts per state and the reason codes per country.
- **M2-17** sorts the queue by `risk` and bulk-approves only `auto_approvable` records; publish the
  `classify` result shape and reason-code list in the done note.
- **M2-25** reports the auto-approvable share at the default threshold.
