/** A finite state machine given by its drawn edges; every other move throws `IllegalTransition`. */
export type MachineName = "batch" | "record";

export class IllegalTransition extends Error {
  override readonly name = "IllegalTransition";
  constructor(
    readonly machine: MachineName,
    readonly from: string,
    readonly to: string,
  ) {
    super(`Illegal ${machine} transition: ${from} → ${to}`);
  }
}

export interface Machine<S extends string> {
  readonly name: MachineName;
  readonly states: readonly S[];
  readonly edges: readonly (readonly [S, S])[];
  canTransition(from: S, to: S): boolean;
  /** Returns `to` when the move is drawn; throws `IllegalTransition` otherwise. */
  transition(from: S, to: S): S;
}

export function defineMachine<S extends string>(
  name: MachineName,
  states: readonly S[],
  edges: readonly (readonly [S, S])[],
): Machine<S> {
  const allowed = new Set(edges.map(([f, t]) => `${f}\u0000${t}`));
  const known = new Set<string>(states);
  const canTransition = (from: S, to: S): boolean =>
    known.has(from) && known.has(to) && allowed.has(`${from}\u0000${to}`);
  return Object.freeze({
    name,
    states,
    edges,
    canTransition,
    transition(from: S, to: S): S {
      if (!canTransition(from, to)) throw new IllegalTransition(name, String(from), String(to));
      return to;
    },
  });
}
