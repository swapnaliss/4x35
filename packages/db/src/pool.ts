// The pooled `pg` client (M0-06). Imports neither the schema nor `@4x35/core`, so `migrate.js` runs
// in the runtime image with only `packages/db/dist` and `drizzle/` copied (BL-01 7130276258).
import pg from "pg";

/** Pool settings. Every field falls back to an environment variable, then to a default. */
export interface PoolOptions {
  /** Postgres connection string. Default: `DATABASE_URL`. Never logged. */
  connectionString?: string;
  /** Maximum pool connections. Default: `DATABASE_POOL_MAX`, else 10. */
  max?: number;
  /** Per-statement timeout in milliseconds. Default: `DATABASE_STATEMENT_TIMEOUT_MS`, else 30000. */
  statementTimeoutMs?: number;
}

export const DEFAULT_POOL_MAX = 10;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;

function positiveInt(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    // The key name only: environment values are never printed.
    throw new Error(`invalid environment: ${name} must be a positive integer`);
  }
  return n;
}

/** Reads `DATABASE_URL` or throws a message that names the key, never its value. */
export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (url === undefined || url === "") {
    throw new Error("invalid environment: DATABASE_URL is not set");
  }
  return url;
}

/** Creates a node-postgres pool. The caller owns it and must `end()` it. */
export function createPool(
  options: PoolOptions = {},
  env: NodeJS.ProcessEnv = process.env,
): pg.Pool {
  return new pg.Pool({
    connectionString: options.connectionString ?? databaseUrl(env),
    max: options.max ?? positiveInt("DATABASE_POOL_MAX", env.DATABASE_POOL_MAX, DEFAULT_POOL_MAX),
    statement_timeout:
      options.statementTimeoutMs ??
      positiveInt(
        "DATABASE_STATEMENT_TIMEOUT_MS",
        env.DATABASE_STATEMENT_TIMEOUT_MS,
        DEFAULT_STATEMENT_TIMEOUT_MS,
      ),
  });
}
