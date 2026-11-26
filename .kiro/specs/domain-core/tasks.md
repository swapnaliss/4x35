# Implementation Plan: domain-core

## Overview

Ticket M1-01 builds the pure domain core in `packages/core`. Tasks follow this order: dependencies, elements, transforms, provenance, proposal, auto-approval, entities, state machines, purity guard, then one property task per property P1 to P8, a usage-log task and a final checkpoint.

Every property task states these shared rules:
- The test uses fast-check with domain arbitraries from `packages/core/test/arbitraries.ts`, never a bare `fc.string()`. The reference oracle for P1 to P3 is `packages/core/test/oracle.ts`.
- `numRuns` is `NUM_RUNS` from `packages/core/test/arbitraries.ts`, which is `max(1000, FC_NUM_RUNS)`. It is never below 1000, and CI can raise it.
- The test name contains the ticket's property ID.
- Each planted bug is kept as a permanent test named `<property id> catches planted bug: <bug>`. It runs the property against a deliberately wrong implementation and asserts that the property fails. The actual results (runs to failure, seed, counterexample) are in the planted-bug table in `design.md`. A property with no such failing test is not done.

## Tasks

- [x] 1. Add dependencies to `packages/core` (M1-01)
  - Add `zod` 4.6.7 as a dependency and `fast-check` 4.10.2 as a devDependency of `packages/core`, at the exact versions in the tech steering.
  - `package-lock.json` is a hot file: make this the only ticket touching it while the change lands.
  - Confirm `packages/core` still has no `node:*`, `pg`, `drizzle-orm`, `hono` or SDK dependency.
  - _Requirements: R9.1_

- [x] 2. Implement the Element_Table in `packages/core/src/elements.ts` (M1-01)
  - Define `Element`, `ELEMENTS` (the ordered table), `ELEMENT_MAX_LENGTH`, `ELEMENT_MAX_OCCURS`, `isElement`, `elementOrder` and `valueLength`, with the maximum lengths and occurrences from R3.1.
  - `valueLength` counts Unicode code points, not UTF-16 units.
  - `ELEMENTS` array order is the fixed element order used to sort `fields[]`.
  - Add unit tests for every maximum length and the AdrLine occurrences (indexes 0 to 6).
  - _Requirements: R3.1_

- [x] 3. Implement the Transform_Table in `packages/core/src/transforms.ts` (M1-01)
  - Define `TransformDef` (`{id, version, description, apply}`), the frozen `TRANSFORMS` table, `TRANSFORM_IDS` and `getTransform(id, version)`, with the entries `nfc`, `whitespace.collapse` and `case.upper` at version 1 and the semantics fixed in `design.md`.
  - `case.upper` uses `String.prototype.toUpperCase()` with no locale argument. The ECMAScript specification makes it locale-independent.
  - `whitespace.collapse` replaces whitespace runs with one space, trims, and is idempotent.
  - There is no separate `replay` export. The replay happens inside `proposeField` (task 4): it looks up the entry with `getTransform(id, version)` and applies it to `nfc(input).slice(start, end)`.
  - Add unit tests for unique non-empty ids, versions, membership, `getTransform` with a wrong version, whitespace idempotence, and `case.upper` locale-independence (the dotted `i` becomes `I`).
  - _Requirements: R2.1, R2.2_

- [x] 4. Implement `proposeField` in `packages/core/src/provenance.ts` (M1-01)
  - Define `Span`, `ElementRef` (`{element, index}`), `Provenance`, `Field` (element, index, value, provenance), `REJECTION_REASONS`, `RejectionReason` and `ProposeFieldResult`, plus `nfc`, `recordInput` and `PROVENANCE_KINDS`.
  - Validate each of the six Provenance_Kind shapes against NFC input as in R1.1 to R1.6: `span`; `transform` with `{id, version}` and a `source` span; `dataset` with `datasetId`, `recordKey`, `unique: true` and a corroborating `source` span; `inferred` with a `ruleId` and `from` set to exactly one of `{span}` or `{field}`; `human` with `actorId`; `external` with `tokenId`.
  - Replay a `transform` through `getTransform(id, version)`; an unknown id or version is `transform.unknown`, a differing result is `transform.mismatch`.
  - Return `{ok: false, reason}` with a dotted reason from `REJECTION_REASONS` (for example `span.out_of_bounds`) for missing or invalid provenance. Never throw.
  - Add one unit test per rejection reason and per kind's required reference fields.
  - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R2.3_

