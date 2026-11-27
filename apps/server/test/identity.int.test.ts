/**
 * Identity (M1-03) against a real Postgres 17, through the HTTP app:
 *   passwords   argon2id with the OWASP parameters; minimum 12; not the email
 *   AC 6        wrong password and unknown email answer the identical status and body
 *   sessions    cookie attributes, rotation on login, logout deletes the row, 12 h idle / 7 d cap
 *   AC 4        an invite works once (then 410), an expired invite is 410; a reset link works once
 *               and ends every session of the user
 *   AC 5        the raw cookie value and raw invite/reset tokens appear nowhere in the database
 *   AC 3        P2 P-csrf-required: every non-GET session route is 403 without a valid X-CSRF-Token
 *               and succeeds with one (fast-check, plus one planted bug)
 *   AC 7        bootstrap:admin twice leaves one workspace and one pending invite
 *   BL-01 7190154093: an authenticated POST is deduplicated (auth sets the workspace first)
 */
import { randomBytes, randomUUID } from "node:crypto";
import { forWorkspace, identityRepository } from "@4x35/db";
import { OpenAPIHono } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import type { App, AppEnv } from "../src/app.js";
import { IDENTITY_IDEMPOTENCY_OPT_OUT } from "../src/app.js";
import { authorize } from "../src/authz/enforce.js";
import { AUTHZ_MATRIX, type RouteClass } from "../src/authz/matrix.js";
import { bootstrapAdmin } from "../src/identity/bootstrap.js";
import { CSRF_HEADER, csrfValid, SAFE_METHODS } from "../src/identity/csrf.js";
import { hashToken } from "../src/identity/invites.js";
import { ARGON2, checkPassword, hashPassword, verifyPassword } from "../src/identity/passwords.js";
import { registerIdentityRoutes } from "../src/identity/routes.js";
import {
  ABSOLUTE_MS,
  hashSessionId,
  IDLE_MS,
  idleDeadline,
  validateSession,
} from "../src/identity/sessions.js";
import { idempotency, REPLAYED_HEADER } from "../src/middleware/idempotency.js";
import { problem } from "../src/middleware/problem.js";
import { requireRole } from "../src/middleware/role.js";
import { session } from "../src/middleware/session.js";
import { workspaceContext } from "../src/middleware/workspace.js";
import { silentLogger } from "../src/obs/logger.js";
import { requestLogging } from "../src/obs/request-id.js";
import {
  AUTH,
  addMember,
  call,
  email,
  PASSWORD,
  type SeededWorkspace,
  seedUser,
  seedWorkspace,
  sessionCookieOf,
  sessionFor,
  type TestSession,
  testApp,
} from "./identity-support.js";

const P2_RUNS = Math.max(100, Number(process.env.FC_NUM_RUNS ?? 0) || 0);

