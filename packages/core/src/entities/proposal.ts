/**
 * The stored shape of a Proposal (the JSON `buildProposal` + `proposalToJson` produce). Parsing a
 * stored row with this schema gives a `StoredProposal`, which is data only: it is not a `Proposal`,
 * and the only way to make a new one is `buildProposal` (R6).
 */
import { z } from "zod";
import { REJECTION_REASONS } from "../provenance.js";
import { ElementSchema, IdSchema, NonEmptyString, PackRefSchema } from "./common.js";

const SpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
const ElementRefSchema = z.object({
  element: ElementSchema,
  index: z.number().int().min(0).max(6),
});

export const ProvenanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("span"), span: SpanSchema }),
  z.object({
    kind: z.literal("transform"),
    transform: z.object({ id: NonEmptyString, version: z.number().int().positive() }),
    source: SpanSchema,
  }),
  z.object({
    kind: z.literal("dataset"),
    datasetId: NonEmptyString,
    recordKey: NonEmptyString,
    unique: z.literal(true),
    source: SpanSchema,
  }),
  z.object({
    kind: z.literal("inferred"),
    ruleId: NonEmptyString,
    from: z.union([z.object({ span: SpanSchema }), z.object({ field: ElementRefSchema })]),
  }),
  z.object({ kind: z.literal("human"), actorId: NonEmptyString }),
  z.object({ kind: z.literal("external"), tokenId: NonEmptyString }),
]);

export const ProposalFieldSchema = z.object({
  element: ElementSchema,
  index: z.number().int().min(0).max(6),
  value: z.string().min(1),
  provenance: ProvenanceSchema,
  confidence: z.number().min(0).max(1).nullable(),
});

export const FindingSchema = z.object({
  ruleId: NonEmptyString,
  severity: z.enum(["reject", "strip", "warn"]),
  target: ElementRefSchema.nullable(),
  message: z.string(),
});

export const StoredProposalSchema = z
  .object({
    recordId: IdSchema,
    pack: PackRefSchema,
    fields: z.array(ProposalFieldSchema).readonly(),
    rejected: z
      .array(z.object({ candidate: z.unknown(), reason: z.enum(REJECTION_REASONS) }))
      .readonly(),
    findings: z.array(FindingSchema).readonly(),
  })
  .readonly();
export type StoredProposal = z.infer<typeof StoredProposalSchema>;
