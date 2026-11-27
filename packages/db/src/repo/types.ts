// Shared types of the repository layer (M1-03).
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type * as schema from "../schema/index.js";

/** A `Database` or a `Tx` from `withTx`: every repository works inside or outside a transaction. */
export type Executor = PgDatabase<NodePgQueryResultHKT, typeof schema>;

/** The workspace every query of a `forWorkspace` repository is filtered by. */
export interface WorkspaceContext {
  readonly workspaceId: string;
}

export type WorkspaceRow = typeof schema.workspaces.$inferSelect;
export type UserRow = typeof schema.users.$inferSelect;
export type MembershipRow = typeof schema.memberships.$inferSelect;
export type InviteRow = typeof schema.invites.$inferSelect;
export type SessionRow = typeof schema.sessions.$inferSelect;
export type PasswordResetRow = typeof schema.passwordResets.$inferSelect;
export type ApiTokenRow = typeof schema.apiTokens.$inferSelect;
export type BatchRow = typeof schema.batches.$inferSelect;
export type ScopedBatchInsert = Omit<typeof schema.batches.$inferInsert, "workspaceId">;
export type RecordRow = typeof schema.records.$inferSelect;
export type RecordInsert = typeof schema.records.$inferInsert;
export type ProposalRow = typeof schema.proposals.$inferSelect;
export type ProposalInsert = typeof schema.proposals.$inferInsert;
export type DecisionRow = typeof schema.decisions.$inferSelect;
export type DecisionInsert = typeof schema.decisions.$inferInsert;
export type AuditEventRow = typeof schema.auditEvents.$inferSelect;
export type ScopedAuditEventInsert = Omit<typeof schema.auditEvents.$inferInsert, "workspaceId">;
export type ExportRow = typeof schema.exportsTable.$inferSelect;
export type ExportInsert = typeof schema.exportsTable.$inferInsert;
export type PreflightRunRow = typeof schema.preflightRuns.$inferSelect;
export type PreflightRunInsert = typeof schema.preflightRuns.$inferInsert;
export type PaymentFileLinkRow = typeof schema.paymentFileLinks.$inferSelect;
export type PaymentFileLinkInsert = typeof schema.paymentFileLinks.$inferInsert;
export type IdempotencyKeyRow = typeof schema.idempotencyKeys.$inferSelect;
export type JobTimingRow = typeof schema.jobTimings.$inferSelect;
export type JobTimingInsert = typeof schema.jobTimings.$inferInsert;
export type { MembershipRole } from "@4x35/core";
