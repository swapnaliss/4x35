/**
 * An independent restatement of ADR 0008, used as the test oracle: does this field's provenance
 * prove its value against the NFC input? Written from the ADR, not from src/provenance.ts.
 */
import { type Field, TRANSFORMS } from "../src/index.js";

const filled = (v: unknown) => typeof v === "string" && v.trim() !== "";

function validSpan(text: string, s: { start: number; end: number }): boolean {
  return (
    Number.isInteger(s.start) &&
    Number.isInteger(s.end) &&
    s.start >= 0 &&
    s.end > s.start &&
    s.end <= text.length
  );
}

export function provesValue(text: string, field: Field): boolean {
  if (field.value.length === 0) return false;
  const p = field.provenance;
  switch (p.kind) {
    case "span":
      return validSpan(text, p.span) && text.slice(p.span.start, p.span.end) === field.value;
    case "transform": {
      const t = TRANSFORMS.find(
        (x) => x.id === p.transform.id && x.version === p.transform.version,
      );
      return (
        t !== undefined &&
        validSpan(text, p.source) &&
        t.apply(text.slice(p.source.start, p.source.end)) === field.value
      );
    }
    case "dataset":
      return (
        filled(p.datasetId) && filled(p.recordKey) && p.unique === true && validSpan(text, p.source)
      );
    case "inferred":
      return (
        filled(p.ruleId) && ("span" in p.from ? validSpan(text, p.from.span) : "field" in p.from)
      );
    case "human":
      return filled(p.actorId);
    case "external":
      return filled(p.tokenId);
  }
}
