// Liveness and readiness (M1-05). Both routes are public (M1-03 registers them as `public` in the
// authZ matrix) and carry no data beyond status, version and commit.
//   GET /healthz  the process is up; never touches the database
//   GET /readyz   `select 1` answers within 2 s on a dedicated probe connection and, in worker modes,
//                 pg-boss is started; otherwise 503. Render's health check points here.
import type { Env, Hono } from "hono";
import pg from "pg";

/** The readiness budget: the database must answer within this many milliseconds. */
export const READY_TIMEOUT_MS = 2_000;

export interface BuildInfo {
  version: string;
  commit: string;
}

export interface Health {
  status: "ok";
  version: string;
  commit: string;
}

export type CheckResult = "ok" | "unavailable" | "timeout" | "not configured";

export interface Readiness {
  status: "ready" | "unavailable";
  checks: { database: CheckResult; jobs?: CheckResult };
}

export interface ReadinessProbe {
  /** Resolves when the database answers `select 1`. */
  readonly database: (() => Promise<void>) | null;
  /** In worker modes: whether pg-boss is started. Omitted in MODE=web (send-only client). */
  readonly jobsStarted?: () => boolean;
}

/**
 * A dedicated pool for the readiness probe (one connection, 2 s connect and statement timeouts),
 * so a saturated app pool never makes the process look down, and a stopped Postgres fails fast.
 * The caller ends it. Its errors (a dropped connection) are absorbed: the next probe reports them.
 */
export function createProbePool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: READY_TIMEOUT_MS,
    statement_timeout: READY_TIMEOUT_MS,
    query_timeout: READY_TIMEOUT_MS,
    idleTimeoutMillis: 30_000,
    application_name: "4x35-readyz",
  });
  pool.on("error", () => {});
  return pool;
}

/** The `database` probe for a pool: `select 1`. */
export function selectOne(pool: pg.Pool): () => Promise<void> {
  return async () => {
    await pool.query("select 1");
  };
}

async function checkDatabase(probe: () => Promise<void>): Promise<CheckResult> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => resolve("timeout"), READY_TIMEOUT_MS);
  });
  const answered = probe().then(
    (): CheckResult => "ok",
    (): CheckResult => "unavailable",
  );
  try {
    return await Promise.race([answered, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the readiness checks. Resolves within `READY_TIMEOUT_MS` plus scheduling slack. */
export async function readiness(probe: ReadinessProbe | undefined): Promise<Readiness> {
  const database: CheckResult = probe?.database
    ? await checkDatabase(probe.database)
    : "not configured";
  const checks: Readiness["checks"] = { database };
  if (probe?.jobsStarted) checks.jobs = probe.jobsStarted() ? "ok" : "unavailable";
  const ready = database === "ok" && (checks.jobs === undefined || checks.jobs === "ok");
  return { status: ready ? "ready" : "unavailable", checks };
}

/** Registers `/healthz` and `/readyz` on `app`. */
export function registerHealth<E extends Env>(
  app: Hono<E>,
  info: BuildInfo,
  probe?: ReadinessProbe,
): void {
  app.get("/healthz", (c) =>
    c.json<Health>({ status: "ok", version: info.version, commit: info.commit }),
  );
  app.get("/readyz", async (c) => {
    const r = await readiness(probe);
    return c.json(r, r.status === "ready" ? 200 : 503);
  });
}
