/**
 * Jobs against a real Postgres and a real pg-boss 12.38.2 (M1-04, AC 1 and AC 3).
 * The job kinds below are test-only and registered here; product code registers none of them.
 *   a. a rolled-back enqueue leaves no job
 *   c. P2 P-handler-idempotent: a forced replay of a chunk job leaves the same rows (planted bug first)
 *   d. an always-failing handler runs 4 times with increasing, jittered delays, then sits in <kind>.dlq
 *   e. the same (batch, pack, step, chunk) enqueued twice is one job
 *   AC 3: getBatchProgress counts records in three statuses and queued/active/failed/dead jobs
 * (AC 1b, P-chunking-covers-once, is in packages/core/test/chunk.property.test.ts.)
 */
import { randomUUID } from "node:crypto";
import { type Tx, withTx } from "@4x35/db";
import { sql } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { addressLine } from "../../../packages/core/test/arbitraries.js";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import {
  defineJob,
  enqueueInTx,
  fanOut,
  getBatchProgress,
  type JobRuntime,
  RETRY_LIMIT,
  startBoss,
} from "../src/index.js";
import { jobState, jobsOfBatch, pgArray, seedBatch, waitFor } from "./support.js";

const PACK = "synthetic-pack@1.0.0";

// ── test-only job kinds ──────────────────────────────────────────────────────────────────────
const ResultPayload = z.object({
  records: z.array(z.object({ id: z.uuid(), value: z.string() })),
});

/** Correct handler: upsert keyed on (record, pack ref, step). */
defineJob({
  kind: "test.upsert",
  schema: ResultPayload,
  async handler({ tx, payload, key }) {
    for (const r of payload.records) {
      await tx.execute(sql`
        insert into test_job_results (record_id, pack_ref, step, value)
        values (${r.id}, ${key.packRef}, ${key.step}, ${r.value})
        on conflict (record_id, pack_ref, step) do update set value = excluded.value`);
    }
  },
});

/** Planted bug for P2: appends a row per run instead of upserting. */
defineJob({
  kind: "test.append",
  schema: ResultPayload,
  async handler({ tx, payload, key }) {
    for (const r of payload.records) {
      await tx.execute(sql`
        insert into test_job_appends (record_id, pack_ref, step, value)
        values (${r.id}, ${key.packRef}, ${key.step}, ${r.value})`);
    }
  },
});

/** Always throws; records each attempt's throw time and the job row's scheduled start. */
interface Attempt {
  retryCount: number;
  startAfter: number;
  thrownAt: number;
}
const attempts = new Map<string, Attempt[]>();
defineJob({
  kind: "test.always-fails",
  schema: z.object({}),
  retryDelaySeconds: 1,
  async handler({ tx, jobId }) {
    const res = await tx.execute<{ start_after: Date; retry_count: number }>(
      sql`select start_after, retry_count from pgboss.job where id = ${jobId}`,
    );
    const row = res.rows[0];
    const list = attempts.get(jobId) ?? [];
    list.push({
      retryCount: row?.retry_count ?? -1,
      startAfter: new Date(row?.start_after ?? 0).getTime(),
      thrownAt: Date.now(),
    });
    attempts.set(jobId, list);
    throw new Error("synthetic failure");
  },
});

/** Fails once and then waits a long retry: the job sits in pg-boss state `retry`. */
defineJob({
  kind: "test.fails-slow",
  schema: z.object({}),
  retryDelaySeconds: 300,
  async handler() {
    throw new Error("synthetic failure, slow retry");
  },
});

