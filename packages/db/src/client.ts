// The typed Drizzle client over the pool (M1-02): `createDb` and `withTx`. Workspace data is read
// and written through the workspace-scoped repositories built on this (M1-03), never directly.
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import * as schema from "./schema/index.js";

export {
  createPool,
  DEFAULT_POOL_MAX,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  databaseUrl,
  type PoolOptions,
} from "./pool.js";

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;
/** The handle a `withTx` callback receives; it has the same query API as `Database`. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Wraps a pool (from `createPool`) in a Drizzle client that knows every table. */
export function createDb(pool: pg.Pool): Database {
  return drizzle({ client: pool, schema });
}

/**
 * Runs `fn` in one transaction (ADR 0004): commits when it resolves, rolls back and rethrows when it
 * throws. State changes, their events and their job enqueues share this transaction (ADR 0006).
 */
export function withTx<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(fn);
}
