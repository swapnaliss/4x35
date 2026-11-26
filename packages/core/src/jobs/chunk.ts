/**
 * Chunking for the job pipeline (ADR 0006, M1-04): work is split into chunks of at most
 * `CHUNK_SIZE` records, and each chunk becomes one job. Pure: no I/O.
 */

/** Records per job chunk (ADR 0006; M0-09 measured a 200-row chunk insert at 11.7 ms median). */
export const CHUNK_SIZE = 200;

/**
 * Splits `ids` into consecutive chunks of at most `size` items, in order. Every id lands in exactly
 * one chunk; only the last chunk can be shorter. An empty list gives no chunks.
 * Throws `RangeError` when `size` is not a positive integer.
 */
export function chunk<T>(ids: readonly T[], size: number = CHUNK_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`chunk size must be a positive integer, got ${size}`);
  }
  const out: T[][] = [];
  for (let start = 0; start < ids.length; start += size) {
    out.push(ids.slice(start, start + size));
  }
  return out;
}
