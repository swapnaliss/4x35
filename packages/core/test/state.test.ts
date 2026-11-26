/**
 * Batch and Record state machines: an exhaustive table test over every ordered state pair, and
 * properties P7 (P-batch-transitions) and P8 (P-record-transitions), each run against a planted
 * bug. The drawn edges are restated here from docs/architecture.md §2, independently of src/.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BATCH_STATES,
  type BatchStatus,
  IllegalTransition,
  RECORD_STATES,
  type RecordStatus,
  transitionBatch,
  transitionRecord,
} from "../src/index.js";
import { NUM_RUNS } from "./arbitraries.js";

const ACTIVE: BatchStatus[] = [
  "uploaded",
  "parsing",
  "parsed",
  "structuring",
  "ready_for_review",
  "reviewed",
];

/** docs/architecture.md §2, Batch (purge needs purgeEligible). */
const DRAWN_BATCH = new Set<string>([
  "uploaded>parsing",
  "parsing>parsed",
  "parsed>structuring",
  "structuring>ready_for_review",
  "ready_for_review>reviewed",
  "reviewed>ready_for_review",
  "reviewed>exported",
  "exported>exported",
  ...ACTIVE.map((s) => `${s}>failed`),
]);
const PURGEABLE = new Set<BatchStatus>(BATCH_STATES.filter((s) => s !== "purged"));

function batchDrawn(from: BatchStatus, to: BatchStatus, purgeEligible: boolean): boolean {
  if (to === "purged") return purgeEligible && PURGEABLE.has(from);
  return DRAWN_BATCH.has(`${from}>${to}`);
}

/** docs/architecture.md §2, Record. */
const DRAWN_RECORD = new Set<string>([
  "pending>proposed",
  "proposed>auto_approvable",
  "proposed>needs_review",
  "proposed>already_valid",
  "auto_approvable>approved",
  "auto_approvable>edited",
  "auto_approvable>unknown",
  "needs_review>approved",
  "needs_review>edited",
  "needs_review>unknown",
  "approved>needs_review",
  "edited>needs_review",
  "unknown>needs_review",
]);

type BatchFn = typeof transitionBatch;
type RecordFn = typeof transitionRecord;

function outcome<T>(f: () => T): { ok: true; value: T } | { ok: false; error: unknown } {
  try {
    return { ok: true, value: f() };
  } catch (error) {
    return { ok: false, error };
  }
}

function expectCaught<T>(name: string, property: fc.IProperty<T>, seed: number) {
  const result = fc.check(property, { numRuns: NUM_RUNS, seed });
  expect(result.failed, `${name}: the planted bug was not caught`).toBe(true);
  console.log(
    `${name}: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample=${JSON.stringify(result.counterexample)}`,
  );
}

describe("Batch state machine: exhaustive table", () => {
  const pairs = BATCH_STATES.flatMap((from) =>
    BATCH_STATES.flatMap((to) => [false, true].map((eligible) => [from, to, eligible] as const)),
  );
  it.each(pairs)("%s → %s (purgeEligible %s)", (from, to, eligible) => {
    const r = outcome(() => transitionBatch(from, to, { purgeEligible: eligible }));
    if (batchDrawn(from, to, eligible)) {
      expect(r).toEqual({ ok: true, value: to });
    } else {
      expect(r.ok).toBe(false);
      const e = (r as { error: unknown }).error;
      expect(e).toBeInstanceOf(IllegalTransition);
      expect(e).toMatchObject({ machine: "batch", from, to });
    }
  });

  it("counts 8 + 6 + 8 drawn moves", () => {
    expect(pairs.filter(([f, t, e]) => e && batchDrawn(f, t, e)).length).toBe(22);
  });
});

describe("Record state machine: exhaustive table", () => {
  const pairs = RECORD_STATES.flatMap((from) => RECORD_STATES.map((to) => [from, to] as const));
  it.each(pairs)("%s → %s", (from, to) => {
    const r = outcome(() => transitionRecord(from, to));
    if (DRAWN_RECORD.has(`${from}>${to}`)) {
      expect(r).toEqual({ ok: true, value: to });
    } else {
      expect(r.ok).toBe(false);
      const e = (r as { error: unknown }).error;
      expect(e).toBeInstanceOf(IllegalTransition);
      expect(e).toMatchObject({ machine: "record", from, to });
    }
  });
});

// P7 ───────────────────────────────────────────────────────────────────────────────────────────
const batchTransitions = (transition: BatchFn) =>
  fc.property(
    fc.constantFrom(...BATCH_STATES),
    fc.constantFrom(...BATCH_STATES),
    fc.boolean(),
    (from, to, purgeEligible) => {
      const r = outcome(() => transition(from, to, { purgeEligible }));
      return batchDrawn(from, to, purgeEligible)
        ? r.ok && r.value === to
        : !r.ok && r.error instanceof IllegalTransition;
    },
  );

/** Planted bug (design.md): `uploaded → uploaded` succeeds. */
const batchAllowingSelfUpload: BatchFn = (from, to, options) =>
  from === "uploaded" && to === "uploaded" ? to : transitionBatch(from, to, options);

describe("P7 batch-transitions (P-batch-transitions)", () => {
  it(`P-batch-transitions: exactly the drawn Batch moves succeed, every other pair throws IllegalTransition (${NUM_RUNS} runs)`, () => {
    fc.assert(batchTransitions(transitionBatch), { numRuns: NUM_RUNS });
  });

  it("P-batch-transitions catches planted bug: uploaded → uploaded allowed", () => {
    expectCaught("P-batch-transitions", batchTransitions(batchAllowingSelfUpload), 1107);
  });
});

// P8 ───────────────────────────────────────────────────────────────────────────────────────────
const recordTransitions = (transition: RecordFn) =>
  fc.property(fc.constantFrom(...RECORD_STATES), fc.constantFrom(...RECORD_STATES), (from, to) => {
    const r = outcome(() => transition(from, to));
    return DRAWN_RECORD.has(`${from}>${to}`)
      ? r.ok && r.value === to
      : !r.ok && r.error instanceof IllegalTransition;
  });

/** Planted bug (design.md): `already_valid → needs_review` treated like a reopen. */
const recordReopeningAlreadyValid: RecordFn = (from: RecordStatus, to: RecordStatus) =>
  from === "already_valid" && to === "needs_review" ? to : transitionRecord(from, to);

describe("P8 record-transitions (P-record-transitions)", () => {
  it(`P-record-transitions: exactly the drawn Record moves succeed, every other pair throws IllegalTransition (${NUM_RUNS} runs)`, () => {
    fc.assert(recordTransitions(transitionRecord), { numRuns: NUM_RUNS });
  });

  it("P-record-transitions catches planted bug: already_valid → needs_review allowed", () => {
    expectCaught("P-record-transitions", recordTransitions(recordReopeningAlreadyValid), 1108);
  });
});
