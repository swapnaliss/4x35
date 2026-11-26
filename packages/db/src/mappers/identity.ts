// Row ↔ entity mappers for the identity module. Reads are validated with the core zod schemas, so a
// row that breaks an entity invariant fails loudly instead of leaking into the domain.
import {
  type Membership,
  MembershipSchema,
  type User,
  UserSchema,
  type Workspace,
  WorkspaceSchema,
} from "@4x35/core";
import type { memberships, users, workspaces } from "../schema/identity.js";

export type WorkspaceRow = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;
export type MembershipRow = typeof memberships.$inferSelect;
export type MembershipInsert = typeof memberships.$inferInsert;

export function workspaceToRow(w: Workspace): WorkspaceInsert {
  return {
    id: w.id,
    name: w.name,
    settings: {
      fourEyes: w.settings.fourEyes,
      llmOptIn: w.settings.llmOptIn,
      quotas: { ...w.settings.quotas },
    },
    isSandbox: w.isSandbox,
    createdAt: w.createdAt,
  };
}

export function workspaceFromRow(row: WorkspaceRow): Workspace {
  return WorkspaceSchema.parse({
    id: row.id,
    name: row.name,
    settings: row.settings,
    isSandbox: row.isSandbox,
    createdAt: row.createdAt,
  });
}

/** The password hash is not part of the entity; M1-03 writes it separately. */
export function userToRow(u: User): UserInsert {
  return { id: u.id, email: u.email, createdAt: u.createdAt };
}

export function userFromRow(row: UserRow): User {
  return UserSchema.parse({ id: row.id, email: row.email, createdAt: row.createdAt });
}

export function membershipToRow(m: Membership): MembershipInsert {
  return { workspaceId: m.workspaceId, userId: m.userId, role: m.role };
}

export function membershipFromRow(row: MembershipRow): Membership {
  return MembershipSchema.parse({
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role,
  });
}
