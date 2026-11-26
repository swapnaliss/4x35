/**
 * P1 P-chunking-covers-once (.kiro/specs/jobs/design.md, M1-04): for any list of up to 20,000
 * record IDs, `chunk(ids, 200)` gives chunks of at most 200 that cover every ID exactly once, in
 * order. Run against a planted bug first (an off-by-one that drops the last id of each full chunk).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CHUNK_SIZE, chunk } from "../src/index.js";

/** numRuns: FC_NUM_RUNS, never below the ticket's 500. */
const NUM_RUNS = Math.max(500, Number(process.env.FC_NUM_RUNS ?? 0) || 0);

/** R2's ceiling: a batch holds up to 20,000 records. */
const MAX_IDS = 20_000;

/**
 * Record IDs as the pipeline sees them: distinct UUIDs (records.id). Lengths are drawn so that
 * the chunk boundaries (0, 1, 199, 200, 201, multiples of 200 and their neighbours, 20,000) come
 * up often, not only by chance. IDs are derived from one UUID by an index suffix to keep 20,000
 * draws cheap while staying distinct.
 */
const boundaryLength = fc.oneof(
  fc.constantFrom(0, 1, 199, 200, 201, 399, 400, 401, 19_999, MAX_IDS),
  fc
    .tuple(fc.integer({ min: 1, max: 100 }), fc.constantFrom(-1, 0, 1))
    .map(([k, d]) => k * CHUNK_SIZE + d),
  fc.integer({ min: 0, max: MAX_IDS }),
);
const recordIds = fc
  .tuple(fc.uuid({ version: 4 }), boundaryLength)
  .map(([base, n]) =>
    Array.from(
      { length: Math.min(n, MAX_IDS) },
      (_, i) => `${base.slice(0, 24)}${i.toString(16).padStart(12, "0")}`,
    ),
  );

type Chunker = (ids: readonly string[], size: number) => string[][];

const coversOnce = (chunker: Chunker) =>
  fc.property(recordIds, (ids) => {
    const chunks = chunker(ids, CHUNK_SIZE);
    for (const c of chunks) {
      if (c.length === 0 || c.length > CHUNK_SIZE) return false;
    }
    // Every chunk but the last is full, so the split is the fewest chunks.
    if (chunks.length !== Math.ceil(ids.length / CHUNK_SIZE)) return false;
    const flat = chunks.flat();
    if (flat.length !== ids.length) return false;
    return flat.every((id, i) => id === ids[i]);
  });

/** Planted bug: a slice end that is one short, so the last id of every full chunk is lost. */
const chunkDroppingLast: Chunker = (ids, size) => {
  const out: string[][] = [];
  for (let start = 0; start < ids.length; start += size)
    out.push(ids.slice(start, start + size - 1));
  return out.filter((c) => c.length > 0);
};

describe("P1 P-chunking-covers-once", () => {
  it("catches a planted bug (slice end one short)", () => {
    const result = fc.check(coversOnce(chunkDroppingLast), { numRuns: NUM_RUNS, seed: 4041 });
    expect(result.failed, "P-chunking-covers-once: the planted bug was not caught").toBe(true);
    const ce = result.counterexample?.[0];
    console.log(
      `P-chunking-covers-once: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample length=${ce?.length}`,
    );
  });

  it(`P-chunking-covers-once: chunks of <= ${CHUNK_SIZE} cover every id once, in order (${NUM_RUNS} runs)`, () => {
    fc.assert(coversOnce(chunk), { numRuns: NUM_RUNS });
  });

  it("an empty list gives no chunks; 401 ids give 200, 200, 1", () => {
    expect(chunk([])).toEqual([]);
    const ids = Array.from({ length: 401 }, (_, i) => i);
    expect(chunk(ids).map((c) => c.length)).toEqual([200, 200, 1]);
  });

  it("rejects a size that is not a positive integer", () => {
    expect(() => chunk([1], 0)).toThrow(RangeError);
    expect(() => chunk([1], 1.5)).toThrow(RangeError);
  });
});
