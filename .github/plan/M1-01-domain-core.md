---
title: "M1-01 · Domain core: entities, provenance constructor, state machines, property tests"
milestone: "M1 · Walking Skeleton"
labels: ["backend", "critical"]
blocked_by: ["M0-GATE"]
estimate: "6h"
resources: ["LOCK"]
needs: ["P-03", "P-11", "P-12"]
---

## Context
R6 (never invent, never truncate, same input + same pack version → same output) is the product's
promise and the Technological Implementation criterion's showcase ("property tests for every
invariant"). ADR 0008 requires the promise to be enforced by a constructor, not by convention, and
ADR 0001 requires `packages/core` to be pure. Every later structuring, review and export ticket
builds on the types and the provenance checker written here, so it is on the critical path.

## Scope
1. Write the Kiro spec `.kiro/specs/domain-core/{requirements.md,design.md,tasks.md}` in Kiro:
   EARS requirements for provenance, length handling and the state machines, and these named
   property-test properties: `P-never-invent`, `P-span-exact`, `P-transform-replays`,
   `P-no-truncation`, `P-not-auto-approvable`, `P-proposal-deterministic`, `P-batch-transitions`,
   `P-record-transitions`. Log the Kiro session in `docs/kiro-usage.md`. Work the spec's tasks in order.
2. Entity types and zod schemas in `packages/core/src/entities/` for Workspace, User, Membership
   (`owner | reviewer`), Batch, Record, Proposal, Decision, AuditEvent, matching
   `docs/architecture.md` §2. Original lines are `readonly`.
3. `packages/core/src/elements.ts`: the PostalAddress24 element list with maximum lengths
   (StrtNm 70, BldgNb 16, BldgNm 35, Flr 70, PstBx 16, Room 70, PstCd 16, TwnNm 35, TwnLctnNm 35,
   DstrctNm 35, CtrySubDvsn 35, Ctry 2, AdrLine 70 × 0..7). The per-message-version element map is
   M2-06, not this ticket.
4. `packages/core/src/provenance.ts` (hot file): the six provenance kinds as a discriminated union
   and `proposeField(input, element, value, provenance)` returning `{ok: field} | {ok: false, reason}`:
   - `span`: value equals `nfc(input)[start, end)` exactly;
   - `transform`: names an entry in the transform table and a source span, and replaying the
     transform on that span yields the value;
   - `dataset`: needs a dataset id, record key, `unique: true` and a corroborating input span;
   - `inferred`: needs a rule id and the span or field it was derived from;
   - `human`: needs a session actor id; `external`: needs an API token id.
   Anything else is rejected and the field stays empty.
5. `packages/core/src/proposal.ts`: `buildProposal(record, packRef, candidates)` is the only way to
   make a Proposal. It runs `proposeField` on every candidate, drops rejected ones into `rejected[]`,
   and adds a finding `length.exceeded` (severity `reject`) for any value longer than its element;
   it never shortens a value. Output is deterministic (fields sorted by element, stable JSON).
6. `packages/core/src/transforms.ts`: the closed, versioned transform table mechanism
   (`id`, `version`, pure function) with the first entries `nfc`, `whitespace.collapse`,
   `case.upper`. Postcode format, ISO 9 Cyrillic and Latin-ASCII folding are added by M2-10.
7. `isAutoApprovable(field, validatorsAgree)`: false for `dataset`, `inferred`, `external`, `human`;
   true for `span` and `transform` only when validators agree.
8. `packages/core/src/state/{batch,record}.ts`: transition functions for the Batch and Record state
   machines in `docs/architecture.md` §2 that throw a typed `IllegalTransition` on any other move.
9. Property tests with fast-check for every property named in step 1, plus unit tests for each
   rejection reason. Add `zod` and `fast-check` to `packages/core` if M0-05 did not.
   LOCK: this ticket changes `package-lock.json` for the core workspace's dependencies.

## Out of scope
- Rule vocabulary, packs and the element map per message version (M2-06).
- Country detection, parsers, dataset lookups, postcode and transliteration transforms (M2-10 to M2-13).
- Confidence scoring (M2-15). Persistence (M1-02).

## Acceptance Criteria
1. `npm run test -w packages/core` passes, including a fast-check run of every property named in
   the spec (`P-never-invent` … `P-record-transitions`) at ≥ 1,000 runs each; the test names
   contain the property names.
2. `P-never-invent`: for random inputs and random candidates, every field in every built Proposal
   is either a span of the NFC input, a replayable transform of one, or a non-text provenance with
   its required references; no other value is ever accepted.
3. `P-no-truncation`: for any value longer than its element's limit, the Proposal contains the full
   value or no value, and a `length.exceeded` finding; no output value is a strict prefix of a
   candidate value.
4. `P-not-auto-approvable`: `isAutoApprovable` is false for every `dataset`, `inferred` and
   `external` field whatever the validators say.
5. `P-proposal-deterministic`: building a Proposal twice from the same record, pack reference and
   candidates (in any order) yields byte-identical JSON.
6. Every Batch and Record transition not drawn in `docs/architecture.md` §2 throws
   `IllegalTransition` (exhaustive table test over all state pairs).
7. `packages/core` imports nothing from `node:*`, `pg`, `drizzle-orm`, `hono` or any SDK: the
   M0-05 import guard test, extended in this ticket to the full list, scans its sources and fails
   on such an import.
8. `.kiro/specs/domain-core/` exists with EARS requirements, and `docs/kiro-usage.md` has an entry
   for this ticket.

## Deliverables
- `.kiro/specs/domain-core/requirements.md`, `design.md`, `tasks.md`
- `packages/core/src/entities/*.ts`, `elements.ts`, `provenance.ts`, `proposal.ts`, `transforms.ts`,
  `state/batch.ts`, `state/record.ts`, `index.ts`
- `packages/core/test/provenance.property.test.ts`, `proposal.property.test.ts`,
  `state.test.ts`, and the M0-05 import guard test (extended)
- `docs/kiro-usage.md` (entry appended)

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
npm run typecheck -w packages/core
npm run lint -w packages/core
FC_NUM_RUNS=1000 npm run test -w packages/core -- --reporter=verbose | tee "$TMPDIR/m1-01-test.log"
for p in P-never-invent P-span-exact P-transform-replays P-no-truncation P-not-auto-approvable \
         P-proposal-deterministic P-batch-transitions P-record-transitions; do
  grep -q "$p" "$TMPDIR/m1-01-test.log" || { echo "missing property test $p"; exit 1; }
done
test -f .kiro/specs/domain-core/requirements.md && grep -q "M1-01" docs/kiro-usage.md
./scripts/landing-checks.sh --fast
```

## Handoff
- M1-02 maps these entities to tables; the stored Proposal JSON is the `buildProposal` output.
- M1-07 uses `buildProposal` for country-only proposals and the state functions for Batch/Record moves.
- M2-06, M2-10 to M2-15 extend the transform table and candidates; they must not add a way around
  `buildProposal`. Changing `provenance.ts` is a hot-file change (one ticket at a time).
