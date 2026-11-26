// Ingest module (architecture §5): batches (one upload) and their records.
// Immutability of `original`, `sha256` and `original_lines` and the `purge_after` rule live in the
// triggers of drizzle/0002_immutability.sql (drizzle-kit has no trigger DSL).
import {
  BATCH_FORMATS,
  BATCH_KINDS,
  BATCH_STATES,
  RECORD_STATES,
  type RecordLocation,
  TARGET_FORMS,
} from "@4x35/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { bytea, enumCheck, timestamptz } from "./columns.js";
import { users, workspaces } from "./identity.js";

export const EOL_KINDS = ["lf", "crlf", "cr"] as const;

export const batches = pgTable(
  "batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    format: text("format").notNull(),
    /** The uploaded bytes, never modified (R5). */
    original: bytea("original").notNull(),
    sha256: text("sha256").notNull(),
    encoding: text("encoding").notNull(),
    delimiter: text("delimiter"),
    eol: text("eol"),
    columnMap: jsonb("column_map").$type<Record<string, string>>(),
    packId: text("pack_id").notNull(),
    packVersion: text("pack_version").notNull(),
    form: text("form").notNull(),
    status: text("status").notNull().default("uploaded"),
    failureReason: text("failure_reason"),
    locked: boolean("locked").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    /** Overwritten on insert by a trigger: `created_at` (UTC) + 30 days (ADR 0023). */
    purgeAfter: timestamptz("purge_after").notNull().default(sql`now() + interval '30 days'`),
  },
  (t) => [
    uniqueIndex("batches_dedup_key").on(t.workspaceId, t.sha256, t.packId, t.packVersion, t.form),
    index("batches_purge_after_idx").on(t.purgeAfter),
    enumCheck("batches", t.kind, "kind", BATCH_KINDS),
    enumCheck("batches", t.format, "format", BATCH_FORMATS),
    enumCheck("batches", t.form, "form", TARGET_FORMS),
    enumCheck("batches", t.status, "status", BATCH_STATES),
    enumCheck("batches", t.eol, "eol", EOL_KINDS),
    check("batches_sha256_check", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const records = pgTable(
  "records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => batches.id, { onDelete: "cascade" }),
    location: jsonb("location").$type<RecordLocation>().notNull(),
    partyRole: text("party_role").notNull(),
    name: text("name"),
    /** The record's original address lines, never modified (R5). */
    originalLines: text("original_lines").array().notNull(),
    countryHint: text("country_hint"),
    status: text("status").notNull().default("pending"),
    /** Optimistic concurrency (ADR 0004): a stale write returns 409. */
    version: integer("version").notNull().default(0),
  },
  (t) => [
    index("records_batch_status_idx").on(t.batchId, t.status),
    enumCheck("records", t.status, "status", RECORD_STATES),
    check("records_version_check", sql`${t.version} >= 0`),
  ],
);
