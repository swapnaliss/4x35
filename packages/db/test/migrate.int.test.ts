import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { journal, runMigrations } from "../src/migrate.js";
import { seed } from "../src/seed.js";
import { createTestDatabase, hasDatabase, type TestDb } from "./harness.js";

// Without DATABASE_URL the project's global setup (vitest.integration-setup.ts) prints why these
// skip, and fails the run in CI instead. Each file runs on its own empty database (harness.ts).
describe.skipIf(!hasDatabase)("migrations on Postgres 17 (M0-06, M1-02)", () => {
  let t: TestDb;
  const quiet = (): void => {};

  beforeAll(async () => {
    t = await createTestDatabase("migrate", { migrate: false });
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });

  const count = async (): Promise<number> => {
    const res = await t.pool.query<{ n: number }>(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    return res.rows[0]?.n ?? -1;
  };

  it("an empty database gets every migration in order; a second run applies none", async () => {
    const applied = await runMigrations(t.pool, undefined, quiet);
    expect(applied).toEqual(journal().map((m) => m.tag));
    expect(applied.slice(0, 3)).toEqual(["0000_baseline", "0001_schema", "0002_immutability"]);
    const first = await count();
    expect(first).toBe(journal().length);
    expect(await runMigrations(t.pool, undefined, quiet)).toEqual([]);
    expect(await count()).toBe(first);
  });

  it("runs on PostgreSQL 17 with citext and pgcrypto installed", async () => {
    const v = await t.pool.query<{ v: string }>(
      "select current_setting('server_version_num') as v",
    );
    expect(Number(v.rows[0]?.v)).toBeGreaterThanOrEqual(170000);
    expect(Number(v.rows[0]?.v)).toBeLessThan(180000);
    const ext = await t.pool.query<{ extname: string }>(
      "select extname from pg_extension where extname in ('citext', 'pgcrypto') order by 1",
    );
    expect(ext.rows.map((r) => r.extname)).toEqual(["citext", "pgcrypto"]);
  });

  it("the seed is idempotent", async () => {
    const lines: string[] = [];
    await seed(t.pool, (l) => lines.push(l));
    await seed(t.pool, (l) => lines.push(l));
    expect(lines).toEqual(["seed: nothing to load", "seed: nothing to load"]);
  });
});
