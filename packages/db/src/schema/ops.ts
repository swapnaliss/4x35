// Operational tables (architecture §5): idempotency keys (ADR 0005) and job timings (ADR 0006).
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { enumCheck, timestamptz } from "./columns.js";
import { workspaces } from "./identity.js";

/** Terminal outcomes of one job attempt (architecture §2, Job machine). */
export const JOB_OUTCOMES = ["completed", "failed", "dead_letter"] as const;

/** `Idempotency-Key` replays, kept 24 h (ADR 0005). Written by M1-04. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    requestHash: text("request_hash").notNull(),
    /** The stored response (status and body) replayed for the same key and request hash. */
    response: jsonb("response").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "idempotency_keys_pkey", columns: [t.workspaceId, t.key] }),
    index("idempotency_keys_at_idx").on(t.at),
  ],
);

/** One row per job attempt (M1-05). No foreign key: timings hold no content and outlive a purge. */
export const jobTimings = pgTable(
  "job_timings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    /** The job kind name registered with `defineJob` (M1-04). */
    kind: text("kind").notNull(),
    batchId: uuid("batch_id"),
    chunk: integer("chunk"),
    ms: integer("ms").notNull(),
    outcome: text("outcome").notNull(),
    at: timestamptz("at").notNull().defaultNow(),
  },
  (t) => [
    index("job_timings_job_idx").on(t.jobId),
    index("job_timings_kind_at_idx").on(t.kind, t.at),
    enumCheck("job_timings", t.outcome, "outcome", JOB_OUTCOMES),
    check("job_timings_ms_check", sql`${t.ms} >= 0`),
  ],
);
