# Requirements Document

## Introduction

Ticket M1-01 builds the pure domain core of 4x35. It enforces the never-invent promise (ADR 0008) in code: a Proposal can only be built through a constructor that rejects any value without valid provenance, values are never truncated, and Batch and Record moves follow the state machines in `docs/architecture.md` §2. `packages/core` stays pure (ADR 0001). Rule vocabulary, packs, the per-message-version element map, country detection, parsers, dataset lookups, postcode and transliteration transforms, confidence scoring and persistence are out of scope.

## Glossary

- **Core_Package**: the npm workspace `packages/core`, the pure domain module.
- **Provenance_Checker**: the component in `provenance.ts` that validates a candidate value against its provenance (`proposeField`).
- **Proposal_Builder**: the component in `proposal.ts` that builds a Proposal (`buildProposal`), the only way to make one.
- **Transform_Table**: the closed, versioned table of named pure transforms in `transforms.ts`.
- **Element_Table**: the PostalAddress24 element list with maximum lengths in `elements.ts`.
- **Auto_Approval_Policy**: the rule in `isAutoApprovable` that decides whether a field may be auto-approved.
- **validatorsAgree**: the boolean argument of `isAutoApprovable(field, validatorsAgree)` that is true when the deterministic validators agree with the field.
- **Batch_State_Machine**: the transition function for Batch state in `state/batch.ts`.
- **Record_State_Machine**: the transition function for Record state in `state/record.ts`.
- **Provenance_Kind**: one of `span`, `transform`, `dataset`, `inferred`, `human`, `external`.
- **Candidate**: a proposed element value together with its claimed provenance.
- **Proposal**: the record, pack reference, `fields[]`, `rejected[]` and `findings[]` produced by the Proposal_Builder.
- **NFC_Input**: the original input text normalised to Unicode NFC.
- **Finding**: a result item with `ruleId`, `severity` (`reject`, `strip` or `warn`) and message.
- **IllegalTransition**: the typed error thrown for a state move not drawn in `docs/architecture.md` §2.
- **Import_Guard_Test**: the test that scans the Core_Package sources for forbidden imports.

## Requirements

### Requirement 1: Provenance kinds and their required references

**User Story:** As a treasury analyst, I want every proposed value to carry valid provenance, so that nothing in the output is invented.

#### Acceptance Criteria

1. WHEN a Candidate has Provenance_Kind `span`, THE Provenance_Checker SHALL accept the value only if the span start and end are integers with 0 <= start < end <= the length of NFC_Input and the value equals NFC_Input from start (inclusive) to end (exclusive) exactly.
2. WHEN a Candidate has Provenance_Kind `transform`, THE Provenance_Checker SHALL accept the value only if the provenance names an entry of the Transform_Table and a source span whose start and end are integers with 0 <= start < end <= the length of NFC_Input, and replaying that entry on the source span yields the value.
3. WHEN a Candidate has Provenance_Kind `dataset`, THE Provenance_Checker SHALL accept the value only if the provenance has a non-empty dataset id, a non-empty record key, `unique` set to the boolean true and a corroborating input span whose start and end are integers with 0 <= start < end <= the length of NFC_Input.
4. WHEN a Candidate has Provenance_Kind `inferred`, THE Provenance_Checker SHALL accept the value only if the provenance has a non-empty rule id and either a source span whose start and end are integers with 0 <= start < end <= the length of NFC_Input or a source field.
5. WHEN a Candidate has Provenance_Kind `human`, THE Provenance_Checker SHALL accept the value only if the provenance has a non-empty session actor id.
6. WHEN a Candidate has Provenance_Kind `external`, THE Provenance_Checker SHALL accept the value only if the provenance has a non-empty API token id.
7. IF a Candidate has no provenance, an unknown Provenance_Kind, or a missing or invalid required reference, THEN THE Provenance_Checker SHALL return `{ok: false, reason}` with a reason that identifies the failure, SHALL leave the field empty and SHALL complete without throwing.
8. FOR ALL inputs and Candidates, every field accepted by the Provenance_Checker SHALL be a span of NFC_Input, a replayable transform of a span, or a non-text provenance with its required references (P-never-invent).
9. FOR ALL accepted `span` fields, THE Provenance_Checker SHALL satisfy value equality with the NFC_Input substring at the stated offsets (P-span-exact).
10. FOR ALL accepted `transform` fields, replaying the named Transform_Table entry on the source span SHALL yield the field value (P-transform-replays).

### Requirement 2: Transform table

**User Story:** As a reviewer, I want transforms limited to a closed, versioned table, so that every changed value can be replayed and explained.

#### Acceptance Criteria

1. THE Transform_Table SHALL define each entry with a unique non-empty `id`, a `version` and a pure function that performs no I/O.
2. THE Transform_Table SHALL contain at least the entries `nfc`, `whitespace.collapse` and `case.upper`.
3. IF a Candidate names a transform that is not an entry of the Transform_Table, THEN THE Provenance_Checker SHALL reject the Candidate with a reason that identifies an unknown transform and SHALL leave the field empty.

### Requirement 3: Element maximum lengths

**User Story:** As an AP clerk, I want element limits known to the system, so that over-length values are flagged and never silently changed.

#### Acceptance Criteria

