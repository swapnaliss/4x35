/** Decision (append-only) and AuditEvent (append-only), docs/architecture.md §2. */
import { z } from "zod";
import {
  ActorKindSchema,
  ElementSchema,
  IdSchema,
  NonEmptyString,
  Sha256HexSchema,
} from "./common.js";

export const DECISION_ACTIONS = ["approve", "edit", "unknown", "reopen"] as const;

export const DecisionFieldSchema = z
  .object({
    element: ElementSchema,
    index: z.number().int().min(0).max(6),
    value: z.string().min(1),
  })
  .readonly();

export const DecisionSchema = z
  .object({
    id: IdSchema,
    recordId: IdSchema,
    proposalId: IdSchema,
    action: z.enum(DECISION_ACTIONS),
    /** The fields after an edit; null for approve, unknown and reopen. */
    fields: z.array(DecisionFieldSchema).readonly().nullable(),
    actorId: IdSchema,
    actorKind: ActorKindSchema,
    at: z.date(),
  })
  .readonly();
export type Decision = z.infer<typeof DecisionSchema>;

export const AuditEventSchema = z
  .object({
    id: IdSchema,
    workspaceId: IdSchema,
    actorId: IdSchema,
    actorKind: ActorKindSchema,
    action: NonEmptyString,
    subject: NonEmptyString,
    dataHash: Sha256HexSchema,
    at: z.date(),
  })
  .readonly();
export type AuditEvent = z.infer<typeof AuditEventSchema>;
