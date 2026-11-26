import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";
import { createPool } from "./pool.js";

/** The repo-root `drizzle/` folder. Same depth from `src/` (tests) and `dist/` (built). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../../drizzle/", import.meta.url));

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

/** Migrations in the drizzle-kit journal, in order. */
export function journal(folder: string = MIGRATIONS_FOLDER): JournalEntry[] {
  const raw = JSON.parse(readFileSync(join(folder, "meta", "_journal.json"), "utf8")) as {
    entries: JournalEntry[];
  };
  return [...raw.entries].sort((a, b) => a.idx - b.idx);
}

/** `created_at` of the newest applied migration, or null before the first run. */
async function lastApplied(pool: pg.Pool): Promise<number | null> {
  const exists = await pool.query<{ t: string | null }>(
    "select to_regclass('drizzle.__drizzle_migrations')::text as t",
  );
  if (exists.rows[0]?.t == null) return null;
  const res = await pool.query<{ created_at: string }>(
    "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
  );
  const row = res.rows[0];
  return row === undefined ? null : Number(row.created_at);
}

/**
 * Applies pending migrations with Drizzle's node-postgres migrator (one transaction per run; it
 * skips what `drizzle.__drizzle_migrations` already records).
 * Returns the tags it applied; logs migration names only.
 */
export async function runMigrations(
  pool: pg.Pool,
  folder: string = MIGRATIONS_FOLDER,
  log: (line: string) => void = (line) => console.log(line),
): Promise<string[]> {
  const last = await lastApplied(pool);
  const pending = journal(folder)
    .filter((m) => last === null || m.when > last)
    .map((m) => m.tag);
  for (const tag of pending) log(`migrate: applying ${tag}`);
  await migrate(drizzle({ client: pool }), { migrationsFolder: folder });
  log(
    pending.length === 0
      ? "migrate: nothing to apply"
      : `migrate: done (${pending.length} applied)`,
  );
  return pending;
}

async function main(): Promise<void> {
  const pool = createPool({ max: 1 });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    // The error class and message only: pg errors never carry the connection string.
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
    console.error(`migrate: failed: ${msg}`);
    process.exit(1);
  });
}
