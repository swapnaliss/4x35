/**
 * The Record state machine, as drawn in docs/architecture.md §2:
 *
 *   pending → proposed → auto_approvable | needs_review | already_valid
 *   auto_approvable | needs_review → approved | edited | unknown
 *   approved | edited | unknown → needs_review   (reopen)
 */
import { defineMachine } from "./machine.js";

export const RECORD_STATES = [
  "pending",
  "proposed",
  "auto_approvable",
  "needs_review",
  "already_valid",
  "approved",
  "edited",
  "unknown",
] as const;

export type RecordStatus = (typeof RECORD_STATES)[number];

const DECIDED = ["approved", "edited", "unknown"] as const satisfies readonly RecordStatus[];

export const RECORD_EDGES: readonly (readonly [RecordStatus, RecordStatus])[] = Object.freeze([
  ["pending", "proposed"],
  ["proposed", "auto_approvable"],
  ["proposed", "needs_review"],
  ["proposed", "already_valid"],
  ...DECIDED.map((d) => ["auto_approvable", d] as const),
  ...DECIDED.map((d) => ["needs_review", d] as const),
  ...DECIDED.map((d) => [d, "needs_review"] as const),
]);

export const recordMachine = defineMachine("record", RECORD_STATES, RECORD_EDGES);

/** Move a record from `from` to `to`; throws `IllegalTransition` for a move not drawn. */
export function transitionRecord(from: RecordStatus, to: RecordStatus): RecordStatus {
  return recordMachine.transition(from, to);
}

export function canTransitionRecord(from: RecordStatus, to: RecordStatus): boolean {
  return recordMachine.canTransition(from, to);
}
