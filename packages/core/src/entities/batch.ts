/** Batch: one upload (docs/architecture.md §2). Original bytes are immutable. */
import { z } from "zod";
import { BATCH_STATES } from "../state/batch.js";
import { IdSchema, NonEmptyString, PackRefSchema, Sha256HexSchema } from "./common.js";

export const BATCH_KINDS = ["master_list", "payment_file"] as const;
export const BATCH_FORMATS = ["csv", "xlsx", "pain001", "mt101"] as const;
export const TARGET_FORMS = ["structured", "hybrid"] as const;

export const BatchStatusSchema = z.enum(BATCH_STATES);

export const BatchSchema = z
  .object({
    id: IdSchema,
    workspaceId: IdSchema,
    kind: z.enum(BATCH_KINDS),
    format: z.enum(BATCH_FORMATS),
    original: z.instanceof(Uint8Array),
    sha256: Sha256HexSchema,
    encoding: NonEmptyString,
    delimiter: z.string().nullable(),
    eol: z.enum(["lf", "crlf", "cr"]).nullable(),
    columnMap: z.record(z.string(), z.string()).nullable(),
    pack: PackRefSchema,
    form: z.enum(TARGET_FORMS),
    status: BatchStatusSchema,
    failureReason: z.string().nullable(),
    locked: z.boolean(),
    createdBy: IdSchema,
    createdAt: z.date(),
    purgeAfter: z.date(),
  })
  .readonly();
export type Batch = z.infer<typeof BatchSchema>;
