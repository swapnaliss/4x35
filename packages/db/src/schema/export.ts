// Export module (architecture §5): artefacts built from a batch. Exports are new rows (§7).
import { ActorKindSchema } from "@4x35/core";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { batches } from "./batches.js";
import { bytea, enumCheck, timestamptz } from "./columns.js";

export const exportsTable = pgTable(
  "exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    /** Artefact kind. M2-22 defines the set (and adds its CHECK in a later migration). */
    kind: text("kind").notNull(),
    bytes: bytea("bytes").notNull(),
    sha256: text("sha256").notNull(),
    actorId: uuid("actor_id").notNull(),
    actorKind: text("actor_kind").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    index("exports_batch_at_idx").on(t.batchId, t.at),
    enumCheck("exports", t.actorKind, "actor_kind", ActorKindSchema.options),
    check("exports_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);
