// Session authentication (M1-03).
//   session(deps)   reads `__Host-4x35_session`, sets `session` and `userId` for a live session
//   requireSession  401 without a session; 403 on a non-GET request without a valid X-CSRF-Token
import type { MembershipRole } from "@4x35/core";
import type { Database, SessionRow } from "@4x35/db";
import type { MiddlewareHandler } from "hono";
import { CSRF_HEADER, csrfValid, SAFE_METHODS } from "../identity/csrf.js";
import { readSessionCookie, type SessionConfig, validateSession } from "../identity/sessions.js";
import { problem } from "./problem.js";

/** Variables the auth middleware sets. `userId`/`workspaceId` also feed the request log (M1-05). */
export interface AuthEnv {
  Variables: {
    session?: SessionRow;
    userId?: string;
    workspaceId?: string;
    role?: MembershipRole;
  };
}

export interface AuthConfig extends SessionConfig {
  /** `CSRF_SECRET`: keys the per-session CSRF token. */
  readonly csrfSecret: string;
}

export interface SessionDeps {
  readonly db: Database;
  readonly auth: AuthConfig;
}

/** Resolves the session cookie, if any. Never rejects: routes decide whether a session is needed. */
export function session(deps: SessionDeps): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const id = readSessionCookie(c);
    if (id !== undefined && id !== "") {
      const row = await validateSession(deps.db, deps.auth, id);
      if (row) {
        c.set("session", row);
        c.set("userId", row.userId);
      }
    }
    await next();
  };
}

/** 401 without a session; 403 for a state-changing request without a valid CSRF token. */
export function requireSession(auth: AuthConfig): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const s = c.get("session");
    if (!s) return problem(c, 401, "Sign in to continue.");
    if (
      !SAFE_METHODS.has(c.req.method) &&
      !csrfValid(auth.csrfSecret, s.csrfSecret, c.req.header(CSRF_HEADER))
    ) {
      return problem(c, 403, "Missing or invalid CSRF token.");
    }
    await next();
  };
}
