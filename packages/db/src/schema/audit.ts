// Audit module (architecture §5): append-only events. UPDATE and DELETE raise by trigger
// (drizzle/0002_immutability.sql). No foreign keys: the log outlives purged batches and only holds
// hashes (ADR 0023). Feature writes arrive with M1-08.
import { ActorKindSchema } from "@4x35/core";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { enumCheck, timestamptz } from "./columns.js";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    subject: text("subject").notNull(),
    dataHash: text("data_hash").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    index("audit_events_workspace_at_idx").on(t.workspaceId, t.at),
    enumCheck("audit_events", t.actorKind, "actor_kind", ActorKindSchema.options),
    check("audit_events_data_hash_check", sql`${t.dataHash} ~ '^[0-9a-f]{64}$'`),
  ],
);
