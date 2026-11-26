/**
 * Properties P1 (P-never-invent), P2 (P-span-exact), P3 (P-transform-replays) and
 * P5 (P-not-auto-approvable) of .kiro/specs/domain-core/design.md. Each property is a function of
 * the implementation under test, so the same property is also run against one planted bug and
 * must fail on it (a property that never failed proves nothing).
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildProposal,
  type Field,
  isAutoApprovable,
  nfc,
  type Proposal,
  type Provenance,
  proposeField,
  recordInput,
  TRANSFORMS,
} from "../src/index.js";
import {
  elementRef,
  NUM_RUNS,
  nonEmptyId,
  originalLines,
  scenario,
  spanOf,
  transformDef,
  word,
} from "./arbitraries.js";
import { provesValue } from "./oracle.js";

const PACK = { id: "test-pack", version: "1.0.0" };
const RECORD_ID = "00000000-0000-4000-8000-000000000001";

type Build = typeof buildProposal;
type Propose = typeof proposeField;
type AutoApprovable = typeof isAutoApprovable;

/** Run `property` against a planted bug: it must fail. The seed and counterexample are logged. */
function expectCaught<T>(name: string, property: fc.IProperty<T>, seed: number) {
  const result = fc.check(property, { numRuns: NUM_RUNS, seed });
  expect(result.failed, `${name}: the planted bug was not caught`).toBe(true);
  console.log(
    `${name}: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample=${JSON.stringify(result.counterexample)}`,
  );
}

// P1 ───────────────────────────────────────────────────────────────────────────────────────────
const neverInvent = (build: Build) =>
  fc.property(scenario, ({ lines, text, candidates }) => {
    const p = build({ id: RECORD_ID, originalLines: lines }, PACK, candidates);
    for (const f of p.fields) {
      if (!provesValue(text, f)) throw new Error(`invented ${JSON.stringify(f)}`);
    }
    // Every candidate is accounted for: accepted (identical duplicates collapse) or rejected.
    return p.fields.length + p.rejected.length >= Math.min(1, candidates.length);
  });

/**
 * Planted bug (design.md): the span check skips `end <= input.length`, so a span running past
 * the input is accepted when the value equals the clipped slice.
 */
const buildSkippingBoundsCheck: Build = (record, pack, candidates) => {
  const p = buildProposal(record, pack, candidates);
  const text = nfc(recordInput(record.originalLines));
  const smuggled = p.rejected
    .filter((r) => r.reason === "span.out_of_bounds")
    .map((r) => r.candidate as unknown as RawCandidate)
    .filter(
      (c) =>
        c.provenance.kind === "span" &&
        text.slice(c.provenance.span.start, c.provenance.span.end) === c.value,
    )
    .map((c) => {
      const ref = typeof c.element === "string" ? { element: c.element, index: 0 } : c.element;
      return { ...ref, value: c.value, provenance: c.provenance, confidence: null };
    });
  return { ...p, fields: [...p.fields, ...smuggled] } as Proposal;
};

type RawCandidate = {
  element: Field["element"] | { element: Field["element"]; index: number };
  value: string;
  provenance: Provenance & { kind: "span" };
};

describe("P1 never-invent (P-never-invent)", () => {
  it(`P-never-invent: every accepted field is a span, a replayable transform or a referenced non-text provenance (${NUM_RUNS} runs)`, () => {
    fc.assert(neverInvent(buildProposal), { numRuns: NUM_RUNS });
  });

  it("P-never-invent catches planted bug: span bounds check (end <= length) skipped", () => {
    expectCaught("P-never-invent", neverInvent(buildSkippingBoundsCheck), 1101);
  });
});

// P2 ───────────────────────────────────────────────────────────────────────────────────────────
const spanCase = originalLines.chain((lines) => {
  const input = recordInput(lines);
  const text = nfc(input);
  return fc.tuple(spanOf(text), fc.nat({ max: 5 }), word).map(([span, variant, extra]) => {
    const exact = text.slice(span.start, span.end);
    const value = [
      exact,
      exact.normalize("NFD"),
      exact + extra,
      exact.trim(),
      exact.slice(0, -1),
      exact.toUpperCase(),
    ][variant] as string;
    return { input, text, span, value };
  });
});

const spanExact = (propose: Propose) =>
  fc.property(spanCase, elementRef, ({ input, text, span, value }, ref) => {
    const r = propose(input, ref, value, { kind: "span", span });
    const expected = value.length > 0 && text.slice(span.start, span.end) === value;
    return r.ok === expected && (r.ok || r.reason.length > 0);
  });

/** Planted bug (design.md): compares against the raw input instead of `nfc(input)`. */
const proposeAgainstRawInput: Propose = (input, element, value, provenance) => {
  if (provenance.kind !== "span") return proposeField(input, element, value, provenance);
  const { start, end } = provenance.span;
  if (value === "" || input.slice(start, end) !== value)
    return { ok: false, reason: "span.mismatch" };
  const ref = typeof element === "string" ? { element, index: 0 } : element;
  return { ok: true, field: { ...ref, value, provenance } };
};

