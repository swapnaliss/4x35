import type { Database } from "@4x35/db";
import { Hono } from "hono";
import { type IdempotencyEnv, idempotency, type OptOut } from "./middleware/idempotency.js";
import { type BuildInfo, type ReadinessProbe, registerHealth } from "./obs/health.js";
import { type Logger, silentLogger } from "./obs/logger.js";
import { type ObsEnv, requestLogging } from "./obs/request-id.js";

export type { BuildInfo, Health } from "./obs/health.js";

/** Variables every request carries: request id and logger (M1-05), workspace (M1-03). */
export type AppEnv = { Variables: ObsEnv["Variables"] & IdempotencyEnv["Variables"] };

export interface AppDeps {
  /** The app database. With it, every POST gets `Idempotency-Key` handling (ADR 0005). */
  readonly db?: Database;
  /** POST routes that must not be replayed, each with its reason. */
  readonly idempotencyOptOut?: readonly OptOut[];
  /** Request logs (M1-05). Default: a silent logger; `startProcess` passes the process logger. */
  readonly logger?: Logger;
  /** What `/readyz` checks. Without it, `/readyz` answers 503 (database not configured). */
  readonly readiness?: ReadinessProbe;
}

/** The HTTP app: request ids and logs on every route, liveness and readiness. */
export function createApp(info: BuildInfo, deps: AppDeps = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
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
  if (deps.db) {
    app.use("*", idempotency({ db: deps.db, optOut: deps.idempotencyOptOut ?? [] }));
  }
  registerHealth(app, info, deps.readiness);
  return app;
}
