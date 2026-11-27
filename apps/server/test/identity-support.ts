// Helpers for the identity and authz matrix integration tests (M1-03). Test-only. Every email is a
// synthetic `@example.test` address; passwords are synthetic.
import { randomBytes } from "node:crypto";
import type { MembershipRole } from "@4x35/core";
import { type Database, forWorkspace, identityRepository } from "@4x35/db";
import type pg from "pg";
import { type App, createApp } from "../src/app.js";
import { CSRF_HEADER, csrfToken } from "../src/identity/csrf.js";
import { hashPassword } from "../src/identity/passwords.js";
import { createSession, SESSION_COOKIE } from "../src/identity/sessions.js";
import type { AuthConfig } from "../src/middleware/session.js";
import { selectOne } from "../src/obs/health.js";
import { TEST_KEYS } from "./support.js";

export const AUTH: AuthConfig = {
  sessionSecret: TEST_KEYS.SESSION_SECRET,
  csrfSecret: TEST_KEYS.CSRF_SECRET,
  secureCookie: true,
};

/** The synthetic password of every seeded user (≥ 12 characters). */
export const PASSWORD = "synthetic correct horse 42";

let passwordHash: Promise<string> | undefined;
/** One argon2id hash of PASSWORD, shared by every seeded user (hashing is slow by design). */
export function sharedHash(): Promise<string> {
  passwordHash ??= hashPassword(PASSWORD);
  return passwordHash;
}

export function testApp(db: Database, pool: pg.Pool): App {
  return createApp(
    { version: "0.1.0", commit: "test" },
    { db, auth: AUTH, readiness: { database: selectOne(pool) } },
  );
}

export const email = (label: string) => `${label}-${randomBytes(4).toString("hex")}@example.test`;

export interface SeededUser {
  readonly id: string;
  readonly email: string;
}

export async function seedUser(db: Database, label: string): Promise<SeededUser> {
  const identity = identityRepository(db);
  const u = await identity.ensureUser(email(label));
  await identity.setPasswordHash(u.id, await sharedHash());
  return { id: u.id, email: u.email };
}

export interface SeededWorkspace {
  readonly id: string;
  readonly owner: SeededUser;
  readonly reviewer: SeededUser;
}

/** A workspace with one owner and one reviewer. */
export async function seedWorkspace(db: Database, label: string): Promise<SeededWorkspace> {
  const ws = await identityRepository(db).createWorkspace(`Synthetic ${label}`);
  const owner = await seedUser(db, `${label}-owner`);
  const reviewer = await seedUser(db, `${label}-reviewer`);
  const repos = forWorkspace({ workspaceId: ws.id }, db);
  await repos.memberships.add(owner.id, "owner");
  await repos.memberships.add(reviewer.id, "reviewer");
  return { id: ws.id, owner, reviewer };
}

export async function addMember(
  db: Database,
  workspaceId: string,
  label: string,
  role: MembershipRole,
): Promise<SeededUser> {
  const u = await seedUser(db, label);
  await forWorkspace({ workspaceId }, db).memberships.add(u.id, role);
  return u;
}

export interface TestSession {
  /** The raw cookie value. */
  readonly id: string;
  readonly csrf: string;
  readonly cookie: string;
}

/** A session created directly (no password hashing), with its cookie header and CSRF token. */
export async function sessionFor(db: Database, userId: string): Promise<TestSession> {
  const { id, row } = await createSession(db, AUTH, userId);
  return {
    id,
    csrf: csrfToken(AUTH.csrfSecret, row.csrfSecret),
    cookie: `${SESSION_COOKIE}=${id}`,
  };
}

export interface Req {
  readonly method?: string;
  readonly body?: unknown;
  readonly session?: TestSession;
  /** Override the CSRF header: a string to send, null to send none. Default: the session's token. */
  readonly csrf?: string | null;
  readonly headers?: Record<string, string>;
}

export async function call(app: App, path: string, req: Req = {}): Promise<Response> {
  const headers: Record<string, string> = { ...req.headers };
  if (req.body !== undefined) headers["content-type"] = "application/json";
  if (req.session) {
    headers.cookie = req.session.cookie;
    const csrf = req.csrf === undefined ? req.session.csrf : req.csrf;
    if (csrf !== null) headers[CSRF_HEADER] = csrf;
  } else if (typeof req.csrf === "string") {
    headers[CSRF_HEADER] = req.csrf;
  }
  return app.request(path, {
    method: req.method ?? "GET",
    headers,
    ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
  });
}

/** The value of `__Host-4x35_session` in a response's Set-Cookie, if any. */
export function sessionCookieOf(res: Response): string | undefined {
  for (const line of res.headers.getSetCookie()) {
    const m = new RegExp(`^${SESSION_COOKIE}=([^;]*)`).exec(line);
    if (m) return m[1];
  }
  return undefined;
}
