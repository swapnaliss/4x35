// Identity endpoints under /api/v1 (ADR 0013, M1-03), registered with @hono/zod-openapi so the
// OpenAPI document lists every route (the authz matrix test enumerates it). Who may call each route
// is decided before the handler runs, by `authorize` from `authz/matrix.ts`; handlers read the
// caller from `c.var` and never trust an id from the body.
import { MEMBERSHIP_ROLES } from "@4x35/core";
import { type Database, forWorkspace, identityRepository, withTx } from "@4x35/db";
import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import type { AppEnv } from "../app.js";
import { type ProblemStatus, problem, problemBody } from "../middleware/problem.js";
import type { AuthConfig } from "../middleware/session.js";
import { csrfToken } from "./csrf.js";
import { acceptInvite, issueInvite, issueReset, redeemReset } from "./invites.js";
import { burnVerify, MIN_PASSWORD_LENGTH, verifyPassword } from "./passwords.js";
import {
  clearSessionCookie,
  createSession,
  hashSessionId,
  readSessionCookie,
  setSessionCookie,
} from "./sessions.js";

export const API_PREFIX = "/api/v1";

export interface IdentityDeps {
  readonly db: Database;
  readonly auth: AuthConfig;
}

// ---- schemas ----------------------------------------------------------------------------------

const Email = z.string().trim().min(3).max(320).openapi({ example: "reviewer@example.test" });
const Password = z.string().min(1).max(1024);
const Token = z.string().min(1).max(256);
const Role = z.enum(MEMBERSHIP_ROLES);
const Uuid = z.uuid();

const ProblemSchema = z
  .object({
    type: z.literal("about:blank"),
    title: z.string(),
    status: z.number().int(),
    detail: z.string().optional(),
  })
  .openapi("Problem");

const MeSchema = z
  .object({
    user: z.object({ id: Uuid, email: z.string() }),
    memberships: z.array(
      z.object({
        workspaceId: Uuid,
        workspaceName: z.string(),
        role: Role,
        isSandbox: z.boolean(),
      }),
    ),
    csrfToken: z.string(),
  })
  .openapi("Me");

const IssuedTokenSchema = z
  .object({ id: Uuid, token: z.string(), expiresAt: z.string() })
  .openapi("IssuedToken");

type ProblemResponses<S extends ProblemStatus> = {
  [K in S]: {
    description: string;
    content: { "application/problem+json": { schema: typeof ProblemSchema } };
  };
};

function problems<S extends ProblemStatus>(...statuses: S[]): ProblemResponses<S> {
  return Object.fromEntries(
    statuses.map((s) => [
      s,
      {
        description: problemBody(s).title,
        content: { "application/problem+json": { schema: ProblemSchema } },
      },
    ]),
  ) as ProblemResponses<S>;
}

const json = <T extends z.ZodType>(schema: T) => ({
  content: { "application/json": { schema } },
  required: true as const,
});

// ---- routes -----------------------------------------------------------------------------------

const login = createRoute({
  method: "post",
  path: `${API_PREFIX}/auth/login`,
  summary: "Sign in with email and password; sets the session cookie",
  request: { body: json(z.object({ email: Email, password: Password })) },
  responses: {
    200: { description: "Signed in", content: { "application/json": { schema: MeSchema } } },
    ...problems(400, 401),
  },
});

const logout = createRoute({
  method: "post",
  path: `${API_PREFIX}/auth/logout`,
  summary: "End this session",
  responses: { 204: { description: "Signed out" }, ...problems(401, 403) },
});

const me = createRoute({
  method: "get",
  path: `${API_PREFIX}/me`,
  summary: "The signed-in user, memberships and the CSRF token",
  responses: {
    200: { description: "Me", content: { "application/json": { schema: MeSchema } } },
    ...problems(401),
  },
});

const createInvite = createRoute({
  method: "post",
  path: `${API_PREFIX}/workspaces/{id}/invites`,
  summary: "Invite someone to the workspace (owner); returns the one-time token, valid 72 h",
  request: {
    params: z.object({ id: Uuid }),
    body: json(z.object({ email: Email, role: Role })),
  },
  responses: {
    201: {
      description: "Invite issued",
      content: { "application/json": { schema: IssuedTokenSchema } },
    },
    ...problems(400, 401, 403, 404, 409),
  },
});

const accept = createRoute({
  method: "post",
  path: `${API_PREFIX}/invites/accept`,
  summary: "Use an invite token: set a password (new user) or prove it (existing user)",
  request: { body: json(z.object({ token: Token, password: Password })) },
  responses: {
    200: {
      description: "Joined",
      content: {
        "application/json": { schema: z.object({ workspaceId: Uuid, role: Role }) },
      },
    },
    ...problems(400, 401, 410, 422),
  },
});

const resetLink = createRoute({
  method: "post",
  path: `${API_PREFIX}/workspaces/{id}/members/{userId}/reset-link`,
  summary: "Issue a one-time password reset link for a member (owner), valid 1 h",
  request: { params: z.object({ id: Uuid, userId: Uuid }) },
  responses: {
    201: {
      description: "Reset link issued",
      content: { "application/json": { schema: IssuedTokenSchema } },
    },
    ...problems(401, 403, 404),
  },
});

const passwordReset = createRoute({
  method: "post",
  path: `${API_PREFIX}/password-reset`,
  summary: "Use a reset token: set a new password and end every session of the user",
  request: { body: json(z.object({ token: Token, password: Password })) },
  responses: { 204: { description: "Password changed" }, ...problems(400, 410, 422) },
});

