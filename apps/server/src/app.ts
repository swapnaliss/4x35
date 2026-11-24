import { Hono } from "hono";

export interface BuildInfo {
  version: string;
  commit: string;
}

export interface Health {
  status: "ok";
  version: string;
  commit: string;
}

/** The HTTP app. Liveness and readiness only until the API tickets add routes. */
export function createApp(info: BuildInfo): Hono {
  const app = new Hono();
  app.get("/healthz", (c) =>
    c.json<Health>({ status: "ok", version: info.version, commit: info.commit }),
  );
  // Readiness: nothing to wait for yet. M0-06 adds the database check.
  app.get("/readyz", (c) => c.json({ status: "ready" }));
  return app;
}
