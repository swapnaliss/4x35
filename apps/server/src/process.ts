// Process startup (ADR 0006, M1-04), shared by main.ts and the startup test:
//   MODE=web     HTTP on PORT; pg-boss send-only (enqueue, no workers)
//   MODE=worker  pg-boss workers; no listener on PORT
//   MODE=all     both
import type { Server } from "node:http";
import { createDb, createPool } from "@4x35/db";
import { serve } from "@hono/node-server";
import { type BuildInfo, createApp } from "./app.js";
import { authConfig, type Env, servesHttp } from "./env.js";
import { type JobRuntime, runsWorkers, startBoss } from "./jobs/boss.js";
import { createProbePool, selectOne } from "./obs/health.js";
import { createLogger, type Logger } from "./obs/logger.js";

export interface StartOptions {
  /** Worker poll interval in seconds (>= 0.5); default pg-boss's 2. Tests shorten it. */
  readonly pollingIntervalSeconds?: number;
  readonly onListening?: (port: number) => void;
  readonly onError?: (err: Error) => void;
  /** The process logger. Default: JSON lines on stdout at `LOG_LEVEL`. */
  readonly logger?: Logger;
}

export interface ProcessHandle {
  readonly env: Env;
  /** The HTTP server, or null for MODE=worker. */
  readonly http: Server | null;
  readonly jobs: JobRuntime;
  readonly logger: Logger;
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
  // An HTTP process cannot authenticate anyone without its keys: fail before opening anything.
  const auth = servesHttp(env.MODE) ? authConfig(env) : undefined;
  const logger = options.logger ?? createLogger({ level: env.LOG_LEVEL });
  const pool = createPool({ connectionString: env.DATABASE_URL });
  // An idle client's error (Postgres restarted or stopped) must not crash the process: /readyz
  // reports the database, and the next query reconnects. The class only (ADR 0015).
  pool.on("error", (err) => logger.warn({ err }, "database pool error"));
  const db = createDb(pool);
  const probe = createProbePool(env.DATABASE_URL);
  let jobs: JobRuntime;
  try {
    jobs = await startBoss({
      connectionString: env.DATABASE_URL,
      mode: env.MODE,
      db,
      logger,
      ...(options.pollingIntervalSeconds === undefined
        ? {}
        : { pollingIntervalSeconds: options.pollingIntervalSeconds }),
      ...(options.onError === undefined ? {} : { onError: options.onError }),
    });
  } catch (err) {
    await Promise.all([pool.end(), probe.end()]);
    throw err;
  }

  let http: Server | null = null;
  if (servesHttp(env.MODE)) {
    const app = createApp(info, {
      db,
      ...(auth === undefined ? {} : { auth }),
      logger,
      readiness: {
        database: selectOne(probe),
        ...(runsWorkers(env.MODE) ? { jobsStarted: () => jobs.isStarted() } : {}),
      },
    });
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
        await Promise.all([pool.end(), probe.end()]);
      }
    })();
    return stopping;
  };
  return { env, http, jobs, logger, stop };
}
