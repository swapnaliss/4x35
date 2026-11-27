// Invites and admin-issued password reset links (ADR 0013, M1-03). Both are one-time tokens: 32
// random bytes (base64url) handed to the owner once; only SHA-256(token) is stored. A token is used
// inside one transaction that locks its row (`FOR UPDATE`), so two concurrent uses cannot both win,
// and a failure after the lock rolls the use back. Used, expired and unknown tokens all answer 410.
import { createHash, randomBytes } from "node:crypto";
import type { MembershipRole } from "@4x35/core";
import { type Database, forWorkspace, identityRepository, withTx } from "@4x35/db";
import { checkPassword, hashPassword, type PasswordCheck, verifyPassword } from "./passwords.js";

export const INVITE_TTL_MS = 72 * 3_600_000;
export const RESET_TTL_MS = 3_600_000;

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface IssuedToken {
  readonly id: string;
  readonly token: string;
  readonly expiresAt: Date;
}

export type IssueInviteResult = ({ kind: "issued" } & IssuedToken) | { kind: "already_member" };

/** An invite to `workspaceId` for `email` with `role`, valid 72 h. */
export async function issueInvite(
  db: Database,
  workspaceId: string,
  email: string,
  role: MembershipRole,
  now = new Date(),
): Promise<IssueInviteResult> {
  return withTx(db, async (tx) => {
    const user = await identityRepository(tx).findUserByEmail(email);
    const repos = forWorkspace({ workspaceId }, tx);
    if (user && (await repos.memberships.get(user.id))) return { kind: "already_member" };
    const token = newToken();
    const row = await repos.invites.create({
      email,
      role,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    });
    return { kind: "issued", id: row.id, token, expiresAt: row.expiresAt };
  });
}

export type AcceptResult =
  | { kind: "accepted"; userId: string; workspaceId: string; role: MembershipRole }
  | { kind: "gone" }
  | { kind: "weak_password"; reason: Exclude<PasswordCheck, "ok"> }
  | { kind: "wrong_password" };

/**
 * Uses an invite. A new user sets their password here; an existing user (a member elsewhere) proves
 * theirs, so an invite token can never take over an account.
 */
export async function acceptInvite(
  db: Database,
  token: string,
  password: string,
): Promise<AcceptResult> {
  return withTx(db, async (tx) => {
    const identity = identityRepository(tx);
    const invite = await identity.lockUsableInvite(hashToken(token));
    if (!invite) return { kind: "gone" };
    const role: MembershipRole = invite.role === "owner" ? "owner" : "reviewer";
    const existing = await identity.findUserByEmail(invite.email);
    let userId: string;
    if (existing?.passwordHash) {
      if (!(await verifyPassword(existing.passwordHash, password))) return { kind: "wrong_password" };
      userId = existing.id;
    } else {
      const check = checkPassword(password, invite.email);
      if (check !== "ok") return { kind: "weak_password", reason: check };
      const user = existing ?? (await identity.ensureUser(invite.email));
      await identity.setPasswordHash(user.id, await hashPassword(password));
      userId = user.id;
    }
    await forWorkspace({ workspaceId: invite.workspaceId }, tx).memberships.add(userId, role);
    await identity.markInviteUsed(invite.id);
    return { kind: "accepted", userId, workspaceId: invite.workspaceId, role };
  });
}

export type IssueResetResult = ({ kind: "issued" } & IssuedToken) | { kind: "not_member" };

/** A reset link for a member of `workspaceId`, valid 1 h. */
export async function issueReset(
  db: Database,
  workspaceId: string,
  userId: string,
  now = new Date(),
): Promise<IssueResetResult> {
  return withTx(db, async (tx) => {
    const repos = forWorkspace({ workspaceId }, tx);
    if (!(await repos.memberships.get(userId))) return { kind: "not_member" };
    const token = newToken();
    const row = await repos.passwordResets.create({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + RESET_TTL_MS),
    });
    return { kind: "issued", id: row.id, token, expiresAt: row.expiresAt };
  });
}

export type RedeemResult =
  | { kind: "reset"; userId: string; sessionsEnded: number }
  | { kind: "gone" }
  | { kind: "weak_password"; reason: Exclude<PasswordCheck, "ok"> };

/** Uses a reset link: sets the new password and ends every session of the user. */
export async function redeemReset(
  db: Database,
  token: string,
  password: string,
): Promise<RedeemResult> {
  return withTx(db, async (tx) => {
    const identity = identityRepository(tx);
    const reset = await identity.lockUsableReset(hashToken(token));
    if (!reset) return { kind: "gone" };
    const user = await identity.getUser(reset.userId);
    if (!user) return { kind: "gone" };
    const check = checkPassword(password, user.email);
    if (check !== "ok") return { kind: "weak_password", reason: check };
    await identity.setPasswordHash(user.id, await hashPassword(password));
    const sessionsEnded = await identity.deleteUserSessions(user.id);
    await identity.markResetUsed(reset.id);
    return { kind: "reset", userId: user.id, sessionsEnded };
  });
}
