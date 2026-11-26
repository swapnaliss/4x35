/**
 * Pure domain: structuring, rules, provenance. No I/O (architecture rule): this package imports
 * no Node built-in and no I/O library, which `test/purity.test.ts` enforces.
 */
export const WORKSPACE = "@4x35/core";

export * from "./elements.js";
export * from "./entities/index.js";
export { type JsonValue, stableStringify } from "./json.js";
export {
  buildProposal,
  type Candidate,
  type Finding,
  type FindingSeverity,
  LENGTH_EXCEEDED,
  type PackRef,
  type Proposal,
  type ProposalField,
  type ProposalRecordInput,
  proposalToJson,
  type RejectedCandidate,
} from "./proposal.js";
export {
  type DatasetProvenance,
  type ElementRef,
  type ExternalProvenance,
  type Field,
  type HumanProvenance,
  type InferredProvenance,
  isAutoApprovable,
  nfc,
  PROVENANCE_KINDS,
  type ProposeFieldResult,
  type Provenance,
  type ProvenanceKind,
  proposeField,
  REJECTION_REASONS,
  type RejectionReason,
  recordInput,
  type Span,
  type SpanProvenance,
  type TransformProvenance,
} from "./provenance.js";
export * from "./state/batch.js";
export { IllegalTransition, type Machine, type MachineName } from "./state/machine.js";
export * from "./state/record.js";
export * from "./transforms.js";
