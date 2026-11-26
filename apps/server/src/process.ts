// Process startup (ADR 0006, M1-04), shared by main.ts and the startup test:
//   MODE=web     HTTP on PORT; pg-boss send-only (enqueue, no workers)
//   MODE=worker  pg-boss workers; no listener on PORT
//   MODE=all     both
import type { Server } from "node:http";
import { createDb, createPool } from "@4x35/db";
import { serve } from "@hono/node-server";
import { type BuildInfo, createApp } from "./app.js";
import { type Env, servesHttp } from "./env.js";
import { type JobRuntime, startBoss } from "./jobs/boss.js";

export interface StartOptions {
  /** Worker poll interval in seconds (>= 0.5); default pg-boss's 2. Tests shorten it. */
  readonly pollingIntervalSeconds?: number;
  readonly onListening?: (port: number) => void;
  readonly onError?: (err: Error) => void;
}

export interface ProcessHandle {
  readonly env: Env;
  /** The HTTP server, or null for MODE=worker. */
  readonly http: Server | null;
  readonly jobs: JobRuntime;
  /** Stops HTTP, drains jobs (up to 25 s), closes the database pool. Safe to call twice. */
  stop(): Promise<void>;
}

export async function startProcess(
  env: Env,
  info: BuildInfo,
  options: StartOptions = {},
): Promise<ProcessHandle> {
  if (env.DATABASE_URL === undefined) {
    // The key name only, never a value.
    throw new Error("invalid environment: DATABASE_URL is not set");
  }
  const pool = createPool({ connectionString: env.DATABASE_URL });
  const db = createDb(pool);
  let jobs: JobRuntime;
  try {
    jobs = await startBoss({
      connectionString: env.DATABASE_URL,
      mode: env.MODE,
      db,
      ...(options.pollingIntervalSeconds === undefined
        ? {}
        : { pollingIntervalSeconds: options.pollingIntervalSeconds }),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });
  } catch (err) {
    await pool.end();
    throw err;
  }

  let http: Server | null = null;
  if (servesHttp(env.MODE)) {
    const app = createApp(info, { db });
    http = await new Promise<Server>((resolve) => {
      const server = serve({ fetch: app.fetch, port: env.PORT }, (addr) => {
        options.onListening?.(addr.port);
        resolve(server as Server);
      });
    });
  }

  let stopping: Promise<void> | null = null;
  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      if (http) {
        const server = http;
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      try {
        await jobs.stop();
      } finally {
        await pool.end();
      }
    })();
    return stopping;
  };
  return { env, http, jobs, stop };
}