1. THE Element_Table SHALL define these maximum lengths: StrtNm 70, BldgNb 16, BldgNm 35, Flr 70, PstBx 16, Room 70, PstCd 16, TwnNm 35, TwnLctnNm 35, DstrctNm 35, CtrySubDvsn 35, Ctry 2, and AdrLine 70 with 0 to 7 occurrences.
2. WHEN a Candidate value is longer than the maximum length of its element, THE Proposal_Builder SHALL add a Finding with `ruleId` `length.exceeded` and severity `reject`.
3. WHEN a Candidate value is longer than the maximum length of its element, THE Proposal_Builder SHALL keep the full value in `fields[]` together with the Finding, or exclude the value entirely if the Provenance_Checker rejects it, and SHALL NOT shorten the value or move it to `rejected[]` for length alone.
4. WHEN a Candidate value is exactly as long as the maximum length of its element, THE Proposal_Builder SHALL add no `length.exceeded` Finding for that value.
5. FOR ALL Candidate values, no output value SHALL be a strict prefix of its Candidate value, and over-length SHALL produce the `length.exceeded` Finding (P-no-truncation).

### Requirement 4: Proposal construction

**User Story:** As a treasury analyst, I want Proposals built only through one constructor, so that no path bypasses the provenance check.

#### Acceptance Criteria

1. THE Proposal_Builder SHALL be the only way to create a Proposal, through `buildProposal(record, packRef, candidates)`.
2. WHEN `buildProposal` is called, THE Proposal_Builder SHALL run `proposeField` on every Candidate.
3. WHEN the Provenance_Checker rejects a Candidate, THE Proposal_Builder SHALL record the Candidate with its reason in `rejected[]` and exclude it from `fields[]`.
4. WHEN the Provenance_Checker accepts a Candidate, THE Proposal_Builder SHALL keep the value unchanged, with its provenance, in `fields[]`.
5. WHEN an accepted value is longer than the maximum length of its element, THE Proposal_Builder SHALL keep the full value in `fields[]` and add a `length.exceeded` Finding with severity `reject`.
6. THE Proposal_Builder SHALL sort `fields[]` by element in the fixed element order of `elements.ts` and serialise the Proposal as stable JSON.
7. FOR ALL records, pack references and Candidate sets, building a Proposal twice, with the Candidates in any order, SHALL produce byte-identical JSON (P-proposal-deterministic).

### Requirement 5: Auto-approval policy

**User Story:** As a reviewer, I want only span and transform fields to be auto-approvable, so that a human checks every other kind of value.

#### Acceptance Criteria

1. WHEN a field has Provenance_Kind `span` or `transform` and `validatorsAgree` is true, THE Auto_Approval_Policy SHALL return true from `isAutoApprovable`.
2. WHEN a field has Provenance_Kind `span` or `transform` and `validatorsAgree` is false, THE Auto_Approval_Policy SHALL return false.
3. WHEN a field has Provenance_Kind `dataset`, `inferred`, `external` or `human`, THE Auto_Approval_Policy SHALL return false regardless of `validatorsAgree`.
4. FOR ALL fields of Provenance_Kind `dataset`, `inferred` or `external`, and any `validatorsAgree` value, THE Auto_Approval_Policy SHALL return false from `isAutoApprovable` (P-not-auto-approvable).

### Requirement 6: Batch state machine

**User Story:** As a developer, I want Batch moves restricted to the documented states, so that later tickets cannot corrupt batch lifecycle.

#### Acceptance Criteria

1. WHEN a Batch move is drawn in `docs/architecture.md` §2, THE Batch_State_Machine SHALL return the new state.
2. IF a Batch move is not drawn in `docs/architecture.md` §2, THEN THE Batch_State_Machine SHALL throw IllegalTransition.
3. FOR ALL ordered pairs of Batch states, THE Batch_State_Machine SHALL permit exactly the moves drawn in `docs/architecture.md` §2 and throw IllegalTransition on every other pair, including self-moves not drawn (P-batch-transitions).

### Requirement 7: Record state machine

**User Story:** As a developer, I want Record moves restricted to the documented states, so that review status stays consistent.

#### Acceptance Criteria

1. WHEN a Record move is drawn in `docs/architecture.md` §2, THE Record_State_Machine SHALL return the new state.
2. IF a Record move is not drawn in `docs/architecture.md` §2, THEN THE Record_State_Machine SHALL throw IllegalTransition.
3. FOR ALL ordered pairs of Record states, THE Record_State_Machine SHALL permit exactly the moves drawn in `docs/architecture.md` §2 and throw IllegalTransition on every other pair, including self-moves not drawn (P-record-transitions).

### Requirement 8: Entities

**User Story:** As a developer, I want typed and validated domain entities, so that later tickets share one definition.

#### Acceptance Criteria

1. THE Core_Package SHALL define entity types and zod schemas for Workspace, User, Membership, Batch, Record, Proposal, Decision and AuditEvent, matching `docs/architecture.md` §2.
2. THE Core_Package SHALL define the role of a Membership as exactly `owner` or `reviewer`.
3. THE Core_Package SHALL define the original lines of a Record as `readonly`.

### Requirement 9: Core purity

**User Story:** As a maintainer, I want the core free of I/O and vendor imports, so that the domain stays portable and testable (ADR 0001).

#### Acceptance Criteria

1. THE Core_Package sources SHALL import nothing from `node:*`, `pg`, `drizzle-orm`, `hono` or any SDK.
2. WHEN the Import_Guard_Test finds an import from the list in R9.1 in the Core_Package sources, THE Import_Guard_Test SHALL fail and report the file and the import specifier.
3. THE Import_Guard_Test SHALL check static imports, export-from statements, dynamic `import()` calls and `require()` calls.
