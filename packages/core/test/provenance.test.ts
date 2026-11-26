/** Unit tests: one per rejection reason, the element and transform tables, isAutoApprovable. */
import { describe, expect, it } from "vitest";
import {
  ELEMENT_MAX_LENGTH,
  ELEMENT_MAX_OCCURS,
  ELEMENTS,
  getTransform,
  isAutoApprovable,
  type Provenance,
  proposeField,
  REJECTION_REASONS,
  type RejectionReason,
  TRANSFORMS,
  valueLength,
} from "../src/index.js";

// Synthetic address (data policy), passed in NFD; offsets are into its NFC form.
const INPUT = "Hauptstrasse 5\n10115   Berlin Mitte".normalize("NFD");
const span = (start: number, end: number) => ({ start, end });
const P = (p: unknown) => p as Provenance;

function reason(element: unknown, value: unknown, provenance: unknown): RejectionReason | "ok" {
  const r = proposeField(INPUT, element as "TwnNm", value as string, P(provenance));
  return r.ok ? "ok" : r.reason;
}

describe("proposeField: accepted kinds", () => {
  it("span: exact slice of the NFC input", () => {
    expect(reason("TwnNm", "Berlin", { kind: "span", span: span(23, 29) })).toBe("ok");
  });
  it("transform: whitespace.collapse replayed on its span", () => {
    expect(
      reason("TwnNm", "10115 Berlin Mitte", {
        kind: "transform",
        transform: { id: "whitespace.collapse", version: 1 },
        source: span(15, 35),
      }),
    ).toBe("ok");
  });
  it("transform: case.upper replayed on its span", () => {
    expect(
      reason("TwnNm", "BERLIN", {
        kind: "transform",
        transform: { id: "case.upper", version: 1 },
        source: span(23, 29),
      }),
    ).toBe("ok");
  });
  it("dataset, inferred (span and field), human, external with their references", () => {
    const ds = {
      kind: "dataset",
      datasetId: "geonames-postal",
      recordKey: "DE:10115",
      unique: true,
      source: span(15, 20),
    };
    expect(reason("TwnNm", "Berlin", ds)).toBe("ok");
    expect(
      reason("Ctry", "DE", {
        kind: "inferred",
        ruleId: "postcode-shape",
        from: { span: span(15, 20) },
      }),
    ).toBe("ok");
    expect(
      reason("Ctry", "DE", {
        kind: "inferred",
        ruleId: "x",
        from: { field: { element: "PstCd", index: 0 } },
      }),
    ).toBe("ok");
    expect(reason("TwnNm", "Berlin", { kind: "human", actorId: "u-1" })).toBe("ok");
    expect(reason("TwnNm", "Berlin", { kind: "external", tokenId: "t-1" })).toBe("ok");
  });
  it("AdrLine accepts index 0..6 only", () => {
    const p = { kind: "human", actorId: "u-1" };
    expect(reason({ element: "AdrLine", index: 6 }, "x", p)).toBe("ok");
    expect(reason({ element: "AdrLine", index: 7 }, "x", p)).toBe("element.index_out_of_range");
    expect(reason({ element: "TwnNm", index: 1 }, "x", p)).toBe("element.index_out_of_range");
    expect(reason({ element: "TwnNm", index: -1 }, "x", p)).toBe("element.index_out_of_range");
  });
  it("the accepted field is frozen and carries only the checked references", () => {
    const r = proposeField(
      INPUT,
      "TwnNm",
      "Berlin",
      P({ kind: "span", span: span(23, 29), extra: "dropped" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(Object.isFrozen(r.field)).toBe(true);
    expect(r.field.provenance).toEqual({ kind: "span", span: { start: 23, end: 29 } });
  });
});

describe("proposeField: every rejection reason", () => {
  const cases: Array<[RejectionReason, unknown, unknown, unknown]> = [
    ["element.unknown", "Town", "Berlin", { kind: "human", actorId: "u" }],
    [
      "element.index_out_of_range",
      { element: "AdrLine", index: 1.5 },
      "x",
      { kind: "human", actorId: "u" },
    ],
    ["value.not_string", "TwnNm", 42, { kind: "human", actorId: "u" }],
    ["value.empty", "TwnNm", "", { kind: "human", actorId: "u" }],
    ["provenance.missing", "TwnNm", "Berlin", undefined],
    ["provenance.kind_unknown", "TwnNm", "Berlin", { kind: "llm" }],
    ["span.invalid", "TwnNm", "Berlin", { kind: "span", span: span(5, 5) }],
    ["span.out_of_bounds", "TwnNm", "Mitte", { kind: "span", span: span(30, 99) }],
    ["span.splits_code_point", "TwnNm", "\uD83C", { kind: "span", span: span(0, 1) }],
    ["span.mismatch", "TwnNm", "BERLIN", { kind: "span", span: span(23, 29) }],
    [
      "transform.unknown",
      "TwnNm",
      "Berlin",
      { kind: "transform", transform: { id: "latin.fold", version: 1 }, source: span(23, 29) },
    ],
    [
      "transform.mismatch",
      "TwnNm",
      "berlin",
      { kind: "transform", transform: { id: "case.upper", version: 1 }, source: span(23, 29) },
    ],
    [
      "dataset.reference_missing",
      "TwnNm",
      "Berlin",
      { kind: "dataset", datasetId: "", recordKey: "k", unique: true, source: span(23, 29) },
    ],
    [
      "dataset.not_unique",
      "TwnNm",
      "Berlin",
      { kind: "dataset", datasetId: "d", recordKey: "k", unique: false, source: span(23, 29) },
    ],
    [
      "inferred.rule_missing",
      "Ctry",
      "DE",
      { kind: "inferred", ruleId: " ", from: { span: span(15, 20) } },
    ],
    ["inferred.source_missing", "Ctry", "DE", { kind: "inferred", ruleId: "r", from: {} }],
    ["human.actor_missing", "TwnNm", "Berlin", { kind: "human" }],
    ["external.token_missing", "TwnNm", "Berlin", { kind: "external", tokenId: "" }],
  ];
  it.each(cases)("%s", (expected, element, value, provenance) => {
    const input = expected === "span.splits_code_point" ? "🏠 Haus" : INPUT;
    const r = proposeField(input, element as "TwnNm", value as string, P(provenance));
    expect(r).toEqual({ ok: false, reason: expected });
  });

  it("a dataset value without a corroborating span is rejected", () => {
    expect(
      reason("TwnNm", "Berlin", { kind: "dataset", datasetId: "d", recordKey: "k", unique: true }),
    ).toBe("span.invalid");
  });

  it("a transform with the wrong version is unknown", () => {
    expect(
      reason("TwnNm", "BERLIN", {
        kind: "transform",
        transform: { id: "case.upper", version: 2 },
        source: span(23, 29),
      }),
    ).toBe("transform.unknown");
  });

  it("covers every reason proposeField can return (the rest are buildProposal's)", () => {
    const tested = new Set([...cases.map((c) => c[0])]);
    const builderOnly = new Set([
      "candidate.invalid",
      "inferred.source_field_missing",
      "field.conflict",
    ]);
    expect(REJECTION_REASONS.filter((r) => !tested.has(r) && !builderOnly.has(r))).toEqual([]);
  });
});

describe("element table", () => {
  it("has the PostalAddress24 limits", () => {
    expect(ELEMENT_MAX_LENGTH).toEqual({
      StrtNm: 70,
      BldgNb: 16,
      BldgNm: 35,
      Flr: 70,
      PstBx: 16,
      Room: 70,
      PstCd: 16,
      TwnNm: 35,
      TwnLctnNm: 35,
      DstrctNm: 35,
      CtrySubDvsn: 35,
      Ctry: 2,
      AdrLine: 70,
    });
    expect(ELEMENTS.filter((e) => ELEMENT_MAX_OCCURS[e] !== 1)).toEqual(["AdrLine"]);
    expect(ELEMENT_MAX_OCCURS.AdrLine).toBe(7);
  });
  it("counts code points, not UTF-16 units", () => {
    expect(valueLength("🏠東京")).toBe(3);
  });
});

describe("transform table", () => {
  it("is closed: nfc, whitespace.collapse, case.upper at version 1, unique ids", () => {
    expect(TRANSFORMS.map((t) => `${t.id}@${t.version}`)).toEqual([
      "nfc@1",
      "whitespace.collapse@1",
      "case.upper@1",
    ]);
    expect(Object.isFrozen(TRANSFORMS)).toBe(true);
    expect(getTransform("case.upper", 2)).toBeUndefined();
  });
  it("whitespace.collapse folds tabs, NBSP and runs of 3+ and is idempotent", () => {
    const t = getTransform("whitespace.collapse", 1);
    expect(t?.apply("\t 10115   Berlin   Mitte　")).toBe("10115 Berlin Mitte");
    expect(t?.apply(t.apply(" a  b "))).toBe(t?.apply(" a  b "));
  });
  it("case.upper does not depend on a locale (dotted i stays I)", () => {
    expect(getTransform("case.upper", 1)?.apply("istanbul straße")).toBe("ISTANBUL STRASSE");
  });
  it("nfc composes a decomposed input", () => {
    expect(getTransform("nfc", 1)?.apply("München")).toBe("München");
  });
});

describe("isAutoApprovable", () => {
  const f = (kind: string) => ({ provenance: P({ kind }) });
  it.each([
    ["span", true, true],
    ["span", false, false],
    ["transform", true, true],
    ["transform", false, false],
    ["dataset", true, false],
    ["inferred", true, false],
    ["external", true, false],
    ["human", true, false],
  ] as const)("%s with validatorsAgree=%s → %s", (kind, agree, expected) => {
    expect(isAutoApprovable(f(kind), agree)).toBe(expected);
  });
});
