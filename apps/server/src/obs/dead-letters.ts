// Dead letters (M1-05): the jobs pg-boss copied to a `<kind>.dlq` queue after their last attempt
// failed (M1-04). Listed by kind, original job id, batch id, attempts and error class only: the job
// payload and the error message (which can quote it) are never selected. M1-08 exposes this at an
// owner-only route; `npm run jobs:dead-letters -w apps/server` prints it.
import type { Tx } from "@4x35/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { DLQ_SUFFIX } from "../jobs/registry.js";
import { errorClass } from "./logger.js";

export interface DeadLetter {
  /** The job kind (the original queue). */
  readonly kind: string;
  /** The original job's pg-boss id (`job_timings.job_id`). */
  readonly jobId: string;
  readonly batchId: string | null;
  /** Attempts made before dead-lettering (retries + 1). */
  readonly attempts: number;
  /** The class of the last error (`Error`, `ZodError`, …), never its message. */
  readonly errorClass: string;
  readonly deadAt: Date;
}

export const ListDeadLettersOptions = z.object({
  limit: z.number().int().min(1).max(1000).default(100),
});
export type ListDeadLettersOptions = z.input<typeof ListDeadLettersOptions>;

interface Row extends Record<string, unknown> {
  kind: string;
  job_id: string;
  batch_id: string | null;
  attempts: number;
  error_name: string | null;
  dead_at: Date | string;
}

/** Newest first. Returns `[]` when pg-boss has not installed its schema in this database yet. */
export async function listDeadLetters(
  tx: Tx,
  options: ListDeadLettersOptions = {},
): Promise<DeadLetter[]> {
  const { limit } = ListDeadLettersOptions.parse(options);
  const installed = await tx.execute<{ t: string | null }>(
    sql`select to_regclass('pgboss.job')::text as t`,
  );
  if (!installed.rows[0]?.t) return [];
  const res = await tx.execute<Row>(sql`
    select source_name as kind,
           source_id::text as job_id,
           data -> 'key' ->> 'batchId' as batch_id,
           coalesce(source_retry_count, 0) + 1 as attempts,
           source_output ->> 'name' as error_name,
           created_on as dead_at
      from pgboss.job
     where name like ${`%${DLQ_SUFFIX}`} and source_id is not null
     order by created_on desc, id
     limit ${limit}`);
  return res.rows.map((r) => ({
    kind: r.kind,
    jobId: r.job_id,
    batchId: r.batch_id,
    attempts: Number(r.attempts),
    errorClass: r.error_name === null ? "UnnamedError" : errorClass({ name: r.error_name }),
    deadAt: new Date(r.dead_at),
  }));
}

/** One tab-separated line per dead letter: kind, job id, batch id, attempts, error class. */
export function formatDeadLetters(list: readonly DeadLetter[]): string {
  const header = "kind\tjob_id\tbatch_id\tattempts\terror_class";
  const lines = list.map((d) =>
    [d.kind, d.jobId, d.batchId ?? "-", String(d.attempts), d.errorClass].join("\t"),
  );
  return `${[header, ...lines].join("\n")}\n`;
}
