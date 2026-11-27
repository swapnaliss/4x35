// Server-side sessions (ADR 0013, M1-03). The cookie holds 32 random bytes (base64url); the database
// holds only HMAC-SHA256(SESSION_SECRET, id) in `sessions.id_hash`. `expires_at` is the idle deadline:
// it slides to now + 12 h on use, never past created_at + 7 d.
import { createHmac, randomBytes } from "node:crypto";
import { type Executor, identityRepository, type SessionRow } from "@4x35/db";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { newCsrfSecret } from "./csrf.js";

export const SESSION_COOKIE = "__Host-4x35_session";
export const IDLE_MS = 12 * 3_600_000;
export const ABSOLUTE_MS = 7 * 24 * 3_600_000;
/** A session's idle deadline is written back at most this often (one UPDATE per minute per session). */
export const TOUCH_EVERY_MS = 60_000;

export interface SessionConfig {
  /** `SESSION_SECRET`: keys the stored hash of the session id. */
  readonly sessionSecret: string;
  /** False only when NODE_ENV=development (plain http on localhost). */
  readonly secureCookie: boolean;
}

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionId(id: string, sessionSecret: string): string {
  return createHmac("sha256", sessionSecret).update(id).digest("hex");
}

/** The idle deadline at `now` for a session created at `createdAt`. */
export function idleDeadline(createdAt: Date, now: Date): Date {
  return new Date(Math.min(now.getTime() + IDLE_MS, createdAt.getTime() + ABSOLUTE_MS));
}

/** Creates a session for `userId`; returns the raw id (for the cookie only) and the row. */
export async function createSession(
  db: Executor,
  cfg: SessionConfig,
  userId: string,
  now = new Date(),
): Promise<{ id: string; row: SessionRow }> {
  const id = newSessionId();
  const row = await identityRepository(db).createSession({
    idHash: hashSessionId(id, cfg.sessionSecret),
    userId,
    csrfSecret: newCsrfSecret(),
    expiresAt: idleDeadline(now, now),
  });
  return { id, row };
}

/** The live session for a raw cookie value, its idle deadline slid forward; null otherwise. */
export async function validateSession(
  db: Executor,
  cfg: SessionConfig,
  id: string,
  now = new Date(),
): Promise<SessionRow | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(id)) return null;
  const identity = identityRepository(db);
  const idHash = hashSessionId(id, cfg.sessionSecret);
  const row = await identity.findLiveSession(idHash);
  if (!row) return null;
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  // The 7-day cap holds even if a stored deadline were ever past it.
  if (row.createdAt.getTime() + ABSOLUTE_MS <= now.getTime()) return null;
  const next = idleDeadline(row.createdAt, now);
  if (next.getTime() - row.expiresAt.getTime() >= TOUCH_EVERY_MS) {
    await identity.touchSession(idHash, next);
    return { ...row, expiresAt: next };
  }
  return row;
}

export function readSessionCookie(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/**
 * The Set-Cookie value. Written by hand rather than with hono/cookie, whose serializer refuses a
 * `__Host-` cookie without Secure: the ticket keeps the name and drops Secure only when
 * NODE_ENV=development (plain http on localhost).
 */
export function sessionCookieHeader(cfg: SessionConfig, id: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${id}`,
    `Max-Age=${maxAgeSeconds}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (cfg.secureCookie) parts.push("Secure");
  return parts.join("; ");
}

export function setSessionCookie(c: Context, cfg: SessionConfig, id: string): void {
  c.header("Set-Cookie", sessionCookieHeader(cfg, id, ABSOLUTE_MS / 1000), { append: true });
}

export function clearSessionCookie(c: Context, cfg: SessionConfig): void {
  c.header("Set-Cookie", sessionCookieHeader(cfg, "", 0), { append: true });
}
