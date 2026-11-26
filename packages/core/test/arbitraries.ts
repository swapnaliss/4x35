/**
 * Domain arbitraries for the domain-core properties (.kiro/steering/specs.md): address lines with
 * whitespace runs (3+), tabs and non-breaking spaces; letters from the scripts in scope (CJK,
 * Devanagari, Arabic, Cyrillic, Latin with diacritics, in NFC and NFD); lengths around every
 * element limit. Never bare `fc.string()`.
 */
import fc from "fast-check";
import {
  type Candidate,
  ELEMENT_MAX_LENGTH,
  ELEMENT_MAX_OCCURS,
  ELEMENTS,
  type Element,
  type ElementRef,
  nfc,
  type Provenance,
  recordInput,
  TRANSFORMS,
} from "../src/index.js";

/** numRuns for every property: FC_NUM_RUNS, never below the ticket's 1,000. */
export const NUM_RUNS = Math.max(1000, Number(process.env.FC_NUM_RUNS ?? 0) || 0);

const chars = (s: string) => fc.constantFrom(...[...s]);

const latin = chars("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");
/** Precomposed Latin with diacritics: NFD splits these into base + combining mark. */
const latinDiacritic = chars("ÄÖÜäöüßÉÈÊéèêÇçÑñÅåØøŁłŚśŽžĞğİıŐőŰűĀāẞ");
const cjk = chars("東京都千代田区丸の内一丁目二番地上海市浦东新区北京路大阪府");
const devanagari = chars("मुंबईनगरदिल्लीमार्गक्षत्रज्ञ");
const arabic = chars("شارعالملكفهدالرياضدبيمدينة");
const cyrillic = chars("МоскваулицаТверскаядомСанктПетербургЁё");
const digit = chars("0123456789");
const punct = chars(",.-/#'()&");
/** Combining marks on their own (a decomposed input can carry them). */
const combining = chars("̧́̈̊");

const letter = fc.oneof(
  { weight: 4, arbitrary: latin },
  { weight: 3, arbitrary: latinDiacritic },
  { weight: 2, arbitrary: cjk },
  { weight: 1, arbitrary: devanagari },
  { weight: 1, arbitrary: arabic },
  { weight: 2, arbitrary: cyrillic },
  { weight: 2, arbitrary: digit },
  { weight: 1, arbitrary: punct },
  { weight: 1, arbitrary: combining },
);

/** A whitespace run: one space, or a run of 1..5 of space, tab, NBSP, narrow NBSP, ideographic. */
const whitespace = fc.oneof(
  { weight: 4, arbitrary: fc.constant(" ") },
  {
    weight: 2,
    arbitrary: fc.array(chars(" \t  　"), { minLength: 1, maxLength: 5 }).map((a) => a.join("")),
  },
  { weight: 1, arbitrary: fc.constantFrom("   ", "\t\t\t", "   ") },
);

export const word = fc.array(letter, { minLength: 1, maxLength: 12 }).map((a) => a.join(""));

/** NFC or NFD form of a string, at random. */
export const normalForm = (s: string) => fc.constantFrom(s.normalize("NFC"), s.normalize("NFD"));

/** One free-text address line (MT-era: up to ~35, but longer lines are generated too). */
export const addressLine: fc.Arbitrary<string> = fc
  .tuple(
    fc.option(whitespace, { nil: "" }),
    fc.array(fc.tuple(word, whitespace), { minLength: 1, maxLength: 8 }),
    word,
    fc.option(whitespace, { nil: "" }),
  )
  .map(([lead, parts, last, trail]) => lead + parts.map(([w, s]) => w + s).join("") + last + trail)
  .chain(normalForm);

/** A record's original lines: 1..4 lines, like a 4 × 35 MT address. */
export const originalLines: fc.Arbitrary<readonly string[]> = fc.array(addressLine, {
  minLength: 1,
  maxLength: 4,
});

export const element: fc.Arbitrary<Element> = fc.constantFrom(...ELEMENTS);

export const elementRef: fc.Arbitrary<ElementRef> = element.chain((e) =>
  fc.integer({ min: 0, max: ELEMENT_MAX_OCCURS[e] - 1 }).map((index) => ({ element: e, index })),
);

/** A valid `[start, end)` span of `text` that does not split a surrogate pair. */
export function spanOf(text: string): fc.Arbitrary<{ start: number; end: number }> {
  return fc
    .tuple(fc.nat({ max: text.length - 1 }), fc.nat({ max: text.length - 1 }))
    .map(([a, b]) => {
      const start = Math.min(a, b);
      const end = Math.max(a, b) + 1;
      return { start: fixStart(text, start), end: fixEnd(text, end) };
    });
}

function isHigh(c: number) {
  return c >= 0xd800 && c <= 0xdbff;
}
function fixStart(text: string, i: number) {
  return i > 0 && isHigh(text.charCodeAt(i - 1)) ? i - 1 : i;
}
function fixEnd(text: string, i: number) {
  return i < text.length && isHigh(text.charCodeAt(i - 1)) ? i + 1 : i;
}

export const nonEmptyId = fc.oneof(
  fc.uuid(),
  fc.constantFrom("geonames-postal:DE", "jp-post:ken_all", "rule.country-from-postcode"),
);

export const transformDef = fc.constantFrom(...TRANSFORMS);

/** A value of exactly `length` code points made of address letters (for limit boundaries). */
export function valueOfLength(length: number): fc.Arbitrary<string> {
  return fc
    .array(fc.oneof(latin, latinDiacritic, cjk, cyrillic, digit), {
      minLength: length,
      maxLength: length,
    })
    .map((a) => a.join(""));
}

