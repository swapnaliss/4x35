/** Drizzle schema, migrations and the workspace-scoped repository layer. */
export const WORKSPACE = "@4x35/db";

export {
  createDb,
  createPool,
  type Database,
  DEFAULT_POOL_MAX,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  databaseUrl,
  type PoolOptions,
  type Schema,
  type Tx,
  withTx,
} from "./client.js";
export * from "./mappers/index.js";
export { journal, MIGRATIONS_FOLDER, runMigrations } from "./migrate.js";
export * as schema from "./schema/index.js";
export { seed } from "./seed.js";
