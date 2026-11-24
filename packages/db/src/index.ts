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
} from "./client.js";
export { journal, MIGRATIONS_FOLDER, runMigrations } from "./migrate.js";
export { seed } from "./seed.js";
