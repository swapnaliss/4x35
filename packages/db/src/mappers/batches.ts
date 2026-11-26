// Row ↔ entity mappers for batches and records.
import { type Batch, BatchSchema, type DomainRecord, RecordSchema } from "@4x35/core";
import type { batches, records } from "../schema/batches.js";

export type BatchRow = typeof batches.$inferSelect;
export type BatchInsert = typeof batches.$inferInsert;
export type RecordRow = typeof records.$inferSelect;
export type RecordInsert = typeof records.$inferInsert;

/**
 * `purgeAfter` is sent but the insert trigger replaces it with `createdAt` (UTC) + 30 days, so a
 * Batch whose `purgeAfter` differs from that reads back with the database's value.
 */
export function batchToRow(b: Batch): BatchInsert {
  return {
    id: b.id,
    workspaceId: b.workspaceId,
    kind: b.kind,
    format: b.format,
    original: b.original,
    sha256: b.sha256,
    encoding: b.encoding,
    delimiter: b.delimiter,
    eol: b.eol,
    columnMap: b.columnMap === null ? null : { ...b.columnMap },
    packId: b.pack.id,
    packVersion: b.pack.version,
    form: b.form,
    status: b.status,
    failureReason: b.failureReason,
    locked: b.locked,
    createdBy: b.createdBy,
    createdAt: b.createdAt,
    purgeAfter: b.purgeAfter,
  };
}

export function batchFromRow(row: BatchRow): Batch {
  return BatchSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    format: row.format,
    original: row.original,
    sha256: row.sha256,
    encoding: row.encoding,
    delimiter: row.delimiter,
    eol: row.eol,
    columnMap: row.columnMap,
    pack: { id: row.packId, version: row.packVersion },
    form: row.form,
    status: row.status,
    failureReason: row.failureReason,
    locked: row.locked,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    purgeAfter: row.purgeAfter,
  });
}

export function recordToRow(r: DomainRecord): RecordInsert {
  return {
    id: r.id,
    batchId: r.batchId,
    location: r.location,
    partyRole: r.partyRole,
    name: r.name,
    originalLines: [...r.originalLines],
    countryHint: r.countryHint,
    status: r.status,
    version: r.version,
  };
}

export function recordFromRow(row: RecordRow): DomainRecord {
  return RecordSchema.parse({
    id: row.id,
    batchId: row.batchId,
    location: row.location,
    partyRole: row.partyRole,
    name: row.name,
    originalLines: row.originalLines,
    countryHint: row.countryHint,
    status: row.status,
    version: row.version,
  });
}