/** Holds its job active until the test opens the gate. One worker, so a second job stays queued. */
let openGate: () => void = () => {};
let gate = Promise.resolve();
const closeGate = () => {
  gate = new Promise<void>((resolve) => {
    openGate = resolve;
  });
};
const gateRuns: string[] = [];
defineJob({
  kind: "test.gated",
  schema: z.object({ n: z.number().int() }),
  async handler({ jobId }) {
    gateRuns.push(jobId);
    await gate;
  },
});

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────
describe.skipIf(!hasDatabase)("jobs (real Postgres + pg-boss)", () => {
  let t: TestDb;
  let runtime: JobRuntime;
  const bossUrl = () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.pathname = `/${t.name}`;
    return url.toString();
  };

  beforeAll(async () => {
    t = await createTestDatabase("jobs");
    await t.db.execute(sql`
      create table test_job_results (
        record_id uuid not null, pack_ref text not null, step text not null, value text not null,
        primary key (record_id, pack_ref, step))`);
    await t.db.execute(sql`
      create table test_job_appends (
        id bigserial primary key,
        record_id uuid not null, pack_ref text not null, step text not null, value text not null)`);
    runtime = await startBoss({
      connectionString: bossUrl(),
      mode: "all",
      db: t.db,
      pollingIntervalSeconds: 0.5,
    });
  });

  afterAll(async () => {
    openGate();
    await runtime?.stop();
    await t?.dropAndClose();
  });

  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTx(t.db, fn);
  const completed = (id: string) =>
    waitFor(`job ${id} completed`, async () =>
      (await jobState(t.db, id)) === "completed" ? true : undefined,
    );

  // a ──────────────────────────────────────────────────────────────────────────────────────────
  it("a. a transaction that enqueues and then rolls back leaves no job in pg-boss", async () => {
    const batchId = randomUUID();
    const key = { batchId, packRef: PACK, step: "structure", chunk: 0 };
    const rolledBack = new Error("roll back the state change");
    await expect(
      tx(async (q) => {
        const id = await enqueueInTx(q, "test.upsert", { records: [] }, key);
        expect(id).toMatch(/^[0-9a-f-]{36}$/);
        throw rolledBack;
      }),
    ).rejects.toBe(rolledBack);
    expect(await jobsOfBatch(t.db, batchId)).toEqual([]);

    // Control: the same enqueue, committed, leaves exactly one job.
    const id = await tx((q) => enqueueInTx(q, "test.upsert", { records: [] }, key));
    expect((await jobsOfBatch(t.db, batchId)).map((j) => j.id)).toEqual([id]);
  });

  it("a. fanOut enqueues one job per chunk of 200, in the caller's transaction", async () => {
    const batchId = randomUUID();
    const ids = Array.from({ length: 401 }, () => randomUUID());
    const jobIds = await tx((q) =>
      fanOut(q, batchId, "structure", ids, {
        kind: "test.upsert",
        packRef: PACK,
        payload: (recordIds) => ({ records: recordIds.map((id) => ({ id, value: "x" })) }),
      }),
    );
    expect(jobIds).toHaveLength(3);
    expect(await jobsOfBatch(t.db, batchId)).toHaveLength(3);
    for (const id of jobIds) await completed(id as string);
    const n = await t.db.execute<{ n: number }>(
      sql`select count(*)::int as n from test_job_results where record_id = any(${pgArray(ids)}::uuid[])`,
    );
    expect(n.rows[0]?.n).toBe(401);
  });

  it("rejects a payload that does not match the kind's schema, before anything is sent", async () => {
    const batchId = randomUUID();
    await expect(
      tx((q) =>
        enqueueInTx(
          q,
          "test.upsert",
          { records: [{ id: "not-a-uuid", value: "x" }] },
          {
            batchId,
            packRef: PACK,
            step: "structure",
            chunk: 0,
          },
        ),
      ),
    ).rejects.toThrow();
    expect(await jobsOfBatch(t.db, batchId)).toEqual([]);
  });

  // c ──────────────────────────────────────────────────────────────────────────────────────────
  /** Chunk payloads: distinct record ids with address-line values (domain arbitraries). */
  const chunkPayload = fc
    .uniqueArray(fc.uuid({ version: 4 }), { minLength: 1, maxLength: 200 })
    .chain((ids) =>
      fc
        .array(addressLine, { minLength: ids.length, maxLength: ids.length })
        .map((values) => ({ records: ids.map((id, i) => ({ id, value: values[i] ?? "" })) })),
    );
  /** numRuns for P2: each run is two real pg-boss jobs (about 1 s), so 20 rather than core's 1,000. */
  const P2_RUNS = 20;
  /** Per-test timeout for the tests that wait on pg-boss retries (the root project's default is 30 s). */
  const SLOW = 90_000;

  /** Runs a chunk job once, snapshots, forces a replay (same key, after completion), snapshots. */
  const handlerIdempotent = (kind: "test.upsert" | "test.append", table: string) =>
    fc.asyncProperty(chunkPayload, async (payload) => {
      const key = { batchId: randomUUID(), packRef: PACK, step: "structure", chunk: 0 };
      const ids = payload.records.map((r) => r.id);
      const snapshot = async () =>
        (
          await t.db.execute(
            sql`select record_id, pack_ref, step, value from ${sql.raw(table)}
                where record_id = any(${pgArray(ids)}::uuid[]) order by record_id, value`,
          )
        ).rows;
      const first = await tx((q) => enqueueInTx(q, kind, payload, key));
      await completed(first as string);
      const once = await snapshot();
      const replay = await tx((q) => enqueueInTx(q, kind, payload, key));
      expect(replay).not.toBeNull();
      expect(replay).not.toBe(first);
      await completed(replay as string);
      const twice = await snapshot();
      expect(once).toHaveLength(payload.records.length);
      expect(twice).toEqual(once);
    });

  it(
    "P2 P-handler-idempotent catches a planted bug (insert instead of upsert)",
    async () => {
      const result = await fc.check(handlerIdempotent("test.append", "test_job_appends"), {
        numRuns: P2_RUNS,
        seed: 4042,
        endOnFailure: true,
      });
      expect(result.failed, "P-handler-idempotent: the planted bug was not caught").toBe(true);
      console.log(
        `P-handler-idempotent: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; records in counterexample=${result.counterexample?.[0]?.records.length}`,
      );
    },
    SLOW,
  );

  it(
    `P2 P-handler-idempotent: a forced replay of a chunk job leaves the same rows (${P2_RUNS} runs)`,
    async () => {
      await fc.assert(handlerIdempotent("test.upsert", "test_job_results"), { numRuns: P2_RUNS });
    },
    SLOW,
  );

  // d ──────────────────────────────────────────────────────────────────────────────────────────
  it(
    `d. an always-failing handler runs ${RETRY_LIMIT + 1} times with increasing jittered delays, then lands in test.always-fails.dlq`,
    async () => {
      const batchId = randomUUID();
      const id = (await tx((q) =>
        enqueueInTx(q, "test.always-fails", {}, { batchId, packRef: PACK, step: "s", chunk: 0 }),
      )) as string;
      const dead = await waitFor(
        "the dead-letter copy",
        async () => {
          const res = await t.db.execute<{ id: string; source_id: string }>(
            sql`select id, source_id from pgboss.job where name = 'test.always-fails.dlq' and source_id = ${id}`,
          );
          return res.rows[0];
        },
        40_000,
      );
      expect(dead.source_id).toBe(id);
      expect(await jobState(t.db, id)).toBe("failed");

      const list = attempts.get(id) ?? [];
      expect(list).toHaveLength(RETRY_LIMIT + 1);
      // The wait pg-boss scheduled after each failed attempt: next start_after - this throw.
      const delays = list.slice(1).map((a, i) => a.startAfter - (list[i] as Attempt).thrownAt);
      console.log(`d. retry delays (ms) after attempts 1..3: ${delays.join(", ")}`);
      expect(delays).toHaveLength(3);
      for (let i = 1; i < delays.length; i++) {
        expect(delays[i] as number).toBeGreaterThan(delays[i - 1] as number);
      }
      expect(new Set(delays).size).toBe(3);
      // Exponential with jitter, R = 1 s: the n-th wait lies in [R·2^(n-1), R·2^n] (+ scheduling slack).
      delays.forEach((d, i) => {
        expect(d).toBeGreaterThanOrEqual(1000 * 2 ** i - 50);
        expect(d).toBeLessThanOrEqual(1000 * 2 ** (i + 1) + 250);
      });
    },
    SLOW,
  );

  // e ──────────────────────────────────────────────────────────────────────────────────────────
  it(
    "e. enqueuing the same (batch, pack, step, chunk) twice creates one job",
    async () => {
      closeGate();
      const batchId = randomUUID();
      const key = { batchId, packRef: PACK, step: "structure", chunk: 7 };
      // Twice in one transaction.
      const [a, b] = await tx(async (q) => [
        await enqueueInTx(q, "test.gated", { n: 1 }, key),
        await enqueueInTx(q, "test.gated", { n: 2 }, key),
      ]);
      expect(a).not.toBeNull();
      expect(b).toBeNull();
      // Again in a later transaction while the first is active.
      await waitFor("the gated job to start", async () =>
        gateRuns.includes(a as string) ? true : undefined,
      );
      const c = await tx((q) => enqueueInTx(q, "test.gated", { n: 3 }, key));
      expect(c).toBeNull();
      expect((await jobsOfBatch(t.db, batchId)).map((j) => j.id)).toEqual([a]);
      // Another chunk of the same batch is a different key.
      const other = await tx((q) => enqueueInTx(q, "test.gated", { n: 4 }, { ...key, chunk: 8 }));
      expect(other).not.toBeNull();
      openGate();
      await completed(a as string);
      await completed(other as string);
    },
    SLOW,
  );

  // AC 3 ───────────────────────────────────────────────────────────────────────────────────────
  it(
    "AC 3: getBatchProgress counts records in three statuses and queued, active, failed and dead jobs",
    async () => {
      const { batchId } = await seedBatch(t.db, [
        "pending",
        "pending",
        "proposed",
        "approved",
        "approved",
        "approved",
      ]);
      closeGate();
      const key = (kind: string, chunk: number) => ({ batchId, packRef: PACK, step: kind, chunk });
      const dead = (await tx((q) =>
        enqueueInTx(q, "test.always-fails", {}, key("dead", 0)),
      )) as string;
      const retrying = (await tx((q) =>
        enqueueInTx(q, "test.fails-slow", {}, key("retrying", 0)),
      )) as string;
      const active = (await tx((q) =>
        enqueueInTx(q, "test.gated", { n: 1 }, key("gated", 0)),
      )) as string;
      await waitFor("the gated job to start", async () =>
        gateRuns.includes(active) ? true : undefined,
      );
      // One worker per kind, busy with `active`: this one stays queued.
      const queued = (await tx((q) =>
        enqueueInTx(q, "test.gated", { n: 2 }, key("gated", 1)),
      )) as string;
      await waitFor("the slow job to wait for its retry", async () =>
        (await jobState(t.db, retrying)) === "retry" ? true : undefined,
      );
      await waitFor(
        "the failing job to dead-letter",
        async () => ((await jobState(t.db, dead)) === "failed" ? true : undefined),
        40_000,
      );

      const progress = await tx((q) => getBatchProgress(q, batchId));
      expect(progress.batchId).toBe(batchId);
      expect(progress.records).toMatchObject({ pending: 2, proposed: 1, approved: 3 });
      expect(Object.values(progress.records).reduce((s, n) => s + n, 0)).toBe(6);
      expect(progress.jobs).toEqual({ queued: 1, active: 1, failed: 1, dead: 1 });
      expect(await jobState(t.db, queued)).toBe("created");

      // Another batch's progress is untouched by these jobs.
      const empty = await tx((q) => getBatchProgress(q, randomUUID()));
      expect(empty.jobs).toEqual({ queued: 0, active: 0, failed: 0, dead: 0 });
      expect(Object.values(empty.records).every((n) => n === 0)).toBe(true);

      openGate();
      await completed(active);
      await completed(queued);
    },
    SLOW,
  );
});
