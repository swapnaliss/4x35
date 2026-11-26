// pg-boss runtime (ADR 0006, M1-04): one instance per process, in the same Postgres as the app.
//   MODE=worker | all  full instance: maintenance, cron, and one worker per registered job kind
//   MODE=web           send-only instance: no workers, no maintenance, no cron; it can still
//                      enqueue (enqueueInTx), because a web request's state change enqueues its job
import { type Database, withTx } from "@4x35/db";
import { PgBoss } from "pg-boss";
import type { Mode } from "../env.js";
import { JobData, type JobDefinition, listJobs } from "./registry.js";

/** pg-boss's schema (its default). `getBatchProgress` reads `pgboss.job`. */
export const BOSS_SCHEMA = "pgboss";
/** SIGTERM drain: active jobs get up to 25 s to finish (Render sends SIGKILL at 30 s). */
export const STOP_TIMEOUT_MS = 25_000;

export interface StartBossOptions {
  readonly connectionString: string;
  readonly mode: Mode;
  /** The app's Drizzle client: each handler runs in its own transaction on it. */
  readonly db: Database;
  /** How often an idle worker polls, in seconds (>= 0.5). Default 2 (pg-boss's default). */
  readonly pollingIntervalSeconds?: number;
  /** Connections in pg-boss's own pool. Default 4. */
  readonly poolMax?: number;
  /** pg-boss `error` events (a lost connection, a failed maintenance pass). Default: stderr. */
  readonly onError?: (err: Error) => void;
}

export interface JobRuntime {
  readonly boss: PgBoss;
  /** True when this instance runs workers (MODE worker or all). */
  readonly runsWorkers: boolean;
  /** pg-boss worker ids, one per registered kind; empty for MODE=web. */
  readonly workerIds: readonly string[];
  /** Graceful stop: stops fetching, lets active jobs finish up to 25 s, closes the pool. */
  stop(): Promise<void>;
}

let active: PgBoss | null = null;

/** The running instance that `enqueueInTx` sends through; throws when none is started. */
export function activeBoss(): PgBoss {
  if (!active) throw new Error("jobs: pg-boss is not started (startBoss)");
  return active;
}

/** True when this mode runs pg-boss workers. `MODE=web` only enqueues. */
export function runsWorkers(mode: Mode): boolean {
  return mode !== "web";
}

/** Creates `<kind>.dlq`, then `<kind>` (policy `exclusive`, 3 retries with backoff, dead letter). */
async function ensureQueues(boss: PgBoss, def: JobDefinition): Promise<void> {
  await boss.createQueue(def.deadLetter);
  const options = {
    retryLimit: def.retryLimit,
    retryDelay: def.retryDelaySeconds,
    retryBackoff: true,
    deadLetter: def.deadLetter,
  };
  await boss.createQueue(def.kind, { ...options, policy: "exclusive" });
  // createQueue leaves an existing queue as it is; bring its retry settings up to date.
  await boss.updateQueue(def.kind, options);
}

/** Runs one job: validate its data, then the handler in its own transaction. */
async function runJob(db: Database, def: JobDefinition, id: string, raw: unknown): Promise<void> {
  const data = JobData.parse(raw);
  const payload = def.schema.parse(data.payload);
  await withTx(db, (tx) => def.handler({ tx, payload, jobId: id, key: data.key }));
}

/** Starts pg-boss for `mode` and registers every defined job kind. One runtime per process. */
export async function startBoss(options: StartBossOptions): Promise<JobRuntime> {
  if (active) throw new Error("jobs: pg-boss is already started in this process");
  const workers = runsWorkers(options.mode);
  const boss = new PgBoss({
    connectionString: options.connectionString,
    schema: BOSS_SCHEMA,
    max: options.poolMax ?? 4,
    application_name: `4x35-${options.mode}`,
    supervise: workers,
    schedule: workers,
    migrate: true,
  });
  const onError = options.onError ?? ((err: Error) => process.stderr.write(`${err.message}\n`));
  boss.on("error", onError);
  await boss.start();
  const workerIds: string[] = [];
  try {
    for (const def of listJobs()) {
      await ensureQueues(boss, def);
      if (!workers) continue;
      const id = await boss.work<unknown>(
        def.kind,
        { batchSize: 1, pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2 },
        async (jobs) => {
          for (const job of jobs) await runJob(options.db, def, job.id, job.data);
        },
      );
      workerIds.push(id);
    }
  } catch (err) {
    await boss.stop({ graceful: false, close: true });
    throw err;
  }
  active = boss;
  let stopping: Promise<void> | null = null;
  return {
    boss,
    runsWorkers: workers,
    workerIds,
    stop() {
      stopping ??= (async () => {
        try {
          await boss.stop({ graceful: true, close: true, timeout: STOP_TIMEOUT_MS });
        } finally {
          if (active === boss) active = null;
        }
      })();
      return stopping;
    },
  };
}