/** Lengths around every element limit (15/16/17, 34/35/36, 69/70/71, and 1/2/3 for Ctry). */
export const lengthAroundLimit = (e: Element) => {
  const max = ELEMENT_MAX_LENGTH[e];
  return fc.constantFrom(max - 1, max, max + 1);
};

export interface Scenario {
  readonly lines: readonly string[];
  readonly text: string;
  readonly candidates: readonly Candidate[];
}

/**
 * A record and a mixed bag of candidates for it: valid spans, valid transforms, non-text
 * provenances with their references, and invented or damaged values (shifted, trimmed, NFD,
 * case-changed, foreign, wrong transform version, `unique: false`, missing references).
 */
export const scenario: fc.Arbitrary<Scenario> = originalLines.chain((lines) => {
  const text = nfc(recordInput(lines));
  const span = spanOf(text);
  const slice = (s: { start: number; end: number }) => text.slice(s.start, s.end);

  const spanCandidate = fc.tuple(elementRef, span).map(
    ([ref, s]): Candidate => ({
      element: ref,
      value: slice(s),
      provenance: { kind: "span", span: s },
    }),
  );
  const transformCandidate = fc.tuple(elementRef, span, transformDef).map(
    ([ref, s, t]): Candidate => ({
      element: ref,
      value: t.apply(slice(s)),
      provenance: { kind: "transform", transform: { id: t.id, version: t.version }, source: s },
    }),
  );
  const otherProvenance: fc.Arbitrary<Provenance> = fc.oneof(
    fc.tuple(nonEmptyId, nonEmptyId, span).map(
      ([datasetId, recordKey, source]): Provenance => ({
        kind: "dataset",
        datasetId,
        recordKey,
        unique: true,
        source,
      }),
    ),
    fc
      .tuple(
        nonEmptyId,
        fc.oneof(
          span.map((s) => ({ span: s })),
          elementRef.map((f) => ({ field: f })),
        ),
      )
      .map(([ruleId, from]): Provenance => ({ kind: "inferred", ruleId, from })),
    fc.uuid().map((actorId): Provenance => ({ kind: "human", actorId })),
    fc.uuid().map((tokenId): Provenance => ({ kind: "external", tokenId })),
  );
  const otherCandidate = fc
    .tuple(elementRef, addressLine, otherProvenance)
    .map(([ref, value, provenance]): Candidate => ({ element: ref, value, provenance }));

  // Invented or damaged: the value or the provenance does not prove the value.
  const bad = fc.oneof(
    fc.tuple(elementRef, span, word).map(
      ([ref, s, extra]): Candidate => ({
        element: ref,
        value: slice(s) + extra,
        provenance: { kind: "span", span: s },
      }),
    ),
    fc.tuple(elementRef, span).map(
      ([ref, s]): Candidate => ({
        element: ref,
        value: slice(s).normalize("NFD"),
        provenance: { kind: "span", span: s },
      }),
    ),
    fc.tuple(elementRef, span).map(
      ([ref, s]): Candidate => ({
        element: ref,
        value: slice(s).trim(),
        provenance: { kind: "span", span: s },
      }),
    ),
    fc.tuple(elementRef, span).map(
      ([ref, s]): Candidate => ({
        element: ref,
        value: slice({ start: s.start, end: s.end + 1 }),
        provenance: { kind: "span", span: s },
      }),
    ),
    fc.tuple(elementRef, span, addressLine).map(
      ([ref, s, value]): Candidate => ({
        element: ref,
        value,
        provenance: { kind: "span", span: s },
      }),
    ),
    // A span running past the end of the input, with the clipped slice as its value.
    fc.tuple(elementRef, span, fc.integer({ min: 1, max: 5 })).map(
      ([ref, s, over]): Candidate => ({
        element: ref,
        value: text.slice(s.start),
        provenance: { kind: "span", span: { start: s.start, end: text.length + over } },
      }),
    ),
    fc.tuple(elementRef, span, transformDef).map(
      ([ref, s, t]): Candidate => ({
        element: ref,
        value: t.apply(slice(s)),
        provenance: {
          kind: "transform",
          transform: { id: t.id, version: t.version + 1 },
          source: s,
        },
      }),
    ),
    fc.tuple(elementRef, span, word).map(
      ([ref, s, value]): Candidate => ({
        element: ref,
        value,
        provenance: { kind: "transform", transform: { id: "latin.fold", version: 1 }, source: s },
      }),
    ),
    fc.tuple(elementRef, addressLine, span).map(
      ([ref, value, source]): Candidate => ({
        element: ref,
        value,
        provenance: {
          kind: "dataset",
          datasetId: "geonames-postal:DE",
          recordKey: "10115",
          unique: false,
          source,
        } as unknown as Provenance,
      }),
    ),
    fc.tuple(elementRef, addressLine).map(
      ([ref, value]): Candidate => ({
        element: ref,
        value,
        provenance: { kind: "human", actorId: "" },
      }),
    ),
    fc.tuple(elementRef, addressLine).map(
      ([ref, value]): Candidate => ({
        element: ref,
        value,
        provenance: { kind: "llm" } as unknown as Provenance,
      }),
    ),
  );

  return fc
    .array(fc.oneof(spanCandidate, transformCandidate, otherCandidate, bad), {
      minLength: 0,
      maxLength: 12,
    })
    .map((candidates) => ({ lines, text, candidates }));
});
