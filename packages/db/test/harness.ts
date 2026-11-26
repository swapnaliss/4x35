/**
 * Integration-test harness (M1-02): every `*.int.test.ts` file gets its own fresh database on the
 * local Postgres from `make up`, migrated with the real runner, and dropped when the file ends.
 *
 *   const t = await createTestDatabase("schema");   // in beforeAll
 *   await t.dropAndClose();                         // in afterAll
 *
 * The admin connection is `DATABASE_URL` (never printed). Database names are
 * `t_<label>_<PORT_OFFSET>_<random>`, so parallel workers and files never share one.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";
import { createDb, type Database } from "../src/client.js";
import { runMigrations } from "../src/migrate.js";
import { createPool } from "../src/pool.js";

/** True when a Postgres is configured; files use `describe.skipIf(!hasDatabase)`. */
export const hasDatabase = (process.env.DATABASE_URL ?? "") !== "";

export interface TestDb {
  /** The database name (`t_<label>_<PORT_OFFSET>_<random>`). */
  readonly name: string;
  /** A pool on the new database (max 4 connections). */
  readonly pool: pg.Pool;
  /** A Drizzle client over `pool` that knows every table. */
  readonly db: Database;
  /** Closes the pool and drops the database (also when other sessions are still connected). */
  dropAndClose(): Promise<void>;
}

export interface TestDbOptions {
  /** Run every migration on the new database (default true). */
  readonly migrate?: boolean;
  /** Statement timeout for the pool, in ms (default: the pool's default). */
  readonly statementTimeoutMs?: number;
}

const quiet = (): void => {};

/** Lower-case letters, digits and `_` only: the name is interpolated into DDL. */
export function testDatabaseName(label: string, env: NodeJS.ProcessEnv = process.env): string {
  const safe =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .slice(0, 24) || "test";
  const offset = /^[0-9]+$/.test(env.PORT_OFFSET ?? "") ? (env.PORT_OFFSET as string) : "0";
  return `t_${safe}_${offset}_${randomBytes(5).toString("hex")}`;
}

function urlFor(database: string): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `/${database}`;
  return url.toString();
}

async function admin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function createTestDatabase(
  label: string,
  options: TestDbOptions = {},
): Promise<TestDb> {
  if (!hasDatabase) throw new Error("harness: DATABASE_URL is not set");
  const name = testDatabaseName(label);
  await admin((c) => c.query(`CREATE DATABASE "${name}"`));
  const pool = createPool({
    connectionString: urlFor(name),
    max: 4,
    ...(options.statementTimeoutMs === undefined
      ? {}
      : { statementTimeoutMs: options.statementTimeoutMs }),
  });
  let closed = false;
  const dropAndClose = async (): Promise<void> => {
    if (!closed) {
      closed = true;
      await pool.end();
    }
    await admin((c) => c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
  };
  try {
    if (options.migrate ?? true) await runMigrations(pool, undefined, quiet);
  } catch (err) {
    await dropAndClose();
    throw err;
  }
  return { name, pool, db: createDb(pool), dropAndClose };
}

/** True when a database with this name exists (for the harness's own test). */
export async function databaseExists(name: string): Promise<boolean> {
  return admin(async (c) => {
    const res = await c.query("select 1 from pg_database where datname = $1", [name]);
    return res.rowCount === 1;
  });
}

/** The SQLSTATE of a pg error, also when Drizzle wraps it (`DrizzleQueryError.cause`). */
export function sqlState(err: unknown): string | undefined {
  let e: unknown = err;
  for (let i = 0; i < 5 && e !== null && typeof e === "object"; i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    e = (e as { cause?: unknown }).cause;
  }
  return undefined;
}

/** The pg error message, also when Drizzle wraps it. */
export function pgMessage(err: unknown): string {
  let e: unknown = err;
  for (let i = 0; i < 5 && e !== null && typeof e === "object"; i++) {
    if (typeof (e as { code?: unknown }).code === "string") return String((e as Error).message);
    e = (e as { cause?: unknown }).cause;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Awaits `p` and returns the error it rejects with; fails if it resolves. */
export async function rejection(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (err) {
    return err;
  }
  throw new Error("expected the statement to fail, but it succeeded");
}
