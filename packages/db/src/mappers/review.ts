// Row ↔ entity mappers for proposals and decisions.
import {
  type Decision,
  DecisionSchema,
  type Proposal,
  proposalToJson,
  type StoredProposal,
  StoredProposalSchema,
} from "@4x35/core";
import type { decisions, proposals } from "../schema/review.js";

export type ProposalRow = typeof proposals.$inferSelect;
export type ProposalInsert = typeof proposals.$inferInsert;
export type DecisionRow = typeof decisions.$inferSelect;
export type DecisionInsert = typeof decisions.$inferInsert;

/**
 * A stored proposal row. `stored` is data only (M1-01): the only way to make a new Proposal is
 * `buildProposal`, so reading one back never yields a `Proposal`.
 */
export interface PersistedProposal {
  readonly id: string;
  readonly stored: StoredProposal;
  /** Record-level confidence (M2-15); null until computed. */
  readonly confidence: number | null;
  readonly createdAt: Date;
}

/** The stored form of a built Proposal: its stable JSON (`proposalToJson`), parsed and validated. */
export function storedProposal(p: Proposal): StoredProposal {
  return StoredProposalSchema.parse(JSON.parse(proposalToJson(p)));
}

export function proposalToRow(p: PersistedProposal): ProposalInsert {
  return {
    id: p.id,
    recordId: p.stored.recordId,
    packId: p.stored.pack.id,
    packVersion: p.stored.pack.version,
    fields: [...p.stored.fields],
    findings: [...p.stored.findings],
    rejected: [...p.stored.rejected],
    confidence: p.confidence,
    createdAt: p.createdAt,
  };
}

export function proposalFromRow(row: ProposalRow): PersistedProposal {
  return {
    id: row.id,
    stored: StoredProposalSchema.parse({
      recordId: row.recordId,
      pack: { id: row.packId, version: row.packVersion },
      fields: row.fields,
      rejected: row.rejected,
      findings: row.findings,
    }),
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

export function decisionToRow(d: Decision): DecisionInsert {
  return {
    id: d.id,
    recordId: d.recordId,
    proposalId: d.proposalId,
    action: d.action,
    fields: d.fields === null ? null : [...d.fields],
    actorId: d.actorId,
    actorKind: d.actorKind,
    at: d.at,
  };
}

export function decisionFromRow(row: DecisionRow): Decision {
  return DecisionSchema.parse({
    id: row.id,
    recordId: row.recordId,
    proposalId: row.proposalId,
    action: row.action,
    fields: row.fields,
    actorId: row.actorId,
    actorKind: row.actorKind,
    at: row.at,
  });
}
