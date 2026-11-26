// Enqueue in the state-change transaction (ADR 0006, M1-04): pg-boss inserts the job through the
// caller's Drizzle transaction, so a rolled-back state change leaves no job behind.
import { chunk } from "@4x35/core";
import type { Tx } from "@4x35/db";
import { sql } from "drizzle-orm";
import { type Db, fromDrizzle } from "pg-boss";
import { currentContext } from "../obs/request-id.js";
import { activeBoss } from "./boss.js";
import { getJob, type JobData, JobKey } from "./registry.js";

/**
 * pg-boss's database executor over a Drizzle transaction (pg-boss's own `fromDrizzle` adapter):
 * every statement runs inside `tx`, with its values bound as parameters.
 */
export function txExecutor(tx: Tx): Db {
  return fromDrizzle(tx, sql);
}

/**
 * The pg-boss `singletonKey` of a job key: `<batchId>/<base64url(packRef)>/<step>/<chunk>`.
 * pg-boss keys allow only `[\w.\-/]`, so the free-form pack reference is base64url-encoded.
 * `getBatchProgress` selects a batch's jobs by the `<batchId>/` prefix.
 */
export function singletonKey(key: JobKey): string {
  const pack = Buffer.from(key.packRef, "utf8").toString("base64url");
  return `${key.batchId}/${pack}/${key.step}/${key.chunk}`;
}

/**
 * Enqueues one `kind` job inside `tx`. The payload is validated against the kind's schema first.
 * The current request's id (M1-05) is stored as `meta.requestId`, so the job logs under it.
 * Returns the job id, or `null` when a job with the same key is already queued, retrying or active
 * (the queue policy is `exclusive` per key, so the same (batch, pack, step, chunk) runs once).
 */
export async function enqueueInTx(
  tx: Tx,
  kind: string,
  payload: unknown,
  key: JobKey,
): Promise<string | null> {
  const def = getJob(kind);
  const requestId = currentContext()?.requestId;
  const data: JobData = {
    key: JobKey.parse(key),
    payload: def.schema.parse(payload),
    ...(requestId ? { meta: { requestId } } : {}),
  };
  return activeBoss().send(kind, data, {
    singletonKey: singletonKey(data.key),
    db: txExecutor(tx),
  });
}

export interface FanOutOptions {
  /** The job kind to enqueue per chunk. */
  readonly kind: string;
  readonly packRef: string;
  /** Builds a chunk's payload from its ids. Default: `{ recordIds }`. */
  readonly payload?: (recordIds: string[], chunk: number) => unknown;
}

/**
 * Splits `ids` into chunks of 200 (`chunk` from core) and enqueues one `kind` job per chunk in `tx`,
 * keyed (batchId, packRef, step, chunk index). Returns the job ids (`null` for a key already queued).
 */
export async function fanOut(
  tx: Tx,
  batchId: string,
  step: string,
  ids: readonly string[],
  options: FanOutOptions,
): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  const chunks = chunk(ids);
  for (const [i, recordIds] of chunks.entries()) {
    const payload = options.payload ? options.payload(recordIds, i) : { recordIds };
    out.push(
      await enqueueInTx(tx, options.kind, payload, {
        batchId,
        packRef: options.packRef,
        step,
        chunk: i,
      }),
    );
  }
  return out;
}
