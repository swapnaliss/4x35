// Structuring and Review modules (architecture §5): proposals and the append-only decisions.
// `decisions` refuses UPDATE and DELETE by trigger (drizzle/0002_immutability.sql); only the cascade
// from a deleted record or batch removes its rows.
import { ActorKindSchema, DECISION_ACTIONS } from "@4x35/core";
import { doublePrecision, index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { records } from "./batches.js";
import { enumCheck, timestamptz } from "./columns.js";

export const ACTOR_KINDS = ActorKindSchema.options;

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    packId: text("pack_id").notNull(),
    packVersion: text("pack_version").notNull(),
    /** `proposalToJson(p).fields` (`buildProposal` output, M1-01). */
    fields: jsonb("fields").$type<unknown[]>().notNull(),
    findings: jsonb("findings").$type<unknown[]>().notNull(),
    rejected: jsonb("rejected").$type<unknown[]>().notNull(),
    /** Record-level confidence (M2-15); null until computed. */
    confidence: doublePrecision("confidence"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("proposals_record_created_idx").on(t.recordId, t.createdAt)],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recordId: uuid("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    /** The fields after an edit; null for approve, unknown and reopen. */
    fields: jsonb("fields").$type<unknown[]>(),
    /** A user id (actor_kind `session`) or an API token id (`token`). */
    actorId: uuid("actor_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    index("decisions_record_at_idx").on(t.recordId, t.at),
    index("decisions_proposal_idx").on(t.proposalId),
    enumCheck("decisions", t.action, "action", DECISION_ACTIONS),
    enumCheck("decisions", t.actorKind, "actor_kind", ACTOR_KINDS),
  ],
);
