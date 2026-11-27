// Workspace context (M1-03): the workspace comes from the path (`/workspaces/{id}/…`) and must be one
// of the session user's memberships. Anything else (not a member, no such workspace, a malformed id)
// answers the same 404, so a caller cannot tell another workspace exists.
import { type Database, forWorkspace } from "@4x35/db";
import type { MiddlewareHandler } from "hono";
import { problem } from "./problem.js";
import type { AuthEnv } from "./session.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The `{id}` after `/workspaces/` in a request path, if any. */
export function workspaceIdFromPath(path: string): string | undefined {
  const m = /\/workspaces\/([^/]+)/.exec(path);
  return m?.[1];
}

/**
 * Sets `workspaceId` and `role` from the path's workspace and the user's membership; 404 otherwise.
 * Runs after `requireSession`.
 */
export function workspaceContext(db: Database): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const userId = c.get("userId");
    const workspaceId = workspaceIdFromPath(c.req.path);
    if (userId === undefined || workspaceId === undefined || !UUID.test(workspaceId)) {
      return problem(c, 404, "No such workspace.");
    }
    const membership = await forWorkspace({ workspaceId }, db).memberships.get(userId);
    if (!membership) return problem(c, 404, "No such workspace.");
    c.set("workspaceId", workspaceId.toLowerCase());
    c.set("role", membership.role === "owner" ? "owner" : "reviewer");
    await next();
  };
}
