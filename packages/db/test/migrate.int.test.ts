import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool } from "../src/client.js";
import { journal, runMigrations } from "../src/migrate.js";
import { seed } from "../src/seed.js";

// Without DATABASE_URL the project's global setup (vitest.integration-setup.ts) prints why these
// skip, and fails the run in CI instead.
const hasDb = (process.env.DATABASE_URL ?? "") !== "";

describe.skipIf(!hasDb)("migrations on Postgres 17 (M0-06)", () => {
  let pool: pg.Pool;
  const quiet = (): void => {};

  beforeAll(() => {
    pool = createPool({ max: 2 });
  });
  afterAll(async () => {
    await pool?.end();
  });

  const count = async (): Promise<number> => {
    const res = await pool.query<{ n: number }>(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    return res.rows[0]?.n ?? -1;
  };

  it("applying the migrations twice leaves the same __drizzle_migrations count", async () => {
    await runMigrations(pool, undefined, quiet);
    const first = await count();
    const appliedAgain = await runMigrations(pool, undefined, quiet);
    expect(appliedAgain).toEqual([]);
    expect(await count()).toBe(first);
    expect(first).toBe(journal().length);
  });

  it("runs on PostgreSQL 17 with citext and pgcrypto installed", async () => {
    const v = await pool.query<{ v: string }>("select current_setting('server_version_num') as v");
    expect(Number(v.rows[0]?.v)).toBeGreaterThanOrEqual(170000);
    expect(Number(v.rows[0]?.v)).toBeLessThan(180000);
    const ext = await pool.query<{ extname: string }>(
      "select extname from pg_extension where extname in ('citext', 'pgcrypto') order by 1",
    );
    expect(ext.rows.map((r) => r.extname)).toEqual(["citext", "pgcrypto"]);
  });

  it("the seed is idempotent", async () => {
    const lines: string[] = [];
    await seed(pool, (l) => lines.push(l));
    await seed(pool, (l) => lines.push(l));
    expect(lines).toEqual(["seed: nothing to load", "seed: nothing to load"]);
  });
});
