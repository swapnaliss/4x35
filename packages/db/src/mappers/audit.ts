// Row ↔ entity mappers for the append-only audit log.
import { type AuditEvent, AuditEventSchema } from "@4x35/core";
import type { auditEvents } from "../schema/audit.js";

export type AuditEventRow = typeof auditEvents.$inferSelect;
export type AuditEventInsert = typeof auditEvents.$inferInsert;

export function auditEventToRow(e: AuditEvent): AuditEventInsert {
  return {
    id: e.id,
    workspaceId: e.workspaceId,
    actorId: e.actorId,
    actorKind: e.actorKind,
    action: e.action,
    subject: e.subject,
    dataHash: e.dataHash,
    at: e.at,
  };
}

export function auditEventFromRow(row: AuditEventRow): AuditEvent {
  return AuditEventSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    actorId: row.actorId,
    actorKind: row.actorKind,
    action: row.action,
    subject: row.subject,
    dataHash: row.dataHash,
    at: row.at,
  });
}
