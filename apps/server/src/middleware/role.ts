// Roles (ADR 0013, M1-03): `owner` includes every reviewer right; `reviewer` is the lower role.
// Runs after `workspaceContext`, which sets the caller's role in the path's workspace.
import type { MembershipRole } from "@4x35/core";
import type { MiddlewareHandler } from "hono";
import { problem } from "./problem.js";
import type { AuthEnv } from "./session.js";

const RANK: Readonly<Record<MembershipRole, number>> = { reviewer: 1, owner: 2 };

/** True when `actual` carries the rights of `needed`. */
export function roleAllows(actual: MembershipRole | undefined, needed: MembershipRole): boolean {
  return actual !== undefined && RANK[actual] >= RANK[needed];
}

/** 403 unless the caller's role in the workspace is `needed` or higher. */
export function requireRole(needed: MembershipRole): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    if (!roleAllows(c.get("role"), needed)) {
      return problem(c, 403, "Your role in this workspace does not allow this.");
    }
    await next();
  };
}
