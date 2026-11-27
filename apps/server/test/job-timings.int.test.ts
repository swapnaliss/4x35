/**
 * Job timings and dead letters (M1-05) against a real Postgres and a real pg-boss 12.38.2:
 *   AC 4  a job that succeeds once has 1 `job_timings` row (completed); a job that always fails runs
 *         4 attempts, has 4 rows (failed, failed, failed, dead_letter), sits in `<kind>.dlq`, and
 *         `npm run jobs:dead-letters` lists it without its payload or error message.
 *   P3    one row per attempt, the outcome given by the attempt's position, for every attempt plan
 *         (success on attempt k, or 4 failures), through `observeAttempt` on a real database.
 *         Planted bug first: the row written inside the handler's transaction.
 * Every value is synthetic.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type Database, systemRepository, withTx } from "@4x35/db";
import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import {
  type AttemptInfo,
  createLogger,
  defineJob,
  enqueueInTx,
  type JobRuntime,
  listDeadLetters,
  observeAttempt,
  RETRY_LIMIT,
  startBoss,
} from "../src/index.js";
import { urlFor, waitFor } from "./support.js";

const PACK = "synthetic-pack@1.0.0";
/** A synthetic marker that must never reach the logs or the dead-letter listing. */
const MARKER = "MKRZQXJ東京都千代田区मुंबई";

defineJob({
  kind: "test.timings-ok",
  schema: z.object({ note: z.string() }),
  async handler() {},
});
class SyntheticParseError extends Error {
  override name = "SyntheticParseError";
}
defineJob({
  kind: "test.timings-dead",
  schema: z.object({ note: z.string() }),
  retryDelaySeconds: 1,
  async handler({ payload }) {
    throw new SyntheticParseError(`cannot parse ${payload.note}`);
  },
});

