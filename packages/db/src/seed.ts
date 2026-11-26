import { pathToFileURL } from "node:url";
import type pg from "pg";
import { createPool } from "./pool.js";

/**
 * Idempotent seed entry point. Later tickets add loaders here (M0-08 datasets, M2-24 demo set);
 * each must be safe to run again on a seeded database. Today it only proves the connection.
 */
export async function seed(
  pool: pg.Pool,
  log: (line: string) => void = (line) => console.log(line),
): Promise<void> {
  await pool.query("select 1");
  log("seed: nothing to load");
}

async function main(): Promise<void> {
  const pool = createPool({ max: 1 });
  try {
    await seed(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
    console.error(`seed: failed: ${msg}`);
    process.exit(1);
  });
}