- [x] 5. Implement `buildProposal` in `packages/core/src/proposal.ts` (M1-01)
  - Define `Candidate`, `Finding` (with `target`), `RejectedCandidate`, `PackRef` (`{id, version}`), `ProposalField` and the branded `Proposal` type (an object literal does not type-check as a `Proposal`), plus `proposalToJson` (stable JSON via `json.ts`) and `deepFreeze` from `freeze.ts`. Add the `StoredProposal` zod schema (data only) in `packages/core/src/entities/proposal.ts`.
  - `buildProposal(record, pack, candidates)` runs `proposeField` on every candidate and partitions into `fields[]` and `rejected[]`. It is the only exported way to construct a `Proposal`.
  - Collapse identical duplicates. Reject different values or provenances for one element occurrence with `field.conflict`.
  - Second pass: accept an `inferred` candidate with `from.field` only if the referenced field was accepted in pass 1; otherwise reject it as `inferred.source_field_missing`.
  - Keep accepted values unchanged. Add a `length.exceeded` Finding with severity `reject` for values over the limit in code points and keep the full value. Add none at exactly the maximum.
  - Sort `fields[]` by element order then index, and `rejected[]` and `findings[]` by stable JSON. Return a deeply frozen result.
  - Add unit tests for rejection routing, conflicts, duplicate collapse, the second pass, the length boundary at the maximum and maximum plus one, sort order and the frozen result.
  - _Requirements: R3.2, R3.3, R3.4, R4.1, R4.2, R4.3, R4.4, R4.5, R4.6_

- [x] 6. Implement `isAutoApprovable` in `packages/core/src/provenance.ts` (M1-01)
  - Return `validatorsAgree` for `span` and `transform`. Return false for `dataset`, `inferred`, `external` and `human`.
  - Add the 2 by 2 unit matrix for `span` and `transform` crossed with `validatorsAgree`.
  - _Requirements: R5.1, R5.2, R5.3_

- [x] 7. Implement entities and the public index (M1-01)
  - Create zod schemas and types in `packages/core/src/entities/`: Workspace, User and Membership in `identity.ts`; Batch in `batch.ts`; Record in `record.ts` (exported type `DomainRecord`, status field `status`); Decision and AuditEvent in `decision.ts`; and the `StoredProposal` schema in `proposal.ts` (from task 5). Shared pieces are in `common.ts`.
  - Do not add Invite, Session or ApiToken: the ticket does not name them.
  - Membership role is exactly `owner` or `reviewer`. `DomainRecord.originalLines` is `readonly string[]`.
  - Re-export the public surface from `packages/core/src/index.ts`.
  - Add one valid and one invalid example per entity schema, a public-surface check in `index.test.ts`, and a type-level check that `originalLines` is readonly.
  - _Requirements: R8.1, R8.2, R8.3_

- [x] 8. Implement the Batch and Record state machines (M1-01)
  - Add `defineMachine` and `IllegalTransition(machine, from, to)` in `packages/core/src/state/machine.ts`, `transitionBatch(from, to, {purgeEligible})` in `packages/core/src/state/batch.ts` and `transitionRecord(from, to)` in `packages/core/src/state/record.ts`, with `canTransitionBatch` and `canTransitionRecord`.
  - Copy the transitions drawn in `docs/architecture.md` §2. Throw `IllegalTransition` for every other pair, including undrawn self-moves and every move out of `already_valid`.
  - Add a unit example per drawn transition and per documented `failed` and `purged` case.
  - _Requirements: R6.1, R6.2, R7.1, R7.2_

- [x] 9. Implement the Purity_Test import guard (M1-01)
  - Add `packages/core/test/purity.test.ts`, which scans every file under `packages/core/src/` with the TypeScript parser for forbidden imports: `node:*` and Node built-ins, `pg`, `drizzle-orm`, `hono`, `@anthropic-ai/sdk`, `@modelcontextprotocol/sdk` and the other I/O packages in `design.md`.
  - Detect static imports, `export ... from`, dynamic `import()` and `require()`, and report the file and specifier on failure.
  - Check that `package.json` declares no runtime dependency except `zod`.
  - Add fixtures for each import syntax that the matcher must flag, plus the real scan of `src/`.
  - _Requirements: R9.1, R9.2, R9.3_

- [x] 10. Property test P-never-invent (M1-01)
  - **Validates: P1**
  - Create `packages/core/test/arbitraries.ts` with `NUM_RUNS` and the shared domain arbitraries from `design.md`: address lines with whitespace runs of 1, 2 and 3 or more, tabs and NBSP; CJK, Devanagari, Arabic, Cyrillic and Latin-with-diacritics letters; NFC and NFD forms; lengths around 15/16/17, 34/35/36 and 69/70/71; spans; transform ids; provenance of all six kinds, well-formed and malformed. Add the reference oracle `packages/core/test/oracle.ts`.
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-never-invent` in the name and `numRuns: NUM_RUNS`.
  - Planted bug: the span bounds check (`end <= length`) is skipped. Keep it as the test `P-never-invent catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R1.7, R1.8_