describe.skipIf(!hasDatabase)("job timings and dead letters (real Postgres + pg-boss)", () => {
  let t: TestDb;
  let jobs: JobRuntime;
  const raw: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: {
      write(s: string) {
        raw.push(s);
      },
    },
  });

  beforeAll(async () => {
    t = await createTestDatabase("job-timings");
    jobs = await startBoss({
      connectionString: urlFor(t.name),
      mode: "all",
      db: t.db,
      logger,
      pollingIntervalSeconds: 0.5,
    });
  });

  afterAll(async () => {
    await jobs?.stop();
    await t?.dropAndClose();
  });

  const timings = async (jobId: string) =>
    (await systemRepository(t.db).jobTimings.listByJob(jobId)).map((r) => ({
      outcome: r.outcome,
      ms: r.ms,
      kind: r.kind,
      batchId: r.batchId,
      chunk: r.chunk,
    }));

  it("AC 4: 1 row for a job that succeeds; 4 rows for one that fails and dead-letters; the CLI lists it without payload", async () => {
    const okBatch = randomUUID();
    const deadBatch = randomUUID();
    const [ok, dead] = await withTx(t.db, async (tx) => [
      (await enqueueInTx(
        tx,
        "test.timings-ok",
        { note: MARKER },
        {
          batchId: okBatch,
          packRef: PACK,
          step: "ok",
          chunk: 3,
        },
      )) as string,
      (await enqueueInTx(
        tx,
        "test.timings-dead",
        { note: MARKER },
        {
          batchId: deadBatch,
          packRef: PACK,
          step: "dead",
          chunk: 0,
        },
      )) as string,
    ]);

    await waitFor(
      "the dead-letter copy",
      async () => {
        const r = await t.db.execute<{ n: number }>(
          sql`select count(*)::int as n from pgboss.job where name = 'test.timings-dead.dlq' and source_id = ${dead}`,
        );
        return r.rows[0]?.n === 1 ? true : undefined;
      },
      40_000,
    );
    // The dead-letter copy is written in the same statement as the last failure; the timing row
    // follows the attempt, so wait for it explicitly.
    await waitFor("4 timing rows", async () =>
      (await timings(dead)).length === RETRY_LIMIT + 1 ? true : undefined,
    );

    const okRows = await timings(ok);
    expect(okRows.map((r) => r.outcome)).toEqual(["completed"]);
    expect(okRows[0]).toMatchObject({ kind: "test.timings-ok", batchId: okBatch, chunk: 3 });
    const deadRows = await timings(dead);
    expect(deadRows.map((r) => r.outcome)).toEqual(["failed", "failed", "failed", "dead_letter"]);
    for (const r of deadRows) {
      expect(r).toMatchObject({ kind: "test.timings-dead", batchId: deadBatch, chunk: 0 });
      expect(r.ms).toBeGreaterThanOrEqual(0);
    }
    console.log(
      `AC 4: job_timings rows: ok=${okRows.length} (${okRows.map((r) => r.outcome)}), dead=${deadRows.length} (${deadRows.map((r) => r.outcome)})`,
    );

    // The listing: kind, original job id, batch id, attempts, error class.
    const list = await withTx(t.db, (tx) => listDeadLetters(tx, { limit: 10 }));
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      kind: "test.timings-dead",
      jobId: dead,
      batchId: deadBatch,
      attempts: RETRY_LIMIT + 1,
      errorClass: "SyntheticParseError",
    });
    expect(Object.keys(list[0] as object).sort()).toEqual([
      "attempts",
      "batchId",
      "deadAt",
      "errorClass",
      "jobId",
      "kind",
    ]);
    expect(JSON.stringify(list)).not.toContain("MKRZQXJ");
    expect(await withTx(t.db, (tx) => listDeadLetters(tx, { limit: 1 }))).toHaveLength(1);
    await expect(withTx(t.db, (tx) => listDeadLetters(tx, { limit: 0 }))).rejects.toThrow();

    // The CLI, exactly as an operator runs it, against this database.
    const cwd = fileURLToPath(new URL("..", import.meta.url));
    const { stdout } = await promisify(execFile)("npm", ["run", "--silent", "jobs:dead-letters"], {
      cwd,
      env: { ...process.env, DATABASE_URL: urlFor(t.name) },
    });
    console.log(`AC 4: npm run jobs:dead-letters printed:\n${stdout}`);
    const lines = stdout.trim().split("\n");
    expect(lines[0]).toBe("kind\tjob_id\tbatch_id\tattempts\terror_class");
    expect(lines.slice(1)).toEqual([
      `test.timings-dead\t${dead}\t${deadBatch}\t4\tSyntheticParseError`,
    ]);
    expect(stdout).not.toContain("MKRZQXJ");
    expect(stdout).not.toContain("cannot parse");

    // The job's log lines: allow-listed fields, the error class only.
    const lines2 = raw.map((l) => JSON.parse(l) as Record<string, unknown>);
    const deadLines = lines2.filter((l) => l.jobId === dead);
    expect(deadLines.map((l) => (l.job as { outcome: string }).outcome)).toEqual([
      "failed",
      "failed",
      "failed",
      "dead_letter",
    ]);
    expect(deadLines.map((l) => (l.job as { attempt: number }).attempt)).toEqual([1, 2, 3, 4]);
    for (const l of deadLines) expect(l.err).toEqual({ type: "SyntheticParseError" });
    expect(raw.join("")).not.toContain("MKRZQXJ");
    expect(raw.join("")).not.toContain("cannot parse");
  }, 90_000);

  // ── P3 ───────────────────────────────────────────────────────────────────────────────────────
  type Observe = (db: Database, info: AttemptInfo, run: () => Promise<void>) => Promise<void>;
  const real: Observe = (db, info, run) => observeAttempt(db, logger, info, run);
  /** Planted bug: the timing row is written inside the handler's transaction. */
  const planted: Observe = (db, info, run) =>
    withTx(db, async (tx) => {
      let outcome = "completed";
      try {
        await run();
      } catch {
        outcome = info.retryCount >= info.retryLimit ? "dead_letter" : "failed";
      }
      await systemRepository(tx).jobTimings.insert({
        jobId: info.jobId,
        kind: info.kind,
        batchId: info.batchId,
        chunk: info.chunk,
        ms: 0,
        outcome,
      });
      if (outcome !== "completed") throw new Error("attempt failed");
    });

  /** Success on attempt k (1..4), or null: all 4 attempts fail. */
  const plan = fc.option(fc.integer({ min: 1, max: RETRY_LIMIT + 1 }), { nil: null });

  const onePerAttempt = (observe: Observe) =>
    fc.asyncProperty(plan, fc.integer({ min: 0, max: 50 }), async (succeedOn, chunk) => {
      const jobId = randomUUID();
      const batchId = randomUUID();
      let attempts = 0;
      for (let retryCount = 0; retryCount <= RETRY_LIMIT; retryCount++) {
        attempts++;
        const info: AttemptInfo = {
          kind: "test.p3",
          jobId,
          retryCount,
          retryLimit: RETRY_LIMIT,
          batchId,
          chunk,
          requestId: null,
        };
        const ok = await observe(t.db, info, async () => {
          if (succeedOn === null || attempts < succeedOn) throw new SyntheticParseError("x");
        }).then(
          () => true,
          () => false,
        );
        if (ok) break;
      }
      const expected =
        succeedOn === null
          ? ["failed", "failed", "failed", "dead_letter"]
          : [...Array(succeedOn - 1).fill("failed"), "completed"];
      const rows = await timings(jobId);
      // Compared as a multiset: attempts here run within the same millisecond, and `at` has
      // millisecond precision, so the row order is not the attempt order (CI seed 454361517).
      expect(rows.map((r) => r.outcome).sort()).toEqual([...expected].sort());
      for (const r of rows) expect(r).toMatchObject({ kind: "test.p3", batchId, chunk });
    });

  it("P3 one job_timings row per attempt catches a planted bug (row written in the handler's transaction)", async () => {
    const result = await fc.check(onePerAttempt(planted), { numRuns: 100, seed: 5053 });
    expect(result.failed, "P3: the planted bug was not caught").toBe(true);
    console.log(
      `P3 one row per attempt: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample=${JSON.stringify(result.counterexample)}`,
    );
  });

  it("P3 one job_timings row per attempt, outcome by attempt position (100 runs)", async () => {
    await fc.assert(onePerAttempt(real), { numRuns: 100 });
  });
});
