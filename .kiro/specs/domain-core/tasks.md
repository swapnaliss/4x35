# Implementation Plan: domain-core

## Overview

Ticket M1-01 builds the pure domain core in `packages/core`. Tasks follow this order: dependencies, elements, transforms, provenance, proposal, auto-approval, entities, state machines, purity guard, then one property task per property P1 to P8, a usage-log task and a final checkpoint.

Every property task states these shared rules:
- The test uses fast-check with domain arbitraries from `packages/core/test/arbitraries.ts`, never a bare `fc.string()`.
- `numRuns` is `Number(process.env.FC_NUM_RUNS ?? 1000)`, so it is at least 1000 unless CI raises it. Do not set it below 1000.
- The test name contains the ticket's property ID.
- Before the real code is restored, the task runs the planted bug named in `design.md`, confirms the property fails, and records the bug, the counterexample and the seed in the task's notes. A property with no recorded failure is not done.

## Tasks

- [ ] 1. Add dependencies to `packages/core` (M1-01)
  - Add `zod` 4.6.7 as a dependency and `fast-check` 4.10.2 as a devDependency of `packages/core`, at the exact versions in the tech steering.
  - `package-lock.json` is a hot file: make this the only ticket touching it while the change lands.
  - Confirm `packages/core` still has no `node:*`, `pg`, `drizzle-orm`, `hono` or SDK dependency.
  - _Requirements: R9.1_

- [ ] 2. Implement the Element_Table in `packages/core/src/elements.ts` (M1-01)
  - Define `ElementId`, `ElementSpec` and the ordered table with the maximum lengths and occurrences from R3.1.
  - Array order is the fixed element order used to sort `fields[]`.
  - Add unit tests for every maximum length and the AdrLine 0 to 7 occurrences.
  - _Requirements: R3.1_

- [ ] 3. Implement the Transform_Table in `packages/core/src/transforms.ts` (M1-01)
  - Define `TransformEntry` and the entries `nfc`, `whitespace.collapse` and `case.upper` with the semantics fixed in `design.md`.
  - `case.upper` passes the literal locale `"en-US"`. `whitespace.collapse` trims and is idempotent.
  - Implement `replay(transformId, sourceSpan, input)` over `nfc(input).slice(start, end)`.
  - Add unit tests for unique non-empty ids, versions, membership, whitespace idempotence and the locale pin.
  - _Requirements: R2.1, R2.2_

- [ ] 4. Implement `proposeField` in `packages/core/src/provenance.ts` (M1-01)
  - Define `Span`, `Provenance`, `Candidate`, `RejectionReason` and `ProposeResult`.
  - Validate each of the six Provenance_Kind shapes against NFC input as in R1.1 to R1.6, and reject an unknown transform id.
  - Return `{ok: false, reason}` for missing or invalid provenance. Never throw.
  - Add one unit test per rejection reason and per kind's required reference fields.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R2.3_

- [ ] 5. Implement `buildProposal` in `packages/core/src/proposal.ts` (M1-01)
  - Create the `Field`, `Finding`, `RejectedCandidate` and `Proposal` shapes in `packages/core/src/entities/proposal.ts`.
  - `buildProposal(record, packRef, candidates)` runs `proposeField` on every candidate and partitions into `fields[]` and `rejected[]`.
  - Keep accepted values unchanged. Add a `length.exceeded` Finding with severity `reject` for over-length values and keep the full value. Add none at exactly the maximum.
  - Sort `fields[]` by the `elements.ts` order and serialise as stable JSON. No other exported function builds a Proposal.
  - Add unit tests for rejection routing, the length boundary at the maximum and maximum plus one, and sort order.
  - _Requirements: R3.2, R3.3, R3.4, R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

- [ ] 6. Implement `isAutoApprovable` in `packages/core/src/proposal.ts` (M1-01)
  - Return `validatorsAgree` for `span` and `transform`. Return false for `dataset`, `inferred`, `external` and `human`.
  - Add the 2 by 2 unit matrix for `span` and `transform` crossed with `validatorsAgree`.
  - _Requirements: R5.1, R5.2, R5.3_

- [ ] 7. Implement entities and the public index (M1-01)
  - Create zod schemas and types in `packages/core/src/entities/` for Workspace, User, Membership, Batch, Record, Decision and AuditEvent, plus the minimal Invite, Session and ApiToken shapes. The Proposal shapes already exist from task 5.
  - Membership role is exactly `owner` or `reviewer`. `Record.originalLines` is `readonly string[]`.
  - Re-export the public surface from `packages/core/src/index.ts`.
  - Add one valid and one invalid example per entity schema, and a type-level check that `originalLines` is readonly.
  - _Requirements: R8.1, R8.2, R8.3_

- [ ] 8. Implement the Batch and Record state machines (M1-01)
  - Add `IllegalTransition`, `transitionBatch(current, to, {purgeEligible})` in `packages/core/src/state/batch.ts` and `transitionRecord(current, to)` in `packages/core/src/state/record.ts`.
  - Copy the transitions drawn in `docs/architecture.md` §2. Throw `IllegalTransition` for every other pair, including undrawn self-moves and every move out of `already_valid`.
  - Add a unit example per drawn transition and per documented `failed` and `purged` case.
  - _Requirements: R6.1, R6.2, R7.1, R7.2_

