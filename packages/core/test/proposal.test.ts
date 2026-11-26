/** Unit tests for buildProposal: routing, conflicts, inferred-from-field, length boundary, shape. */
import { describe, expect, it } from "vitest";
import {
  buildProposal,
  type Candidate,
  type Proposal,
  proposalToJson,
  StoredProposalSchema,
} from "../src/index.js";

// Synthetic record (data policy).
const RECORD = {
  id: "00000000-0000-4000-8000-000000000002",
  originalLines: ["Musterweg 12", "10115 Berlin"] as const,
};
const PACK = { id: "test-pack", version: "1.0.0" };
const span = (start: number, end: number) => ({ kind: "span", span: { start, end } }) as const;

describe("buildProposal", () => {
  it("routes accepted candidates to fields and the rest to rejected, sorted", () => {
    const p = buildProposal(RECORD, PACK, [
      { element: "TwnNm", value: "Berlin", provenance: span(19, 25) },
      { element: "StrtNm", value: "Musterweg", provenance: span(0, 9) },
      { element: "PstCd", value: "99999", provenance: span(13, 18) },
      { element: "BldgNb", value: "12", provenance: span(10, 12) },
    ]);
    expect(p.fields.map((f) => [f.element, f.value])).toEqual([
      ["StrtNm", "Musterweg"],
      ["BldgNb", "12"],
      ["TwnNm", "Berlin"],
    ]);
    expect(p.rejected).toHaveLength(1);
    expect(p.rejected[0]?.reason).toBe("span.mismatch");
    expect(p.fields.every((f) => f.confidence === null)).toBe(true);
  });

  it("collapses identical duplicates and rejects conflicting values for one element", () => {
    const dup = buildProposal(RECORD, PACK, [
      { element: "TwnNm", value: "Berlin", provenance: span(19, 25) },
      { element: "TwnNm", value: "Berlin", provenance: span(19, 25) },
    ]);
    expect(dup.fields).toHaveLength(1);
    const conflict = buildProposal(RECORD, PACK, [
      { element: "TwnNm", value: "Berlin", provenance: span(19, 25) },
      { element: "TwnNm", value: "BERLIN", provenance: { kind: "human", actorId: "u-1" } },
    ]);
    expect(conflict.fields).toEqual([]);
    expect(conflict.rejected.map((r) => r.reason)).toEqual(["field.conflict", "field.conflict"]);
  });

  it("accepts an inferred-from-field value only when its source field was accepted", () => {
    const inferred: Candidate = {
      element: "Ctry",
      value: "DE",
      provenance: {
        kind: "inferred",
        ruleId: "postcode-shape",
        from: { field: { element: "PstCd", index: 0 } },
      },
    };
    const withSource = buildProposal(RECORD, PACK, [
      inferred,
      { element: "PstCd", value: "10115", provenance: span(13, 18) },
    ]);
    expect(withSource.fields.map((f) => f.element)).toEqual(["PstCd", "Ctry"]);
    // The source field is emptied by a conflict with another inferred value: the chain goes too.
    const contested = buildProposal(RECORD, PACK, [
      inferred,
      { element: "PstCd", value: "10115", provenance: span(13, 18) },
      {
        element: "PstCd",
        value: "10117",
        provenance: {
          kind: "inferred",
          ruleId: "r",
          from: { field: { element: "TwnNm", index: 0 } },
        },
      },
      { element: "TwnNm", value: "Berlin", provenance: span(19, 25) },
    ]);
    expect(contested.fields.map((f) => f.element)).toEqual(["TwnNm"]);
    expect(contested.rejected.map((r) => r.reason).sort()).toEqual([
      "field.conflict",
      "field.conflict",
      "inferred.source_field_missing",
    ]);
    const without = buildProposal(RECORD, PACK, [inferred]);
    expect(without.fields).toEqual([]);
    expect(without.rejected[0]?.reason).toBe("inferred.source_field_missing");
  });

  it("keeps an over-length value in full with a length.exceeded finding; none at the limit", () => {
    const at = "B".repeat(35);
    const over = "B".repeat(36);
    const record = { id: RECORD.id, originalLines: [at, over] };
    const p = buildProposal(record, PACK, [
      { element: "TwnNm", value: at, provenance: span(0, 35) },
      { element: "TwnLctnNm", value: over, provenance: span(36, 72) },
    ]);
    expect(p.fields.map((f) => f.value.length)).toEqual([35, 36]);
    expect(p.findings).toEqual([
      {
        ruleId: "length.exceeded",
        severity: "reject",
        target: { element: "TwnLctnNm", index: 0 },
        message:
          "TwnLctnNm is 36 characters; the limit is 35. The value is kept in full and needs review.",
      },
    ]);
  });

  it("rejects a non-object candidate and throws on a malformed record or pack", () => {
    const p = buildProposal(RECORD, PACK, [null as unknown as Candidate]);
    expect(p.rejected).toEqual([{ candidate: null, reason: "candidate.invalid" }]);
    expect(() => buildProposal({ id: "", originalLines: [] }, PACK, [])).toThrow(TypeError);
    expect(() => buildProposal(RECORD, { id: "p", version: "" }, [])).toThrow(TypeError);
  });

  it("returns a deeply frozen Proposal whose stable JSON parses as a StoredProposal", () => {
    const p = buildProposal(RECORD, PACK, [
      { element: "TwnNm", value: "Berlin", provenance: span(19, 25) },
    ]);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.fields[0]?.provenance)).toBe(true);
    const stored = StoredProposalSchema.parse(JSON.parse(proposalToJson(p)));
    expect(stored.fields[0]?.value).toBe("Berlin");
    expect(proposalToJson(p)).toBe(
      '{"fields":[{"confidence":null,"element":"TwnNm","index":0,"provenance":{"kind":"span","span":{"end":25,"start":19}},"value":"Berlin"}],"findings":[],"pack":{"id":"test-pack","version":"1.0.0"},"recordId":"00000000-0000-4000-8000-000000000002","rejected":[]}',
    );
  });

  it("cannot be forged: an object literal does not type-check as a Proposal", () => {
    // @ts-expect-error the brand is only produced by buildProposal
    const forged: Proposal = { recordId: "r", pack: PACK, fields: [], rejected: [], findings: [] };
    expect(forged).toBeDefined();
  });
});
