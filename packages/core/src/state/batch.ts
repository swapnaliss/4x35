/**
 * The Batch state machine, as drawn in docs/architecture.md §2:
 *
 *   uploaded → parsing → parsed → structuring → ready_for_review ⇄ reviewed → exported
 *   (any active state) → failed(reason)      exported → exported (new Export row)
 *   (after 30 days, unless locked or a judge sandbox) → purged (tombstone)
 *
 * Active states are the non-terminal ones before an export: uploaded, parsing, parsed,
 * structuring, ready_for_review, reviewed. Any state but `purged` may move to `purged`, but only
 * when the caller says the batch is purge-eligible (30 days old, not locked, not a judge sandbox):
 * the core does no I/O, so it cannot read the clock or the lock itself.
 */
import { defineMachine, IllegalTransition } from "./machine.js";

export const BATCH_STATES = [
  "uploaded",
  "parsing",
  "parsed",
  "structuring",
  "ready_for_review",
  "reviewed",
  "exported",
  "failed",
  "purged",
] as const;

export type BatchStatus = (typeof BATCH_STATES)[number];

export const BATCH_ACTIVE_STATES = [
  "uploaded",
  "parsing",
  "parsed",
  "structuring",
  "ready_for_review",
  "reviewed",
] as const satisfies readonly BatchStatus[];

export const BATCH_EDGES: readonly (readonly [BatchStatus, BatchStatus])[] = Object.freeze([
  ["uploaded", "parsing"],
  ["parsing", "parsed"],
  ["parsed", "structuring"],
  ["structuring", "ready_for_review"],
  ["ready_for_review", "reviewed"],
  ["reviewed", "ready_for_review"],
  ["reviewed", "exported"],
  ["exported", "exported"],
  ...BATCH_ACTIVE_STATES.map((s) => [s, "failed"] as const),
  ...BATCH_STATES.filter((s) => s !== "purged").map((s) => [s, "purged"] as const),
]);

export const batchMachine = defineMachine("batch", BATCH_STATES, BATCH_EDGES);

export interface BatchTransitionOptions {
  /** Required (true) for `→ purged`: 30 days old, not locked, not a judge sandbox. */
  readonly purgeEligible?: boolean;
}

/** Move a batch from `from` to `to`; throws `IllegalTransition` for a move not drawn. */
export function transitionBatch(
  from: BatchStatus,
  to: BatchStatus,
  options: BatchTransitionOptions = {},
): BatchStatus {
  if (!canTransitionBatch(from, to, options)) throw new IllegalTransition("batch", from, to);
  return to;
}

export function canTransitionBatch(
  from: BatchStatus,
  to: BatchStatus,
  options: BatchTransitionOptions = {},
): boolean {
  if (to === "purged" && options.purgeEligible !== true) return false;
  return batchMachine.canTransition(from, to);
}
