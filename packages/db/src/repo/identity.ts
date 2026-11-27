// The unscoped identity lookups (ADR 0013, M1-03): what sign-in, session checks, invite accept and
// password reset need before any workspace is known. These are the only unscoped reads of the
// identity tables; everything that belongs to a workspace goes through `forWorkspace`.
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  invites,
  memberships,
  passwordResets,
  sessions,
  users,
  workspaces,
} from "../schema/index.js";
import type {
  Executor,
  InviteRow,
  MembershipRole,
  PasswordResetRow,
  SessionRow,
  UserRow,
  WorkspaceRow,
} from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function first<T>(rows: readonly T[]): T | undefined {
  return rows[0];
}

function one<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error("expected one row");
  return row;
}

/** A membership of the signed-in user, with the workspace's name. */
export interface UserMembership {
  readonly workspaceId: string;
  readonly workspaceName: string;
  readonly role: MembershipRole;
  readonly isSandbox: boolean;
}

export interface IdentityRepository {
  findUserByEmail(email: string): Promise<UserRow | undefined>;
  getUser(id: string): Promise<UserRow | undefined>;
  /** Creates the user, or returns the existing one with that email (citext: case-insensitive). */
  ensureUser(email: string): Promise<UserRow>;
  setPasswordHash(userId: string, hash: string): Promise<void>;
  /** Every workspace the user belongs to, oldest first. */
  membershipsOf(userId: string): Promise<UserMembership[]>;

  createSession(v: {
    idHash: string;
    userId: string;
    csrfSecret: string;
    expiresAt: Date;
  }): Promise<SessionRow>;
  /** The session with this id hash, if it has not expired. */
  findLiveSession(idHash: string): Promise<SessionRow | undefined>;
  touchSession(idHash: string, expiresAt: Date): Promise<void>;
  deleteSession(idHash: string): Promise<void>;
  /** Deletes every session of the user; returns how many. */
  deleteUserSessions(userId: string): Promise<number>;

  /** Locks the unused, unexpired invite with this token hash (call inside a transaction). */
  lockUsableInvite(tokenHash: string): Promise<InviteRow | undefined>;
  markInviteUsed(id: string): Promise<void>;
  /** Locks the unused, unexpired reset with this token hash (call inside a transaction). */
  lockUsableReset(tokenHash: string): Promise<PasswordResetRow | undefined>;
  markResetUsed(id: string): Promise<void>;

  /** For `bootstrap:admin`: the oldest non-sandbox workspace, if any. */
  firstWorkspace(): Promise<WorkspaceRow | undefined>;
  createWorkspace(name: string): Promise<WorkspaceRow>;
  /** For `bootstrap:admin`: is `email` already an owner of the workspace? */
  isOwner(workspaceId: string, email: string): Promise<boolean>;
}

export function identityRepository(db: Executor): IdentityRepository {
  return {
    findUserByEmail: async (email) =>
      first(await db.select().from(users).where(eq(users.email, email))),
    getUser: async (id) =>
      UUID.test(id) ? first(await db.select().from(users).where(eq(users.id, id))) : undefined,
    ensureUser: async (email) => {
      await db.insert(users).values({ email }).onConflictDoNothing();
      return one(await db.select().from(users).where(eq(users.email, email)));
    },
    setPasswordHash: async (userId, hash) => {
      await db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId));
    },
    membershipsOf: async (userId) => {
      const rows = await db
        .select({
          workspaceId: memberships.workspaceId,
          workspaceName: workspaces.name,
          role: memberships.role,
          isSandbox: workspaces.isSandbox,
        })
        .from(memberships)
        .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
        .where(eq(memberships.userId, userId))
        .orderBy(asc(memberships.createdAt), asc(workspaces.name));
      return rows.map((r) => ({ ...r, role: r.role as MembershipRole }));
    },

    createSession: async (v) => one(await db.insert(sessions).values(v).returning()),
    findLiveSession: async (idHash) =>
      first(
        await db
          .select()
          .from(sessions)
          .where(and(eq(sessions.idHash, idHash), gt(sessions.expiresAt, sql`now()`))),
      ),
    touchSession: async (idHash, expiresAt) => {
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.idHash, idHash));
    },
    deleteSession: async (idHash) => {
      await db.delete(sessions).where(eq(sessions.idHash, idHash));
    },
    deleteUserSessions: async (userId) =>
      (
        await db
          .delete(sessions)
          .where(eq(sessions.userId, userId))
          .returning({ h: sessions.idHash })
      ).length,

    lockUsableInvite: async (tokenHash) =>
      first(
        await db
          .select()
          .from(invites)
          .where(
            and(
              eq(invites.tokenHash, tokenHash),
              isNull(invites.usedAt),
              gt(invites.expiresAt, sql`now()`),
            ),
          )
          .for("update"),
      ),
    markInviteUsed: async (id) => {
      await db.update(invites).set({ usedAt: sql`now()` }).where(eq(invites.id, id));
    },
    lockUsableReset: async (tokenHash) =>
      first(
        await db
          .select()
          .from(passwordResets)
          .where(
            and(
              eq(passwordResets.tokenHash, tokenHash),
              isNull(passwordResets.usedAt),
              gt(passwordResets.expiresAt, sql`now()`),
            ),
          )
          .for("update"),
      ),
    markResetUsed: async (id) => {
      await db.update(passwordResets).set({ usedAt: sql`now()` }).where(eq(passwordResets.id, id));
    },

    firstWorkspace: async () =>
      first(
        await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.isSandbox, false))
          .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
          .limit(1),
      ),
    createWorkspace: async (name) => one(await db.insert(workspaces).values({ name }).returning()),
    isOwner: async (workspaceId, email) =>
      (
        await db
          .select({ u: memberships.userId })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.workspaceId, workspaceId),
              eq(users.email, email),
              eq(memberships.role, "owner"),
            ),
          )
      ).length > 0,
  };
}
