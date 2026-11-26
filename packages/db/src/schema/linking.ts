// Linking module (architecture §5, ADR 0022): payment-file party ↔ master-list record.
import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { batches, records } from "./batches.js";
import { enumCheck, timestamptz } from "./columns.js";

/** PaymentFileLink status (architecture §2); `ambiguous` and `none` go to review. */
export const LINK_STATUSES = ["matched", "ambiguous", "none"] as const;

export const paymentFileLinks = pgTable(
  "payment_file_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The payment-file batch that owns the link (purged with it). */
    paymentBatchId: uuid("payment_batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    /** Where the party sits in the payment file (a `RecordLocation`). */
    partyLocation: jsonb("party_location").notNull(),
    /** The matched master-list record; null for `ambiguous` and `none`. */
    masterRecordId: uuid("master_record_id").references(() => records.id, {
      onDelete: "cascade",
    }),
    matchKey: text("match_key").notNull(),
    status: text("status").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("payment_file_links_batch_idx").on(t.paymentBatchId),
    index("payment_file_links_master_idx").on(t.masterRecordId),
    enumCheck("payment_file_links", t.status, "status", LINK_STATUSES),
  ],
);
