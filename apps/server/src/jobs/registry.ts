// Job registry (ADR 0006, M1-04): `defineJob({kind, schema, handler})`. Product job kinds (parse,
// structure, report, export) are registered by M1-07 and M2; tests register their own kinds in the
// test file. Every kind gets a pg-boss queue `<kind>` and a dead-letter queue `<kind>.dlq`.
import type { Tx } from "@4x35/db";
import { z } from "zod";

/** Attempts after the first one: 4 attempts in total, then the dead-letter queue. */
export const RETRY_LIMIT = 3;
/**
 * Base retry delay R in seconds. pg-boss's `retryBackoff` waits `R·2^n/2 + R·2^n/2·random()`
 * after the n-th failed attempt (n = 1, 2, 3), so the waits lie in [R, 2R], [2R, 4R], [4R, 8R]:
 * exponential, jittered and increasing (`.kiro/specs/jobs/design.md`, retry decision).
 */
export const DEFAULT_RETRY_DELAY_SECONDS = 2;
/** Suffix of every dead-letter queue. */
export const DLQ_SUFFIX = ".dlq";

/** The idempotency key of one job: a step of one pack over one chunk of one batch (ADR 0006). */
export const JobKey = z.object({
  batchId: z.uuid(),
  /** `<packId>@<version>`, or any non-empty pack reference the step uses. */
  packRef: z.string().min(1).max(200),
  step: z.string().regex(/^[a-z][a-z0-9_.-]{0,62}$/),
  chunk: z.number().int().min(0),
});
export type JobKey = z.infer<typeof JobKey>;

/** What a handler receives. It writes its results through `tx` by upsert keyed on (record, pack ref, step). */
export interface JobContext<P> {
  readonly tx: Tx;
  readonly payload: P;
  readonly jobId: string;
  readonly key: JobKey;
}

export interface JobSpec<S extends z.ZodType> {
  /** Queue name: lower case, digits, `_`, `-`, `.`; never ending in `.dlq`. */
  readonly kind: string;
  /** Validates the payload at enqueue time and again before the handler runs. */
  readonly schema: S;
  readonly handler: (ctx: JobContext<z.infer<S>>) => Promise<void>;
  /** Base retry delay R in seconds (integer >= 1). Default `DEFAULT_RETRY_DELAY_SECONDS`. */
  readonly retryDelaySeconds?: number;
}

export interface JobDefinition {
  readonly kind: string;
  readonly deadLetter: string;
  readonly retryLimit: number;
  readonly retryDelaySeconds: number;
  readonly schema: z.ZodType;
  readonly handler: (ctx: JobContext<unknown>) => Promise<void>;
}

const KIND = /^[a-z][a-z0-9_.-]{0,62}$/;
const definitions = new Map<string, JobDefinition>();

/** Registers a job kind. Throws on an invalid or already registered kind. */
export function defineJob<S extends z.ZodType>(spec: JobSpec<S>): JobDefinition {
  if (!KIND.test(spec.kind) || spec.kind.endsWith(DLQ_SUFFIX)) {
    throw new Error(`defineJob: invalid kind "${spec.kind}"`);
  }
  if (definitions.has(spec.kind)) throw new Error(`defineJob: "${spec.kind}" is already defined`);
  const retryDelaySeconds = spec.retryDelaySeconds ?? DEFAULT_RETRY_DELAY_SECONDS;
  if (!Number.isInteger(retryDelaySeconds) || retryDelaySeconds < 1) {
    throw new Error(`defineJob: retryDelaySeconds must be an integer >= 1`);
  }
  const def: JobDefinition = {
    kind: spec.kind,
    deadLetter: `${spec.kind}${DLQ_SUFFIX}`,
    retryLimit: RETRY_LIMIT,
    retryDelaySeconds,
    schema: spec.schema,
    handler: spec.handler as (ctx: JobContext<unknown>) => Promise<void>,
  };
  definitions.set(spec.kind, def);
  return def;
}

/** The registered definition of `kind`; throws when there is none. */
export function getJob(kind: string): JobDefinition {
  const def = definitions.get(kind);
  if (!def) throw new Error(`jobs: no job kind "${kind}" is defined`);
  return def;
}

/** Every registered definition, in registration order. */
export function listJobs(): readonly JobDefinition[] {
  return [...definitions.values()];
}

/** Correlation metadata stored beside the payload (M1-05): ids only, never content. */
export const JobMeta = z.object({
  requestId: z
    .string()
    .regex(/^[A-Za-z0-9-]{8,64}$/)
    .optional(),
});
export type JobMeta = z.infer<typeof JobMeta>;

/**
 * The data pg-boss stores for a job: its key (for progress and dedup), its payload, and the
 * correlation metadata (`meta.requestId`: the request that enqueued it).
 */
export const JobData = z.object({ key: JobKey, payload: z.unknown(), meta: JobMeta.optional() });
export type JobData = z.infer<typeof JobData>;