describe.skipIf(!hasDatabase)("identity (M1-03, real Postgres)", () => {
  let t: TestDb;
  let app: App;
  let ws: SeededWorkspace;

  beforeAll(async () => {
    t = await createTestDatabase("identity", { migrate: true });
    app = testApp(t.db, t.pool);
    ws = await seedWorkspace(t.db, "id");
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });

  const sessionsOf = async (userId: string) =>
    (
      await t.pool.query<{ n: number }>(
        "select count(*)::int as n from sessions where user_id = $1",
        [userId],
      )
    ).rows[0]?.n ?? -1;

  // ---- passwords --------------------------------------------------------------------------------

  it("passwords: argon2id with m=19456 KiB, t=2, p=1; at least 12 characters; never the email", async () => {
    const h = await hashPassword(PASSWORD);
    expect(h).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(ARGON2).toMatchObject({ memoryCost: 19_456, timeCost: 2, parallelism: 1 });
    expect(await verifyPassword(h, PASSWORD)).toBe(true);
    expect(await verifyPassword(h, `${PASSWORD}x`)).toBe(false);
    expect(await verifyPassword("not a hash", PASSWORD)).toBe(false);
    expect(checkPassword("elevenchars", "a@example.test")).toBe("too_short");
    expect(checkPassword("twelve chars", "a@example.test")).toBe("ok");
    // Twelve code points, fewer than twelve UTF-16 units is not the point: 11 CJK letters fail.
    expect(checkPassword("東京都千代田区丸の内一丁", "a@example.test")).toBe("ok");
    expect(checkPassword("東京都千代田区丸の内一", "a@example.test")).toBe("too_short");
    expect(checkPassword("Long.Name@Example.TEST", "long.name@example.test")).toBe("equals_email");
  });

  // ---- login (AC 6) and sessions --------------------------------------------------------------

  it("AC 6: a wrong password and an unknown email answer the identical status and body", async () => {
    const wrong = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: ws.owner.email, password: "wrong password 123" },
    });
    const unknown = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: email("nobody"), password: "wrong password 123" },
    });
    const invited = await identityRepository(t.db).ensureUser(email("no-password-yet"));
    const noPassword = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: invited.email, password: "wrong password 123" },
    });
    const bodies = await Promise.all([wrong, unknown, noPassword].map((r) => r.text()));
    expect([wrong.status, unknown.status, noPassword.status]).toEqual([401, 401, 401]);
    expect(bodies[1]).toBe(bodies[0]);
    expect(bodies[2]).toBe(bodies[0]);
    expect(wrong.headers.get("content-type")).toBe(unknown.headers.get("content-type"));
    expect(wrong.headers.get("content-type")).toBe("application/problem+json");
    expect(sessionCookieOf(wrong)).toBeUndefined();
  });

  it("login sets __Host-4x35_session (HttpOnly, Secure, SameSite=Lax, Path=/), rotates a presented session, and /me returns the CSRF token", async () => {
    const before = await sessionFor(t.db, ws.reviewer.id);
    const res = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: ws.reviewer.email.toUpperCase(), password: PASSWORD },
      headers: { cookie: before.cookie },
    });
    expect(res.status).toBe(200);
    const [line] = res.headers.getSetCookie();
    expect(line).toMatch(/^__Host-4x35_session=[A-Za-z0-9_-]{43}; /);
    expect(line).toContain("HttpOnly");
    expect(line).toContain("Secure");
    expect(line).toContain("SameSite=Lax");
    expect(line).toContain("Path=/");
    expect(line).not.toContain("Domain");
    const id = sessionCookieOf(res) ?? "";
    expect(id).not.toBe(before.id);
    // The presented session is gone: rotation.
    expect(
      await identityRepository(t.db).findLiveSession(hashSessionId(before.id, AUTH.sessionSecret)),
    ).toBeUndefined();
    const body = (await res.json()) as {
      user: { id: string };
      csrfToken: string;
      memberships: unknown[];
    };
    expect(body.user.id).toBe(ws.reviewer.id);
    expect(body.memberships).toEqual([
      { workspaceId: ws.id, workspaceName: "Synthetic id", role: "reviewer", isSandbox: false },
    ]);

    const me = await call(app, "/api/v1/me", { headers: { cookie: `__Host-4x35_session=${id}` } });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { csrfToken: string };
    expect(meBody.csrfToken).toBe(body.csrfToken);
    const row = await identityRepository(t.db).findLiveSession(
      hashSessionId(id, AUTH.sessionSecret),
    );
    expect(row && csrfValid(AUTH.csrfSecret, row.csrfSecret, meBody.csrfToken)).toBe(true);
  });

  it("the cookie drops Secure only when NODE_ENV=development", async () => {
    const { createApp } = await import("../src/app.js");
    const dev = createApp(
      { version: "0", commit: "t" },
      { db: t.db, auth: { ...AUTH, secureCookie: false } },
    );
    const res = await call(dev, "/api/v1/auth/login", {
      method: "POST",
      body: { email: ws.reviewer.email, password: PASSWORD },
    });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie()[0]).not.toContain("Secure");
    const { authConfig, readEnv } = await import("../src/env.js");
    const keys = { SESSION_SECRET: AUTH.sessionSecret, CSRF_SECRET: AUTH.csrfSecret };
    expect(authConfig(readEnv({ ...keys, NODE_ENV: "development" })).secureCookie).toBe(false);
    expect(authConfig(readEnv({ ...keys, NODE_ENV: "test" })).secureCookie).toBe(true);
    expect(authConfig(readEnv({ ...keys, NODE_ENV: "production" })).secureCookie).toBe(true);
    expect(() => authConfig(readEnv({}))).toThrow(
      "invalid environment: SESSION_SECRET, CSRF_SECRET not set",
    );
  });

  it("logout deletes the session row; the old cookie is then anonymous (401)", async () => {
    const s = await sessionFor(t.db, ws.reviewer.id);
    const res = await call(app, "/api/v1/auth/logout", { method: "POST", session: s });
    expect(res.status).toBe(204);
    expect(
      await identityRepository(t.db).findLiveSession(hashSessionId(s.id, AUTH.sessionSecret)),
    ).toBeUndefined();
    expect((await call(app, "/api/v1/me", { session: s })).status).toBe(401);
  });

  it("sessions expire after 12 h idle and 7 d absolute; use slides the idle deadline", async () => {
    const created = new Date("2026-11-27T08:00:00.000Z");
    expect(idleDeadline(created, created).getTime() - created.getTime()).toBe(IDLE_MS);
    const late = new Date(created.getTime() + ABSOLUTE_MS - 3_600_000);
    expect(idleDeadline(created, late).getTime()).toBe(created.getTime() + ABSOLUTE_MS);

    // Idle: a session whose deadline passed is anonymous.
    const idle = await sessionFor(t.db, ws.reviewer.id);
    await t.pool.query(
      "update sessions set expires_at = now() - interval '1 second' where id_hash = $1",
      [hashSessionId(idle.id, AUTH.sessionSecret)],
    );
    expect((await call(app, "/api/v1/me", { session: idle })).status).toBe(401);

    // Absolute: used every 11 h, it still ends 7 d after creation.
    const used = await sessionFor(t.db, ws.reviewer.id);
    const h = hashSessionId(used.id, AUTH.sessionSecret);
    await t.pool.query(
      "update sessions set created_at = now() - interval '7 days' + interval '30 minutes', expires_at = now() + interval '20 minutes' where id_hash = $1",
      [h],
    );
    const slid = await validateSession(t.db, AUTH, used.id);
    expect(slid).not.toBeNull();
    const cap = (slid?.createdAt.getTime() ?? 0) + ABSOLUTE_MS;
    expect(slid?.expiresAt.getTime()).toBe(cap); // slid from +20 min to the cap, not to +12 h
    expect(await validateSession(t.db, AUTH, used.id, new Date(cap - 1000))).not.toBeNull();
    expect(await validateSession(t.db, AUTH, used.id, new Date(cap + 1))).toBeNull();

    // Sliding: a fresh session's deadline moves forward on use.
    const fresh = await sessionFor(t.db, ws.reviewer.id);
    const fh = hashSessionId(fresh.id, AUTH.sessionSecret);
    await t.pool.query(
      "update sessions set expires_at = now() + interval '2 hours' where id_hash = $1",
      [fh],
    );
    expect((await call(app, "/api/v1/me", { session: fresh })).status).toBe(200);
    const row = await identityRepository(t.db).findLiveSession(fh);
    expect((row?.expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(IDLE_MS - 60_000);
  });

  // ---- invites and resets (AC 4, AC 5) --------------------------------------------------------

  const invite = async (owner: TestSession, workspaceId: string, to: string, role = "reviewer") => {
    const res = await call(app, `/api/v1/workspaces/${workspaceId}/invites`, {
      method: "POST",
      session: owner,
      body: { email: to, role },
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { id: string; token: string; expiresAt: string };
  };

  it("AC 4: an invite token works once; a second accept is 410; an expired invite is 410", async () => {
    const owner = await sessionFor(t.db, ws.owner.id);
    const to = email("invitee");
    const inv = await invite(owner, ws.id, to);
    expect(new Date(inv.expiresAt).getTime() - Date.now()).toBeGreaterThan(72 * 3_600_000 - 60_000);

    const weak = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: inv.token, password: "short" },
    });
    expect(weak.status).toBe(422); // and the token is not used up
    const first = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: inv.token, password: PASSWORD },
    });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ workspaceId: ws.id, role: "reviewer" });
    const again = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: inv.token, password: PASSWORD },
    });
    expect(again.status).toBe(410);
    expect(again.headers.get("content-type")).toBe("application/problem+json");
    const login = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: to, password: PASSWORD },
    });
    expect(login.status).toBe(200);

    const late = await invite(owner, ws.id, email("late"));
    await t.pool.query(
      "update invites set expires_at = now() - interval '1 second' where token_hash = $1",
      [hashToken(late.token)],
    );
    const expired = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: late.token, password: PASSWORD },
    });
    expect(expired.status).toBe(410);
    const unknown = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: randomBytes(32).toString("base64url"), password: PASSWORD },
    });
    expect(unknown.status).toBe(410);
  });

  it("an invite for an existing account needs that account's password (no takeover by token)", async () => {
    const other = await seedWorkspace(t.db, "other");
    const owner = await sessionFor(t.db, other.owner.id);
    const inv = await invite(owner, other.id, ws.reviewer.email);
    const wrong = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: inv.token, password: "attacker chosen 123" },
    });
    expect(wrong.status).toBe(401);
    const right = await call(app, "/api/v1/invites/accept", {
      method: "POST",
      body: { token: inv.token, password: PASSWORD },
    });
    expect(right.status).toBe(200);
    const already = await call(app, `/api/v1/workspaces/${other.id}/invites`, {
      method: "POST",
      session: owner,
      body: { email: ws.reviewer.email, role: "reviewer" },
    });
    expect(already.status).toBe(409);
  });

  it("AC 4: a reset link works once and ends every existing session of that user", async () => {
    const member = await addMember(t.db, ws.id, "resettable", "reviewer");
    const s1 = await sessionFor(t.db, member.id);
    const s2 = await sessionFor(t.db, member.id);
    expect(await sessionsOf(member.id)).toBe(2);
    const owner = await sessionFor(t.db, ws.owner.id);
    const link = await call(app, `/api/v1/workspaces/${ws.id}/members/${member.id}/reset-link`, {
      method: "POST",
      session: owner,
    });
    expect(link.status).toBe(201);
    const { token, expiresAt } = (await link.json()) as { token: string; expiresAt: string };
    expect(new Date(expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);
    const next = "a brand new synthetic pass";
    const used = await call(app, "/api/v1/password-reset", {
      method: "POST",
      body: { token, password: next },
    });
    expect(used.status).toBe(204);
    expect(await sessionsOf(member.id)).toBe(0);
    expect((await call(app, "/api/v1/me", { session: s1 })).status).toBe(401);
    expect((await call(app, "/api/v1/me", { session: s2 })).status).toBe(401);
    const twice = await call(app, "/api/v1/password-reset", {
      method: "POST",
      body: { token, password: "another synthetic pass" },
    });
    expect(twice.status).toBe(410);
    const login = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: member.email, password: next },
    });
    expect(login.status).toBe(200);
  });

  it("an expired reset link is 410; a reset link for a non-member is 404", async () => {
    const member = await addMember(t.db, ws.id, "expiring", "reviewer");
    const owner = await sessionFor(t.db, ws.owner.id);
    const link = await call(app, `/api/v1/workspaces/${ws.id}/members/${member.id}/reset-link`, {
      method: "POST",
      session: owner,
    });
    const { token } = (await link.json()) as { token: string };
    await t.pool.query(
      "update password_resets set expires_at = now() - interval '1 second' where token_hash = $1",
      [hashToken(token)],
    );
    expect(
      (
        await call(app, "/api/v1/password-reset", {
          method: "POST",
          body: { token, password: PASSWORD },
        })
      ).status,
    ).toBe(410);
    const outsider = await seedUser(t.db, "outsider");
    const res = await call(app, `/api/v1/workspaces/${ws.id}/members/${outsider.id}/reset-link`, {
      method: "POST",
      session: owner,
    });
    expect(res.status).toBe(404);
  });

  it("role change: an owner changes a member's role; the last owner cannot be demoted (409)", async () => {
    const own = await seedWorkspace(t.db, "roles");
    const owner = await sessionFor(t.db, own.owner.id);
    const up = await call(app, `/api/v1/workspaces/${own.id}/members/${own.reviewer.id}`, {
      method: "PATCH",
      session: owner,
      body: { role: "owner" },
    });
    expect(up.status).toBe(200);
    expect(
      (await forWorkspace({ workspaceId: own.id }, t.db).memberships.get(own.reviewer.id))?.role,
    ).toBe("owner");
    const down = await call(app, `/api/v1/workspaces/${own.id}/members/${own.reviewer.id}`, {
      method: "PATCH",
      session: owner,
      body: { role: "reviewer" },
    });
    expect(down.status).toBe(200);
    const last = await call(app, `/api/v1/workspaces/${own.id}/members/${own.owner.id}`, {
      method: "PATCH",
      session: owner,
      body: { role: "reviewer" },
    });
    expect(last.status).toBe(409);
  });

  it("role change: two owners demoting each other at once leave exactly one owner (BL-01 7213444161)", async () => {
    for (let round = 0; round < 5; round++) {
      const w = await seedWorkspace(t.db, `race-${round}`);
      await forWorkspace({ workspaceId: w.id }, t.db).memberships.setRole(w.reviewer.id, "owner");
      const [s1, s2] = await Promise.all([
        sessionFor(t.db, w.owner.id),
        sessionFor(t.db, w.reviewer.id),
      ]);
      const demote = (s: TestSession, target: string) =>
        call(app, `/api/v1/workspaces/${w.id}/members/${target}`, {
          method: "PATCH",
          session: s,
          body: { role: "reviewer" },
        });
      const statuses = (await Promise.all([demote(s1, w.reviewer.id), demote(s2, w.owner.id)])).map(
        (r) => r.status,
      );
      expect(statuses.sort()).toEqual([200, 409]);
      const owners = (await forWorkspace({ workspaceId: w.id }, t.db).memberships.list()).filter(
        (m) => m.role === "owner",
      );
      expect(owners).toHaveLength(1);
    }
  });

  it("AC 5: the sessions, invites and password_resets tables hold only hashes: no raw cookie or token anywhere in the database", async () => {
    const owner = await sessionFor(t.db, ws.owner.id);
    const login = await call(app, "/api/v1/auth/login", {
      method: "POST",
      body: { email: ws.owner.email, password: PASSWORD },
    });
    const cookie = sessionCookieOf(login) ?? "";
    expect(cookie).toHaveLength(43);
    const inv = await invite(owner, ws.id, email("dump"), "reviewer");
    // With an Idempotency-Key too: the invite response (it carries the token) is never stored.
    const keyed = await call(app, `/api/v1/workspaces/${ws.id}/invites`, {
      method: "POST",
      session: owner,
      body: { email: email("keyed"), role: "reviewer" },
      headers: { "Idempotency-Key": randomUUID() },
    });
    const keyedToken = ((await keyed.json()) as { token: string }).token;
    const member = await addMember(t.db, ws.id, "dump-reset", "reviewer");
    const reset = (await (
      await call(app, `/api/v1/workspaces/${ws.id}/members/${member.id}/reset-link`, {
        method: "POST",
        session: owner,
        headers: { "Idempotency-Key": randomUUID() },
      })
    ).json()) as { token: string };
    const secrets = {
      cookie,
      sessionCookie: owner.id,
      invite: inv.token,
      keyedToken,
      reset: reset.token,
    };

    const tables = (
      await t.pool.query<{ t: string }>(
        "select tablename as t from pg_tables where schemaname = 'public' order by 1",
      )
    ).rows.map((r) => r.t);
    expect(tables).toEqual(
      expect.arrayContaining(["sessions", "invites", "password_resets", "idempotency_keys"]),
    );
    let dump = "";
    for (const table of tables) {
      const rows = await t.db.execute<{ j: string }>(
        sql`select row_to_json(x)::text as j from ${sql.identifier(table)} x`,
      );
      dump += rows.rows.map((r) => r.j).join("\n");
    }
    expect(dump.length).toBeGreaterThan(1000);
    for (const [name, secret] of Object.entries(secrets)) {
      expect(dump.includes(secret), name).toBe(false);
    }
    // What is stored instead: the keyed hash and the SHA-256.
    expect(dump).toContain(hashSessionId(cookie, AUTH.sessionSecret));
    expect(dump).toContain(hashToken(inv.token));
  });

  // ---- P2 P-csrf-required (AC 3) ---------------------------------------------------------------

  /** Every non-GET route that needs a session, from the matrix itself. */
  const csrfRoutes = Object.entries(AUTHZ_MATRIX).filter(
    ([key, cls]) => cls.access !== "public" && !SAFE_METHODS.has(key.split(" ")[0] ?? ""),
  );

  /** A request that the route accepts for `owner` in `w`: fresh targets every call. */
  const validRequest = async (key: string, w: SeededWorkspace) => {
    const [method = "", template = ""] = key.split(" ");
    const target = await addMember(t.db, w.id, "csrf-target", "reviewer");
    const path = template.replace("{id}", w.id).replace("{userId}", target.id);
    const bodies: Record<string, unknown> = {
      "POST /api/v1/workspaces/{id}/invites": { email: email("csrf-invitee"), role: "reviewer" },
      "PATCH /api/v1/workspaces/{id}/members/{userId}": { role: "reviewer" },
    };
    return { method, path, body: bodies[key] };
  };

  const csrfHeader = (valid: string, otherValid: string) =>
    fc.oneof(
      fc.constant(null), // absent
      fc.constant(""),
      fc.constant(otherValid), // another session's valid token
      fc.constant(valid.toUpperCase()),
      fc.constant(`${valid}=`),
      fc
        .integer({ min: 0, max: valid.length - 1 })
        .map((i) => `${valid.slice(0, i)}${valid[i] === "A" ? "B" : "A"}${valid.slice(i + 1)}`),
      fc.constant(valid.slice(0, -1)),
    );

  const csrfProperty = (subject: App) =>
    fc.asyncProperty(
      fc.constantFrom(...csrfRoutes.map(([k]) => k)),
      fc.nat(),
      async (key, seed) => {
        const owner = await sessionFor(t.db, ws.owner.id);
        const other = await sessionFor(t.db, ws.reviewer.id);
        const bad = fc.sample(csrfHeader(owner.csrf, other.csrf), { numRuns: 1, seed })[0] ?? null;
        const r = await validRequest(key, ws);
        const without = await call(subject, r.path, {
          method: r.method,
          session: owner,
          csrf: bad,
          ...(r.body === undefined ? {} : { body: r.body }),
        });
        if (without.status !== 403) {
          throw new Error(
            `${key} with X-CSRF-Token ${JSON.stringify(bad)} answered ${without.status}`,
          );
        }
        const withToken = await call(subject, r.path, {
          method: r.method,
          session: owner,
          ...(r.body === undefined ? {} : { body: r.body }),
        });
        if (withToken.status < 200 || withToken.status > 299) {
          throw new Error(`${key} with a valid X-CSRF-Token answered ${withToken.status}`);
        }
      },
    );

  it(`P2 P-csrf-required: every non-GET session route is 403 without a valid X-CSRF-Token and succeeds with one (${P2_RUNS} runs)`, async () => {
    expect(csrfRoutes.map(([k]) => k).sort()).toEqual([
      "PATCH /api/v1/workspaces/{id}/members/{userId}",
      "POST /api/v1/auth/logout",
      "POST /api/v1/workspaces/{id}/invites",
      "POST /api/v1/workspaces/{id}/members/{userId}/reset-link",
    ]);
    await fc.assert(csrfProperty(app), { numRuns: P2_RUNS });
  });

  it("P2 P-csrf-required catches a planted bug: CSRF checked on POST only", async () => {
    // The same app, but the session step checks the token only for POST (PATCH slips through).
    const planted = new OpenAPIHono<AppEnv>({
      defaultHook: (result, c) => {
        if (!result.success) return problem(c, 400);
      },
    });
    planted.use("*", requestLogging(silentLogger()));
    planted.use("*", session({ db: t.db, auth: AUTH }));
    const ws404 = workspaceContext(t.db);
    const owner = requireRole("owner");
    planted.use("*", async (c, next) => {
      const cls = Object.entries(AUTHZ_MATRIX).find(([k]) => {
        const [m, p = ""] = k.split(" ");
        const re = new RegExp(`^${p.replace(/\{[^}]+\}/g, "[^/]+")}$`);
        return m === c.req.method && re.test(c.req.path);
      })?.[1];
      if (!cls || cls.access === "public") return next();
      const s = c.get("session");
      if (!s) return problem(c, 401);
      if (
        c.req.method === "POST" &&
        !csrfValid(AUTH.csrfSecret, s.csrfSecret, c.req.header(CSRF_HEADER))
      ) {
        return problem(c, 403);
      }
      const steps = [...(cls.workspace ? [ws404] : []), ...(cls.access === "owner" ? [owner] : [])];
      for (const step of steps) {
        let passed = false;
        const answer = await step(c as never, async () => {
          passed = true;
        });
        if (!passed) return answer as Response;
      }
      await next();
    });
    registerIdentityRoutes(planted, { db: t.db, auth: AUTH });
    const out = await fc.check(csrfProperty(planted), { numRuns: P2_RUNS, seed: 4242 });
    expect(out.failed).toBe(true);
    console.log(
      `P-csrf-required planted bug caught: seed ${out.seed}, counterexample ${JSON.stringify(out.counterexample)}`,
    );
  });

  // ---- BL-01 7190154093: auth before idempotency ------------------------------------------------

  it("an authenticated POST with an Idempotency-Key is replayed (auth sets the workspace before idempotency runs)", async () => {
    // A test-only workspace POST route, classified owner in an extended matrix.
    const key = "POST /api/v1/workspaces/{id}/echo";
    const matrix: Record<string, RouteClass> = {
      ...AUTHZ_MATRIX,
      [key]: { access: "owner", workspace: true },
    };
    const echo = new OpenAPIHono<AppEnv>();
    echo.use("*", requestLogging(silentLogger()));
    echo.use("*", session({ db: t.db, auth: AUTH }));
    echo.use("*", authorize({ db: t.db, auth: AUTH }, matrix));
    echo.use("*", idempotency({ db: t.db, optOut: IDENTITY_IDEMPOTENCY_OPT_OUT }));
    let runs = 0;
    echo.post("/api/v1/workspaces/:id/echo", (c) => {
      runs++;
      return c.json({ runs, workspaceId: c.var.workspaceId }, 201);
    });
    const owner = await sessionFor(t.db, ws.owner.id);
    const k = randomUUID();
    const send = () =>
      call(echo, `/api/v1/workspaces/${ws.id}/echo`, {
        method: "POST",
        session: owner,
        body: { a: 1 },
        headers: { "Idempotency-Key": k },
      });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get(REPLAYED_HEADER)).toBe("true");
    expect(await second.json()).toEqual({ runs: 1, workspaceId: ws.id });
    expect(runs).toBe(1);
    expect(await forWorkspace({ workspaceId: ws.id }, t.db).idempotencyKeys.get(k)).toBeDefined();

    // The identity routes that hand out tokens are opted out: no stored replay for them.
    const inv = await call(app, `/api/v1/workspaces/${ws.id}/invites`, {
      method: "POST",
      session: owner,
      body: { email: email("opt-out"), role: "reviewer" },
      headers: { "Idempotency-Key": k.replace(/.$/, "0") },
    });
    expect(inv.status).toBe(201);
    expect(
      await forWorkspace({ workspaceId: ws.id }, t.db).idempotencyKeys.get(k.replace(/.$/, "0")),
    ).toBeUndefined();
  });

  // ---- AC 7: bootstrap:admin ------------------------------------------------------------------

  it("AC 7: bootstrap:admin run twice creates one workspace and one pending owner invite", async () => {
    const fresh = await createTestDatabase("bootstrap", { migrate: true });
    try {
      const admin = email("bootstrap-admin");
      const first = await bootstrapAdmin(fresh.db, {
        email: admin,
        baseUrl: "https://app.example.test/",
      });
      const second = await bootstrapAdmin(fresh.db, {
        email: admin,
        baseUrl: "https://app.example.test",
      });
      expect(first.kind).toBe("invited");
      expect(second.kind).toBe("pending");
      if (first.kind !== "invited") throw new Error("expected an invite");
      expect(first.url).toMatch(/^https:\/\/app\.example\.test\/invite#token=[A-Za-z0-9_-]{43}$/);
      expect(first.url).not.toContain(admin);
      const counts = await fresh.pool.query<{ w: number; i: number }>(
        "select (select count(*)::int from workspaces) as w, (select count(*)::int from invites where used_at is null and expires_at > now() and role = 'owner') as i",
      );
      expect(counts.rows[0]).toEqual({ w: 1, i: 1 });
      // Accepting the printed link makes the owner; a third run then changes nothing.
      const token = first.url.split("#token=")[1] ?? "";
      const local = testApp(fresh.db, fresh.pool);
      const ok = await call(local, "/api/v1/invites/accept", {
        method: "POST",
        body: { token, password: PASSWORD },
      });
      expect(ok.status).toBe(200);
      expect((await ok.json()) as unknown).toMatchObject({ role: "owner" });
      expect((await bootstrapAdmin(fresh.db, { email: admin })).kind).toBe("owner_exists");
      const after = await fresh.pool.query<{ w: number; i: number }>(
        "select (select count(*)::int from workspaces) as w, (select count(*)::int from invites) as i",
      );
      expect(after.rows[0]).toEqual({ w: 1, i: 1 });
    } finally {
      await fresh.dropAndClose();
    }
  });

  it("bootstrap:admin runs concurrently without creating two workspaces", async () => {
    const fresh = await createTestDatabase("bootstrap-race", { migrate: true });
    try {
      const admin = email("race-admin");
      const results = await Promise.all(
        [1, 2, 3].map(() => bootstrapAdmin(fresh.db, { email: admin })),
      );
      expect(results.filter((r) => r.kind === "invited")).toHaveLength(1);
      const n = await fresh.pool.query<{ w: number; i: number }>(
        "select (select count(*)::int from workspaces) as w, (select count(*)::int from invites) as i",
      );
      expect(n.rows[0]).toEqual({ w: 1, i: 1 });
    } finally {
      await fresh.dropAndClose();
    }
  });
});
