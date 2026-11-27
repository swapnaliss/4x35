// The repository layer (M1-03): the only code that imports the Drizzle tables (test
// `no-raw-tables.test.ts`). Workspace data goes through `forWorkspace`; sign-in, sessions, invites
// and resets by token hash go through `identityRepository`; content-free system rows through
// `systemRepository`.
export { type IdentityRepository, identityRepository, type UserMembership } from "./identity.js";
export { type SystemRepository, systemRepository } from "./system.js";
export type {
  ApiTokenRow,
  Executor,
  ExportInsert,
  ExportRow,
  IdempotencyKeyRow,
  InviteRow,
  JobTimingInsert,
  JobTimingRow,
  PasswordResetRow,
  PaymentFileLinkInsert,
  PaymentFileLinkRow,
  PreflightRunInsert,
  PreflightRunRow,
  ScopedAuditEventInsert,
  ScopedBatchInsert,
  SessionRow,
  WorkspaceContext,
} from "./types.js";
export {
  forWorkspace,
  type MemberRow,
  OutOfScopeError,
  type WorkspaceRepositories,
} from "./workspace.js";