const setRole = createRoute({
  method: "patch",
  path: `${API_PREFIX}/workspaces/{id}/members/{userId}`,
  summary: "Change a member's role (owner)",
  request: {
    params: z.object({ id: Uuid, userId: Uuid }),
    body: json(z.object({ role: Role })),
  },
  responses: {
    200: {
      description: "Role changed",
      content: { "application/json": { schema: z.object({ userId: Uuid, role: Role }) } },
    },
    ...problems(400, 401, 403, 404, 409),
  },
});

// ---- handlers ---------------------------------------------------------------------------------

/** The one body for every failed sign-in: unknown email, wrong password, no password set yet. */
export const LOGIN_FAILED = "Email or password is incorrect.";
const WEAK_PASSWORD = `Use at least ${MIN_PASSWORD_LENGTH} characters, and not your email address.`;

type App = OpenAPIHono<AppEnv>;

async function meBody(db: Database, auth: AuthConfig, userId: string, csrfSecret: string) {
  const identity = identityRepository(db);
  const user = await identity.getUser(userId);
  if (!user) return undefined;
  return {
    user: { id: user.id, email: user.email },
    memberships: await identity.membershipsOf(user.id),
    csrfToken: csrfToken(auth.csrfSecret, csrfSecret),
  };
}

/** Registers the identity routes. `authorize` must already be installed on the app. */
export function registerIdentityRoutes(app: App, deps: IdentityDeps): void {
  const { db, auth } = deps;

  app.openapi(login, async (c) => {
    const { email, password } = c.req.valid("json");
    const user = await identityRepository(db).findUserByEmail(email);
    let ok = false;
    if (user?.passwordHash != null) {
      ok = await verifyPassword(user.passwordHash, password);
    } else {
      // Unknown email (or no password yet): the same argon2id work, then the same answer.
      await burnVerify(password);
    }
    if (!ok || !user) return problem(c, 401, LOGIN_FAILED);

    // Rotation: a session presented with the sign-in is ended, and a new id is issued.
    const presented = readSessionCookie(c);
    const created = await withTx(db, async (tx) => {
      if (presented) {
        await identityRepository(tx).deleteSession(hashSessionId(presented, auth.sessionSecret));
      }
      return createSession(tx, auth, user.id);
    });
    setSessionCookie(c, auth, created.id);
    c.set("userId", user.id);
    const body = await meBody(db, auth, user.id, created.row.csrfSecret);
    if (!body) return problem(c, 401, LOGIN_FAILED);
    return c.json(body, 200);
  });

  app.openapi(logout, async (c) => {
    const s = c.get("session");
    if (s) await identityRepository(db).deleteSession(s.idHash);
    clearSessionCookie(c, auth);
    return c.body(null, 204);
  });

  app.openapi(me, async (c) => {
    const s = c.get("session");
    const body = s && (await meBody(db, auth, s.userId, s.csrfSecret));
    if (!body) return problem(c, 401, "Sign in to continue.");
    return c.json(body, 200);
  });

  app.openapi(createInvite, async (c) => {
    const workspaceId = callerWorkspace(c);
    const { email, role } = c.req.valid("json");
    const r = await issueInvite(db, workspaceId, email, role);
    if (r.kind === "already_member") return problem(c, 409, "That person is already a member.");
    return c.json({ id: r.id, token: r.token, expiresAt: r.expiresAt.toISOString() }, 201);
  });

  app.openapi(accept, async (c) => {
    const { token, password } = c.req.valid("json");
    const r = await acceptInvite(db, token, password);
    switch (r.kind) {
      case "gone":
        return problem(c, 410, "This invite link was already used or has expired.");
      case "weak_password":
        return problem(c, 422, WEAK_PASSWORD);
      case "wrong_password":
        return problem(c, 401, LOGIN_FAILED);
      case "accepted":
        return c.json({ workspaceId: r.workspaceId, role: r.role }, 200);
    }
  });

  app.openapi(resetLink, async (c) => {
    const workspaceId = callerWorkspace(c);
    const { userId } = c.req.valid("param");
    const r = await issueReset(db, workspaceId, userId);
    if (r.kind === "not_member") return problem(c, 404, "No such member.");
    return c.json({ id: r.id, token: r.token, expiresAt: r.expiresAt.toISOString() }, 201);
  });

  app.openapi(passwordReset, async (c) => {
    const { token, password } = c.req.valid("json");
    const r = await redeemReset(db, token, password);
    if (r.kind === "gone")
      return problem(c, 410, "This reset link was already used or has expired.");
    if (r.kind === "weak_password") return problem(c, 422, WEAK_PASSWORD);
    clearSessionCookie(c, auth);
    return c.body(null, 204);
  });

  app.openapi(setRole, async (c) => {
    const workspaceId = callerWorkspace(c);
    const { userId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const r = await withTx(db, async (tx) => {
      const members = forWorkspace({ workspaceId }, tx).memberships;
      // Lock the owner rows first, so two concurrent demotions cannot both see "another owner
      // remains" (BL-01 7213444161).
      const owners = await members.lockOwners();
      const current = await members.get(userId);
      if (!current) return "not_member" as const;
      if (current.role === "owner" && role !== "owner" && owners.length <= 1) {
        return "last_owner" as const;
      }
      await members.setRole(userId, role);
      return "ok" as const;
    });
    if (r === "not_member") return problem(c, 404, "No such member.");
    if (r === "last_owner") return problem(c, 409, "A workspace needs at least one owner.");
    return c.json({ userId, role }, 200);
  });
}

/** The workspace `authorize` resolved from the path; never one from the body. */
function callerWorkspace(c: { var: { workspaceId?: string } }): string {
  const ws = c.var.workspaceId;
  if (ws === undefined) throw new Error("workspace route reached without workspaceContext");
  return ws;
}
