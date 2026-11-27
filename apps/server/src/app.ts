import type { Database } from "@4x35/db";
import { OpenAPIHono } from "@hono/zod-openapi";
import { authorize } from "./authz/enforce.js";
import { registerIdentityRoutes } from "./identity/routes.js";
import { type IdempotencyEnv, idempotency, type OptOut } from "./middleware/idempotency.js";
import { problem } from "./middleware/problem.js";
import { type AuthConfig, type AuthEnv, session } from "./middleware/session.js";
import { type BuildInfo, type ReadinessProbe, registerHealth } from "./obs/health.js";
import { type Logger, silentLogger } from "./obs/logger.js";
import { type ObsEnv, requestLogging } from "./obs/request-id.js";

export type { BuildInfo, Health } from "./obs/health.js";

/** Variables every request carries: request id and logger (M1-05), session and workspace (M1-03). */
export type AppEnv = {
  Variables: ObsEnv["Variables"] & IdempotencyEnv["Variables"] & AuthEnv["Variables"];
};

/**
 * POST routes never stored for replay (ADR 0005): their response carries a one-time secret, and a
 * stored replay would keep the raw token in `idempotency_keys` (M1-03 AC 5).
 */
export const IDENTITY_IDEMPOTENCY_OPT_OUT: readonly OptOut[] = [
  {
    path: "/api/v1/workspaces/{id}/invites",
    reason: "the response carries the one-time invite token, which is stored only hashed",
  },
  {
    path: "/api/v1/workspaces/{id}/members/{userId}/reset-link",
    reason: "the response carries the one-time reset token, which is stored only hashed",
  },
];

export interface AppDeps {
  /** The app database. With it, every POST gets `Idempotency-Key` handling (ADR 0005). */
  readonly db?: Database;
  /** Session and CSRF keys. With `db`, the identity API and the authz matrix are installed. */
  readonly auth?: AuthConfig;
  /** POST routes that must not be replayed, each with its reason. */
  readonly idempotencyOptOut?: readonly OptOut[];
  /** Request logs (M1-05). Default: a silent logger; `startProcess` passes the process logger. */
  readonly logger?: Logger;
  /** What `/readyz` checks. Without it, `/readyz` answers 503 (database not configured). */
  readonly readiness?: ReadinessProbe;
}

export type App = OpenAPIHono<AppEnv>;

/**
 * The HTTP app. Middleware order: request id and log → session → authz matrix (session, CSRF,
 * workspace, role) → `Idempotency-Key` (keyed by the workspace authz resolved) → route.
 */
export function createApp(info: BuildInfo, deps: AppDeps = {}): App {
  const app = new OpenAPIHono<AppEnv>({
    // A body or parameter that fails its schema: a fixed problem, never the zod message (it can
    // quote the input).
    defaultHook: (result, c) => {
      if (!result.success) return problem(c, 400, "The request does not match the API schema.");
    },
  });
  app.use("*", requestLogging(deps.logger ?? silentLogger()));
  // Hono's default error handler prints the error (message and stack) to stderr, and a message can
  // carry request content: log the class only, answer a generic 500.
  app.onError((err, c) => {
    c.var.log.error({ err }, "request failed");
    return c.body(
      JSON.stringify({ type: "about:blank", title: "Internal Server Error", status: 500 }),
      500,
      { "content-type": "application/problem+json" },
    );
  });
  const identity = deps.db && deps.auth ? { db: deps.db, auth: deps.auth } : undefined;
  if (identity) {
    app.use("*", session(identity));
    app.use("*", authorize(identity));
  }
  if (deps.db) {
    app.use(
      "*",
      idempotency({
        db: deps.db,
        optOut: [...IDENTITY_IDEMPOTENCY_OPT_OUT, ...(deps.idempotencyOptOut ?? [])],
      }),
    );
  }
  registerHealth(app, info, deps.readiness);
  if (identity) registerIdentityRoutes(app, identity);
  return app;
}