- [ ] 9. Extend the Import_Guard_Test (M1-01)
  - Extend `packages/core/test/import-guard.test.ts` to scan every file under `packages/core/src/` for `node:*`, `pg`, `drizzle-orm`, `hono`, `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk`.
  - Detect static imports, `export ... from`, dynamic `import()` and `require()`, and report the file and specifier on failure.
  - Add one fixture per import syntax that the guard must flag, plus the real scan of `src/`.
  - _Requirements: R9.1, R9.2, R9.3_

- [ ] 10. Property test P-never-invent (M1-01)
  - **Validates: P1**
  - Create `packages/core/test/arbitraries.ts` with the shared domain arbitraries from `design.md`: address lines with whitespace runs of 1, 2 and 3 or more, tabs and NBSP; CJK, Devanagari, Arabic, Cyrillic and Latin-with-diacritics letters; NFC and NFD forms; lengths around 15/16/17, 34/35/36 and 69/70/71; spans; transform ids; provenance of all six kinds, well-formed and malformed.
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-never-invent` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`.
  - Planted bug: `proposeField` skips the `end <= input.length` check. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R1.7, R1.8_

- [ ] 11. Property test P-span-exact (M1-01)
  - **Validates: P2**
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-span-exact` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`. Generate NFD input so NFC offsets differ from raw offsets.
  - Planted bug: compare against `input.slice(start, end)` on the raw input instead of the NFC input. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R1.1, R1.9_

- [ ] 12. Property test P-transform-replays (M1-01)
  - **Validates: P3**
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-transform-replays` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`. Cover every table entry and a wrong claimed value.
  - Planted bug: `replay` returns the candidate's claimed value instead of recomputing it. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R1.2, R1.10, R2.3_

- [ ] 13. Property test P-no-truncation (M1-01)
  - **Validates: P4**
  - Create `packages/core/test/proposal.property.test.ts` with the test, `P-no-truncation` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`. Generate values at each element's maximum length minus one, equal and plus one.
  - Planted bug: `buildProposal` truncates values to the element's `maxLength`. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R3.2, R3.3, R3.4, R3.5, R4.5_

- [ ] 14. Property test P-not-auto-approvable (M1-01)
  - **Validates: P5**
  - Add the test to `packages/core/test/proposal.property.test.ts`, with `P-not-auto-approvable` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`. Generate fields of kinds `dataset`, `inferred`, `external` and `human` with both `validatorsAgree` values.
  - Planted bug: `isAutoApprovable` returns `validatorsAgree` for every kind. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R5.3, R5.4_

- [ ] 15. Property test P-proposal-deterministic (M1-01)
  - **Validates: P6**
  - Add the test to `packages/core/test/proposal.property.test.ts`, with `P-proposal-deterministic` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`. Compare the JSON from two orderings of the same candidates.
  - Planted bug: `buildProposal` keeps candidate insertion order instead of the `elements.ts` order. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R4.6, R4.7_

- [ ] 16. Property test P-batch-transitions (M1-01)
  - **Validates: P7**
  - Create `packages/core/test/state.test.ts` with the test over all ordered Batch state pairs, `P-batch-transitions` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`. Include both `purgeEligible` values.
  - Planted bug: `transitionBatch` allows `uploaded -> uploaded`. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R6.1, R6.2, R6.3_

- [ ] 17. Property test P-record-transitions (M1-01)
  - **Validates: P8**
  - Add the test to `packages/core/test/state.test.ts` over all ordered Record state pairs, with `P-record-transitions` in the name and `numRuns` of at least 1000 from `FC_NUM_RUNS`.
  - Planted bug: `transitionRecord` allows `already_valid -> needs_review`. Record the counterexample and seed in the task notes before restoring the real code.
  - _Requirements: R7.1, R7.2, R7.3_

- [ ] 18. Log the implementation run in `docs/kiro-usage.md` (M1-01)
  - The steering requires a row for every spec action, and running these tasks is one. Append a row with the date, ticket M1-01, surface, what ran, Kiro version and credits used (from `/usage` before and after).
  - Do not log the spec-creation row. It is handled outside this spec.
  - _Requirements: R1.8_

- [ ] 19. Final checkpoint - Ensure all tests, typecheck and biome are green
  - Run the `packages/core` tests with `FC_NUM_RUNS=1000`, the typecheck and Biome lint and format. Confirm each of the eight property IDs appears in the verbose test log.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R1.8, R9.1_

## Notes

- Every task is required. The steering demands a property test with a recorded planted bug for each property, so none are marked optional.
- `package-lock.json` changes only in task 1.
- Each test file is edited by one task per wave to avoid conflicts.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2", "3"] },
    { "id": 2, "tasks": ["4"] },
    { "id": 3, "tasks": ["5"] },
    { "id": 4, "tasks": ["6", "7"] },
    { "id": 5, "tasks": ["8"] },
    { "id": 6, "tasks": ["9"] },
    { "id": 7, "tasks": ["10"] },
    { "id": 8, "tasks": ["11"] },
    { "id": 9, "tasks": ["12"] },
    { "id": 10, "tasks": ["13"] },
    { "id": 11, "tasks": ["14"] },
    { "id": 12, "tasks": ["15"] },
    { "id": 13, "tasks": ["16"] },
    { "id": 14, "tasks": ["17"] },
    { "id": 15, "tasks": ["18"] },
    { "id": 16, "tasks": ["19"] }
  ]
}
```
