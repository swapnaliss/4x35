---
title: "M2-20 · PaymentFileLink matching + ambiguous review"
milestone: "M2 · Core Loop"
labels: ["backend", "frontend"]
blocked_by: ["M2-03", "M2-17"]
estimate: "6h"
resources: []
needs: ["P-03", "P-11", "P-12", "P-30"]
---

## Context
Journey step 6: approved master-list addresses reach the payment file being pre-flighted. ADR 0022:
match each payment-file party to a master-list record by IBAN or account number plus a normalised
name; exactly one match links, several or none go to review; only `approved | edited` records are
applied; links are recorded and audited. The pain.001 party locations and byte ranges come from the
M2-03 SAX reader.

## Scope
1. In Kiro, write `.kiro/specs/payment-file-link/{requirements.md (EARS), design.md, tasks.md}` and
   log the session in `docs/kiro-usage.md`. Properties: **L1** a party is `matched` only if exactly
   one master record has the same account key and normalised name; **L2** a record not in
   `approved | edited` is never applied; **L3** name normalisation is idempotent and
   case/whitespace/NFC-insensitive; **L4** linking the same pair of batches twice gives the same
   links (idempotent).
2. `packages/core/src/linking/{normalise-name.ts,match.ts}` (pure): account key = IBAN (validated,
   spaces removed, upper case) or other account ID as given; name = NFC, case-fold, whitespace
   collapse, punctuation removal, and a closed, versioned list of legal-form tokens (for example
   GmbH, Ltd, KK, Pvt) removed for matching only. The parties linked are those in the pack's party
   scope (for example Cdtr, Dbtr).
3. Job `link` (pg-boss, chunks ≤ 200, idempotent by (batch, pack, step, chunk)) enqueued by
   `POST /api/batches/{paymentBatchId}/links` `{ masterBatchId }` in the same transaction as the
   request's state change; writes `payment_file_links` rows and `PaymentFileLinked` + audit events.
4. `GET /api/batches/{paymentBatchId}/links?status=` and
   `POST /api/links/{id}/resolve` `{ masterRecordId | null }` (a person resolves an ambiguous or
   unmatched party; `null` = keep the original address). CSRF, `Idempotency-Key`, workspace-scoped,
   authZ matrix rows.
5. Screen `apps/web/src/routes/batches/$batchId/links.tsx` (build to
   `docs/design/screens/link-review.md`; ask `ux-designer` if missing): counts by status; the
   ambiguous list with each candidate (masked account, name, proposed address, decision state) and
   keyboard selection (`j`/`k`, `1`–`9` pick candidate, `n` none); loading, empty, error states;
   i18n keys in `apps/web/src/i18n/en/links.json`.

## Out of scope
- Applying addresses to the file and pre-flight (M2-21). Writing the corrected file (M2-22).
  Fuzzy name matching beyond the normalisation above.

## Acceptance Criteria
1. Properties L1–L4 pass at ≥ 1,000 runs.
2. On the synthetic demo pain.001 and master list (M2-24's fixtures, or equivalent synthetic
   fixtures committed in this ticket if M2-24 has not landed), the integration test reports exact
   counts of `matched | ambiguous | none` that equal the fixture's expected counts.
3. A party whose master record is `needs_review` is linked as `matched` but flagged "not applied
   until approved", and is not applied (L2 integration check).
4. Resolving an ambiguous link records a Decision-like audit event with actor and time; resolving
   twice with the same `Idempotency-Key` appends nothing.
5. Cross-workspace `masterBatchId` returns 404; the authZ matrix test covers all endpoints.
6. The links screen works by keyboard alone, renders loading/empty/error states and has zero axe
   WCAG 2.2 AA violations (Playwright).
7. `ui-reviewer` returns PASS on screenshots at 375/768/1440, light and dark, all states.

## Deliverables
- `.kiro/specs/payment-file-link/*`; entry in `docs/kiro-usage.md`
- `packages/core/src/linking/{normalise-name.ts,legal-forms.ts,match.ts}`, `packages/core/test/linking/*.property.test.ts`
- `apps/server/src/modules/linking/{routes.ts,job.ts,repository.ts}`
- `apps/server/test/integration/linking.test.ts`, authZ matrix rows
- `apps/web/src/routes/batches/$batchId/links.tsx`, `apps/web/src/i18n/en/links.json`, `apps/web/e2e/links.spec.ts`

## Validation Gate
```bash
npx vitest run packages/core/test/linking
npm run test:integration -w apps/server -- linking
npm run test:integration -w apps/server -- authz-matrix
npx playwright test apps/web/e2e/links.spec.ts
npm run typecheck && npm run lint
```

## Handoff
- **M2-21** reads `matched` links whose master record is `approved | edited` and applies those
  addresses through the element map; publish the link row shape and the job name.
- **M2-22** records which links were applied in the audit report.
- **M2-24** must provide a pain.001 whose parties include matched, ambiguous and unmatched cases.
