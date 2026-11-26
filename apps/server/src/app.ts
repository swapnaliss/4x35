import type { Database } from "@4x35/db";
import { Hono } from "hono";
import { type IdempotencyEnv, idempotency, type OptOut } from "./middleware/idempotency.js";

export interface BuildInfo {
  version: string;
  commit: string;
}

export interface Health {
  status: "ok";
  version: string;
  commit: string;
}

export interface AppDeps {
  /** The app database. With it, every POST gets `Idempotency-Key` handling (ADR 0005). */
  readonly db?: Database;
  /** POST routes that must not be replayed, each with its reason. */
  readonly idempotencyOptOut?: readonly OptOut[];
}

/** The HTTP app. Liveness and readiness only until the API tickets add routes. */
export function createApp(info: BuildInfo, deps: AppDeps = {}): Hono<IdempotencyEnv> {
  const app = new Hono<IdempotencyEnv>();
  if (deps.db) {
    app.use("*", idempotency({ db: deps.db, optOut: deps.idempotencyOptOut ?? [] }));
  }
  app.get("/healthz", (c) =>
    c.json<Health>({ status: "ok", version: info.version, commit: info.commit }),
  );
  // Readiness: nothing to wait for yet. M0-06 adds the database check.
  app.get("/readyz", (c) => c.json({ status: "ready" }));
  return app;
}