describe("P2 span-exact (P-span-exact)", () => {
  it(`P-span-exact: a span value is accepted iff it equals nfc(input)[start, end) exactly (${NUM_RUNS} runs)`, () => {
    fc.assert(spanExact(proposeField), { numRuns: NUM_RUNS });
  });

  it("P-span-exact catches planted bug: span compared against the raw (non-NFC) input", () => {
    expectCaught("P-span-exact", spanExact(proposeAgainstRawInput), 1102);
  });
});

// P3 ───────────────────────────────────────────────────────────────────────────────────────────
const transformCase = originalLines.chain((lines) => {
  const input = recordInput(lines);
  const text = nfc(input);
  return fc
    .tuple(spanOf(text), transformDef, transformDef, fc.boolean(), fc.nat({ max: 2 }), word)
    .map(([span, named, other, sameVersion, variant, extra]) => {
      const source = text.slice(span.start, span.end);
      const value = [named.apply(source), other.apply(source), named.apply(source) + extra][
        variant
      ] as string;
      return {
        input,
        text,
        span,
        value,
        named: { id: named.id, version: sameVersion ? named.version : named.version + 1 },
      };
    });
});

const transformReplays = (propose: Propose) =>
  fc.property(transformCase, elementRef, ({ input, text, span, value, named }, ref) => {
    const r = propose(input, ref, value, { kind: "transform", transform: named, source: span });
    const entry = TRANSFORMS.find((t) => t.id === named.id && t.version === named.version);
    const expected =
      value.length > 0 &&
      entry !== undefined &&
      entry.apply(text.slice(span.start, span.end)) === value;
    return r.ok === expected;
  });

/** Planted bug (design.md): replay returns the claimed value instead of recomputing it. */
const proposeTrustingTransform: Propose = (input, element, value, provenance) => {
  const r = proposeField(input, element, value, provenance);
  if (!r.ok && r.reason === "transform.mismatch" && provenance.kind === "transform") {
    const ref = typeof element === "string" ? { element, index: 0 } : element;
    return { ok: true, field: { ...ref, value, provenance } };
  }
  return r;
};

describe("P3 transform-replays (P-transform-replays)", () => {
  it(`P-transform-replays: a transform value is accepted iff replaying the named table entry on its span yields it (${NUM_RUNS} runs)`, () => {
    fc.assert(transformReplays(proposeField), { numRuns: NUM_RUNS });
  });

  it("P-transform-replays catches planted bug: transform trusted without replay", () => {
    expectCaught("P-transform-replays", transformReplays(proposeTrustingTransform), 1103);
  });
});

// P5 ───────────────────────────────────────────────────────────────────────────────────────────
const anyProvenance: fc.Arbitrary<Provenance> = fc.oneof(
  fc
    .record({ start: fc.nat(50), len: fc.integer({ min: 1, max: 50 }) })
    .map(({ start, len }): Provenance => ({ kind: "span", span: { start, end: start + len } })),
  fc.tuple(transformDef, fc.nat(50)).map(
    ([t, start]): Provenance => ({
      kind: "transform",
      transform: { id: t.id, version: t.version },
      source: { start, end: start + 1 },
    }),
  ),
  fc.tuple(nonEmptyId, nonEmptyId, fc.nat(50)).map(
    ([datasetId, recordKey, start]): Provenance => ({
      kind: "dataset",
      datasetId,
      recordKey,
      unique: true,
      source: { start, end: start + 1 },
    }),
  ),
  fc
    .tuple(nonEmptyId, elementRef)
    .map(([ruleId, field]): Provenance => ({ kind: "inferred", ruleId, from: { field } })),
  fc.uuid().map((actorId): Provenance => ({ kind: "human", actorId })),
  fc.uuid().map((tokenId): Provenance => ({ kind: "external", tokenId })),
);

const notAutoApprovable = (auto: AutoApprovable) =>
  fc.property(anyProvenance, fc.boolean(), (provenance, validatorsAgree) => {
    const got = auto({ provenance }, validatorsAgree);
    switch (provenance.kind) {
      case "span":
      case "transform":
        return got === validatorsAgree;
      default:
        return got === false;
    }
  });

/** Planted bug (design.md): `return validatorsAgree`, whatever the provenance kind. */
const autoApprovableIgnoringKind: AutoApprovable = (_field, validatorsAgree) => validatorsAgree;

describe("P5 not-auto-approvable (P-not-auto-approvable)", () => {
  it(`P-not-auto-approvable: dataset, inferred, external and human are never auto-approvable; span and transform only when validators agree (${NUM_RUNS} runs)`, () => {
    fc.assert(notAutoApprovable(isAutoApprovable), { numRuns: NUM_RUNS });
  });

  it("P-not-auto-approvable catches planted bug: provenance kind ignored", () => {
    expectCaught("P-not-auto-approvable", notAutoApprovable(autoApprovableIgnoringKind), 1105);
  });
});
