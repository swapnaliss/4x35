// Pre-flight module (architecture §5): one run of a pack over a payment file. Rows are never updated.
import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { batches } from "./batches.js";
import { timestamptz } from "./columns.js";

export const preflightRuns = pgTable(
  "preflight_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    packId: text("pack_id").notNull(),
    packVersion: text("pack_version").notNull(),
    /** Per-transaction results (M2-21). */
    results: jsonb("results").notNull(),
    summary: jsonb("summary").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [index("preflight_runs_batch_at_idx").on(t.batchId, t.at)],
);
