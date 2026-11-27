// Request-time enforcement of the authZ matrix (M1-03). Runs once per request, before idempotency and
// the route: it finds the route Hono matched, looks it up in AUTHZ_MATRIX, and applies
// requireSession → workspaceContext → requireRole as the class demands. Fail closed: a matched
// route with no matrix entry answers 404 (and the matrix test fails).
import type { Database } from "@4x35/db";
import type { Context, MiddlewareHandler } from "hono";
import { matchedRoutes } from "hono/route";
import { problem } from "../middleware/problem.js";
import { requireRole } from "../middleware/role.js";
import { type AuthConfig, type AuthEnv, requireSession } from "../middleware/session.js";
import { workspaceContext } from "../middleware/workspace.js";
import { AUTHZ_MATRIX, type RouteClass, routeKey } from "./matrix.js";

export interface AuthorizeDeps {
  readonly db: Database;
  readonly auth: AuthConfig;
}

/** The handler route Hono matched (middleware routes are method `ALL`), if any. */
function handlerRoute(c: Context): { method: string; path: string } | undefined {
  return matchedRoutes(c)
    .filter((r) => r.method !== "ALL")
    .at(-1);
}

/**
 * Enforces `matrix` (default: AUTHZ_MATRIX). Tests pass an extended matrix to mount a test-only route;
 * the app always uses the default.
 */
export function authorize(
  deps: AuthorizeDeps,
  matrix: Readonly<Record<string, RouteClass>> = AUTHZ_MATRIX,
): MiddlewareHandler<AuthEnv> {
  const session = requireSession(deps.auth);
  const workspace = workspaceContext(deps.db);
  const owner = requireRole("owner");
  const reviewer = requireRole("reviewer");

  return async (c, next) => {
    const route = handlerRoute(c);
    if (route === undefined) return next(); // no such route: Hono's 404
    const cls = matrix[routeKey(c.req.method === "HEAD" ? "GET" : c.req.method, route.path)];
    if (cls === undefined) return problem(c, 404);
    if (cls.access === "public") return next();

    // Each step either answers (401/403/404) or lets the next one run; the first answer wins.
    const steps: MiddlewareHandler<AuthEnv>[] = [session];
    if (cls.workspace) steps.push(workspace);
    if (cls.access === "owner") steps.push(owner);
    if (cls.access === "reviewer") steps.push(reviewer);
    for (const step of steps) {
      let passed = false;
      const answer = await step(c, async () => {
        passed = true;
      });
      if (!passed) return answer instanceof Response ? answer : problem(c, 403);
    }
    await next();
  };
}
