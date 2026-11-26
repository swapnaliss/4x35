/**
 * Properties P4 (P-no-truncation) and P6 (P-proposal-deterministic) of
 * .kiro/specs/domain-core/design.md, each also run against its planted bug.
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildProposal,
  type Candidate,
  ELEMENT_MAX_LENGTH,
  LENGTH_EXCEEDED,
  type Proposal,
  proposalToJson,
  valueLength,
} from "../src/index.js";
import {
  addressLine,
  elementRef,
  lengthAroundLimit,
  NUM_RUNS,
  scenario,
  valueOfLength,
} from "./arbitraries.js";

const PACK = { id: "test-pack", version: "1.0.0" };
const RECORD_ID = "00000000-0000-4000-8000-000000000001";

type Build = typeof buildProposal;

function expectCaught<T>(name: string, property: fc.IProperty<T>, seed: number) {
  const result = fc.check(property, { numRuns: NUM_RUNS, seed });
  expect(result.failed, `${name}: the planted bug was not caught`).toBe(true);
  console.log(
    `${name}: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample=${JSON.stringify(result.counterexample)}`,
  );
}

const refKey = (c: Candidate) =>
  typeof c.element === "string" ? `${c.element}#0` : `${c.element.element}#${c.element.index}`;

// P4 ───────────────────────────────────────────────────────────────────────────────────────────
/**
 * A record whose second line is a value of a length around its element's limit (limit - 1,
 * limit, limit + 1), offered as a span candidate, next to a free-text first line.
 */
const boundaryCase = elementRef.chain((ref) =>
  fc
    .tuple(addressLine, lengthAroundLimit(ref.element).chain(valueOfLength))
    .map(([prefix, value]) => {
      const text = `${prefix}\n${value}`.normalize("NFC");
      const nfcValue = value.normalize("NFC");
      const start = text.lastIndexOf(nfcValue);
      const candidate: Candidate = {
        element: ref,
        value: nfcValue,
        provenance: { kind: "span", span: { start, end: start + nfcValue.length } },
      };
      return { lines: [prefix, value], ref, candidate };
    }),
);

const noTruncation = (build: Build) =>
  fc.property(boundaryCase, scenario, ({ lines, ref, candidate }, extra) => {
    const candidates = [candidate, ...extra.candidates];
    const p = build({ id: RECORD_ID, originalLines: lines }, PACK, candidates);
    // No output value is a strict prefix of a candidate value for the same element occurrence.
    for (const c of candidates) {
      const out = p.fields.find((f) => `${f.element}#${f.index}` === refKey(c));
      if (out && out.value !== c.value && c.value.startsWith(out.value)) return false;
    }
    // Every over-length accepted value is kept in full with a length.exceeded finding.
    for (const f of p.fields) {
      const over = valueLength(f.value) > ELEMENT_MAX_LENGTH[f.element];
      const finding = p.findings.some(
        (x) =>
          x.ruleId === LENGTH_EXCEEDED &&
          x.severity === "reject" &&
          x.target?.element === f.element &&
          x.target.index === f.index,
      );
      if (over !== finding) return false;
    }
    // The boundary candidate: full value or no value, and a finding exactly when over the limit.
    const out = p.fields.find((f) => f.element === ref.element && f.index === ref.index);
    const contested = extra.candidates.some((c) => refKey(c) === refKey(candidate));
    if (!contested) return out?.value === candidate.value;
    return out === undefined || out.value === candidate.value;
  });

/** Planted bug (design.md): values cut to the element's maximum length, finding dropped. */
const buildTruncating: Build = (record, pack, candidates) => {
  const p = buildProposal(record, pack, candidates);
  return {
    ...p,
    fields: p.fields.map((f) => ({
      ...f,
      value: [...f.value].slice(0, ELEMENT_MAX_LENGTH[f.element]).join(""),
    })),
    findings: p.findings.filter((x) => x.ruleId !== LENGTH_EXCEEDED),
  } as Proposal;
};

describe("P4 no-truncation (P-no-truncation)", () => {
  it(`P-no-truncation: over-length values are kept in full with a length.exceeded finding, never shortened (${NUM_RUNS} runs)`, () => {
    fc.assert(noTruncation(buildProposal), { numRuns: NUM_RUNS });
  });

  it("P-no-truncation catches planted bug: values truncated to the element limit", () => {
    expectCaught("P-no-truncation", noTruncation(buildTruncating), 1104);
  });
});

// P6 ───────────────────────────────────────────────────────────────────────────────────────────
const deterministicCase = scenario.chain((s) =>
  fc
    .tuple(
      fc.shuffledSubarray([...s.candidates], {
        minLength: s.candidates.length,
        maxLength: s.candidates.length,
      }),
      fc.shuffledSubarray([...s.candidates], {
        minLength: s.candidates.length,
        maxLength: s.candidates.length,
      }),
    )
    .map(([a, b]) => ({ lines: s.lines, a, b })),
);

const proposalDeterministic = (build: Build) =>
  fc.property(deterministicCase, ({ lines, a, b }) => {
    const record = { id: RECORD_ID, originalLines: lines };
    const one = build(record, PACK, a);
    const two = build(record, PACK, b);
    return (
      proposalToJson(one) === proposalToJson(two) && JSON.stringify(one) === JSON.stringify(two)
    );
  });

/** Planted bug (design.md): fields kept in candidate order instead of the elements.ts order. */
const buildInsertionOrder: Build = (record, pack, candidates) => {
  const p = buildProposal(record, pack, candidates);
  const order = candidates.map(refKey);
  const fields = [...p.fields].sort(
    (x, y) => order.indexOf(`${x.element}#${x.index}`) - order.indexOf(`${y.element}#${y.index}`),
  );
  return { ...p, fields } as Proposal;
};

describe("P6 proposal-deterministic (P-proposal-deterministic)", () => {
  it(`P-proposal-deterministic: the same record, pack and candidates in any order give byte-identical JSON (${NUM_RUNS} runs)`, () => {
    fc.assert(proposalDeterministic(buildProposal), { numRuns: NUM_RUNS });
  });

  it("P-proposal-deterministic catches planted bug: fields in candidate order", () => {
    expectCaught("P-proposal-deterministic", proposalDeterministic(buildInsertionOrder), 1106);
  });
});
