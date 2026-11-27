// Batch progress (M1-04): the one query the status endpoint (M1-07) polls. Record counts per status
// come from `records`; job counts from pg-boss's `job` table, selected by the `<batchId>/` prefix of
// the singletonKey that `enqueueInTx` sets.
import { RECORD_STATES, type RecordStatus } from "@4x35/core";
import { forWorkspace, type Tx } from "@4x35/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { BOSS_SCHEMA } from "./boss.js";
import { DLQ_SUFFIX } from "./registry.js";

export interface JobCounts {
  /** Created and waiting to run. */
  readonly queued: number;
  /** Running now. */
  readonly active: number;
  /** Failed an attempt and waiting for a retry. */
  readonly failed: number;
  /** Failed its last attempt: moved to `<kind>.dlq`. */
  readonly dead: number;
}

export interface BatchProgress {
  readonly batchId: string;
  /** Every record status, zero when no record has it. */
  readonly records: Readonly<Record<RecordStatus, number>>;
  readonly jobs: JobCounts;
}

/**
 * Counts for one batch of `workspaceId`, or undefined when the batch is not in that workspace
 * (M1-03: the batch is looked up through the workspace-scoped repository first, so another
 * workspace's batch id reveals nothing, not even job counts).
 */
export async function getBatchProgress(
  tx: Tx,
  workspaceId: string,
  batchId: string,
): Promise<BatchProgress | undefined> {
  z.uuid().parse(batchId);
  const repos = forWorkspace({ workspaceId }, tx);
  if ((await repos.batches.get(batchId)) === undefined) return undefined;
  const rows = await repos.records.countByStatus(batchId);
  const records = Object.fromEntries(RECORD_STATES.map((s) => [s, 0])) as Record<
    RecordStatus,
    number
  >;
  for (const r of rows) records[r.status as RecordStatus] = r.n;

  // Work queues only: a dead-letter copy is counted once, as `dead`, through its failed original.
  const job = sql.raw(`${BOSS_SCHEMA}.job`);
  const result = await tx.execute<{
    queued: number;
    active: number;
    failed: number;
    dead: number;
  }>(sql`
    select
      count(*) filter (where state = 'created')::int as queued,
      count(*) filter (where state = 'active')::int  as active,
      count(*) filter (where state = 'retry')::int   as failed,
      count(*) filter (where state = 'failed')::int  as dead
    from ${job}
    where singleton_key like ${`${batchId}/%`}
      and right(name, ${DLQ_SUFFIX.length}) <> ${DLQ_SUFFIX}`);
  const j = result.rows[0] ?? { queued: 0, active: 0, failed: 0, dead: 0 };
  return {
    batchId,
    records,
    jobs: { queued: j.queued, active: j.active, failed: j.failed, dead: j.dead },
  };
}
