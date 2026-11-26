// Job observability (M1-05): every attempt of every job runs inside this wrapper.
//   - a child logger bound to `jobId` and the originating `requestId` (from the job data's `meta`),
//     installed as the current context so a job that enqueues more jobs passes the id on
//   - one `job_timings` row per attempt: `completed`, `failed` (a retry follows) or `dead_letter`
//     (the last attempt failed; pg-boss copies the job to `<kind>.dlq`)
//   - one `job attempt` log line with the allow-listed job fields; a failure logs its class only
// The timing row is written after the handler's transaction, on its own, so a failed attempt
// (whose transaction rolled back) still leaves its row.
import { type Database, schema } from "@4x35/db";
import type { Logger } from "./logger.js";
import { runWithContext } from "./request-id.js";

export type JobOutcome = "completed" | "failed" | "dead_letter";

export interface AttemptInfo {
  readonly kind: string;
  /** The pg-boss job id. */
  readonly jobId: string;
  /** pg-boss `retryCount` of this attempt: 0 on the first attempt. */
  readonly retryCount: number;
  /** Retries after the first attempt; when `retryCount` reaches it, this attempt is the last. */
  readonly retryLimit: number;
  readonly batchId: string | null;
  readonly chunk: number | null;
  /** The request that enqueued the job (or the job's ancestor), if any. */
  readonly requestId: string | null;
}

/** The outcome of an attempt that threw. */
export function failureOutcome(retryCount: number, retryLimit: number): JobOutcome {
  return retryCount >= retryLimit ? "dead_letter" : "failed";
}

/**
 * Runs one attempt of a job under observation. Rethrows the handler's error unchanged, so pg-boss
 * retries or dead-letters as configured. A failure to write the timing row is logged, never thrown.
 */
export async function observeAttempt(
  db: Database,
  logger: Logger,
  info: AttemptInfo,
  run: () => Promise<void>,
): Promise<void> {
  const log = logger.child(
    info.requestId === null
      ? { jobId: info.jobId }
      : { jobId: info.jobId, requestId: info.requestId },
  );
  const job = {
    kind: info.kind,
    jobId: info.jobId,
    batchId: info.batchId ?? undefined,
    chunk: info.chunk ?? undefined,
    attempt: info.retryCount + 1,
  };
  const started = performance.now();
  let outcome: JobOutcome = "completed";
  let failed = false;
  let failure: unknown;
  try {
    await runWithContext({ requestId: info.requestId, log }, run);
  } catch (err) {
    outcome = failureOutcome(info.retryCount, info.retryLimit);
    failed = true;
    failure = err;
  }
  const ms = Math.max(0, Math.round(performance.now() - started));
  try {
    await db.insert(schema.jobTimings).values({
      jobId: info.jobId,
      kind: info.kind,
      batchId: info.batchId,
      chunk: info.chunk,
      ms,
      outcome,
    });
  } catch (err) {
    log.error({ job: { ...job, outcome, ms }, err }, "job timing not recorded");
  }
  if (!failed) {
    log.info({ job: { ...job, outcome, ms } }, "job attempt");
    return;
  }
  log[outcome === "dead_letter" ? "error" : "warn"](
    { job: { ...job, outcome, ms }, err: failure },
    "job attempt",
  );
  throw failure;
}
