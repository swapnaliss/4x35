/** Record: one party address in a batch (docs/architecture.md §2). Original lines are readonly. */
import { z } from "zod";
import { RECORD_STATES } from "../state/record.js";
import { CountryCodeSchema, IdSchema, NonEmptyString } from "./common.js";

/** Where the record sits in its source file. */
export const RecordLocationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cell"),
    sheet: z.string().nullable(),
    row: z.number().int().nonnegative(),
    columns: z.array(NonEmptyString).readonly(),
  }),
  z.object({
    kind: z.literal("xml"),
    xpath: NonEmptyString,
    byteStart: z.number().int().nonnegative(),
    byteEnd: z.number().int().nonnegative(),
  }),
  z.object({
    kind: z.literal("mt"),
    message: z.number().int().nonnegative(),
    field: NonEmptyString,
  }),
]);
export type RecordLocation = z.infer<typeof RecordLocationSchema>;

export const RecordStatusSchema = z.enum(RECORD_STATES);

export const RecordSchema = z
  .object({
    id: IdSchema,
    batchId: IdSchema,
    location: RecordLocationSchema.readonly(),
    partyRole: NonEmptyString,
    name: z.string().nullable(),
    originalLines: z.array(z.string()).readonly(),
    countryHint: CountryCodeSchema.nullable(),
    status: RecordStatusSchema,
    /** Optimistic concurrency version. */
    version: z.number().int().nonnegative(),
  })
  .readonly();
export type DomainRecord = z.infer<typeof RecordSchema>;