- [x] 11. Property test P-span-exact (M1-01)
  - **Validates: P2**
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-span-exact` in the name and `numRuns: NUM_RUNS`. Generate NFD input so NFC offsets differ from raw offsets.
  - Planted bug: the span is compared against the raw (non-NFC) input. Keep it as the test `P-span-exact catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R1.1, R1.9_

- [x] 12. Property test P-transform-replays (M1-01)
  - **Validates: P3**
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-transform-replays` in the name and `numRuns: NUM_RUNS`. Cover every table entry and a wrong claimed value.
  - Planted bug: the checker trusts the claimed value without applying the table entry. Keep it as the test `P-transform-replays catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R1.2, R1.10, R2.3_

- [x] 13. Property test P-no-truncation (M1-01)
  - **Validates: P4**
  - Create `packages/core/test/proposal.property.test.ts` with the test, `P-no-truncation` in the name and `numRuns: NUM_RUNS`. Generate values at each element's maximum length minus one, equal and plus one, counted in code points.
  - Planted bug: values are truncated to the element limit. Keep it as the test `P-no-truncation catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R3.2, R3.3, R3.4, R3.5, R4.5_

- [x] 14. Property test P-not-auto-approvable (M1-01)
  - **Validates: P5**
  - Add the test to `packages/core/test/provenance.property.test.ts`, with `P-not-auto-approvable` in the name and `numRuns: NUM_RUNS`. Generate fields of kinds `dataset`, `inferred`, `external` and `human` with both `validatorsAgree` values.
  - Planted bug: provenance kind is ignored, so `isAutoApprovable` returns `validatorsAgree` for every kind. Keep it as the test `P-not-auto-approvable catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R5.3, R5.4_

- [x] 15. Property test P-proposal-deterministic (M1-01)
  - **Validates: P6**
  - Add the test to `packages/core/test/proposal.property.test.ts`, with `P-proposal-deterministic` in the name and `numRuns: NUM_RUNS`. Compare `proposalToJson` from two orderings of the same candidates.
  - Planted bug: fields are kept in candidate order instead of the `elements.ts` order. Keep it as the test `P-proposal-deterministic catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R4.6, R4.7_

- [x] 16. Property test P-batch-transitions (M1-01)
  - **Validates: P7**
  - Create `packages/core/test/state.test.ts` with the test over all ordered Batch state pairs, `P-batch-transitions` in the name and `numRuns: NUM_RUNS`. Include both `purgeEligible` values, and add the exhaustive Batch transition tables.
  - Planted bug: `transitionBatch` allows `uploaded -> uploaded`. Keep it as the test `P-batch-transitions catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R6.1, R6.2, R6.3_

- [x] 17. Property test P-record-transitions (M1-01)
  - **Validates: P8**
  - Add the test to `packages/core/test/state.test.ts` over all ordered Record state pairs, with `P-record-transitions` in the name and `numRuns: NUM_RUNS`, plus the exhaustive Record transition table.
  - Planted bug: `transitionRecord` allows `already_valid -> needs_review`. Keep it as the test `P-record-transitions catches planted bug: ...`; the result is in the `design.md` table.
  - _Requirements: R7.1, R7.2, R7.3_

- [x] 18. Log the implementation run in `docs/kiro-usage.md` (M1-01)
  - The steering requires a row for every spec action, and running these tasks is one. Append a row with the date, ticket M1-01, surface, what ran, Kiro version and credits used (from `/usage` before and after).
  - Do not log the spec-creation row. It is handled outside this spec.
  - This stays open here: it is done outside Kiro after the run, once the credits are known.
  - _Requirements: R1.8_

- [x] 19. Final checkpoint - Ensure all tests, typecheck and biome are green
  - Run the `packages/core` tests with `FC_NUM_RUNS=1000`, the typecheck and Biome lint and format. Confirm each of the eight property IDs appears in the verbose test log.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R1.8, R9.1_

## Notes

- Every task is required. The steering demands a property test with a planted-bug test for each property, so none are marked optional.
- `package-lock.json` changes only in task 1.
- Test files are shared by several property tasks, so those tasks sit in different waves to avoid conflicts: `provenance.property.test.ts` (tasks 10, 11, 12, 14), `proposal.property.test.ts` (tasks 13, 15) and `state.test.ts` (tasks 16, 17).
- Checkpoint result: `cd packages/core && FC_NUM_RUNS=1000 npx vitest run --reporter=verbose` ran 9 test files and 307 tests, all passed, with each of the eight property IDs and its "catches planted bug" test in the log. `npm run typecheck -w packages/core` and `npm run lint -w packages/core` (Biome, 31 files) passed.

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
