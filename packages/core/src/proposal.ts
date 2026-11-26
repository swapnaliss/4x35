/**
 * `buildProposal` is the only way to make a `Proposal` (R6, ADR 0008). It runs `proposeField` on
 * every candidate, keeps the accepted ones, moves the rest to `rejected[]` with their reason, and
 * records a `length.exceeded` finding (severity `reject`) for a value longer than its element. It
 * never shortens a value. The output is deterministic: fields sorted by element order and index,
 * findings and rejections sorted, and `proposalToJson` is stable JSON, so the same record, pack
 * reference and candidates (in any order) give byte-identical JSON.
 */
import { ELEMENT_MAX_LENGTH, type Element, elementOrder, valueLength } from "./elements.js";
import { deepFreeze } from "./freeze.js";
import { type JsonValue, stableStringify, toJsonValue } from "./json.js";
import {
  type ElementRef,
  type Field,
  type Provenance,
  proposeField,
  type RejectionReason,
  recordInput,
} from "./provenance.js";

export interface PackRef {
  readonly id: string;
  readonly version: string;
}

/** What a parser, dataset lookup, LLM adapter or editor offers for one element occurrence. */
export interface Candidate {
  readonly element: Element | ElementRef;
  readonly value: string;
  readonly provenance: Provenance;
}

export type FindingSeverity = "reject" | "strip" | "warn";

export interface Finding {
  readonly ruleId: string;
  readonly severity: FindingSeverity;
  readonly target: ElementRef | null;
  readonly message: string;
}

/** A field as stored in a Proposal. Confidence is scored by M2-15; until then it is null. */
export interface ProposalField extends Field {
  readonly confidence: number | null;
}

export interface RejectedCandidate {
  /** The candidate as received, reduced to JSON-safe data. */
  readonly candidate: JsonValue;
  readonly reason: RejectionReason;
}

declare const proposalBrand: unique symbol;

export interface Proposal {
  readonly recordId: string;
  readonly pack: PackRef;
  readonly fields: readonly ProposalField[];
  readonly rejected: readonly RejectedCandidate[];
  readonly findings: readonly Finding[];
  /** Type-level brand: no object literal type-checks as a Proposal; only buildProposal makes one. */
  readonly [proposalBrand]: true;
}

export interface ProposalRecordInput {
  readonly id: string;
  readonly originalLines: readonly string[];
}

export const LENGTH_EXCEEDED = "length.exceeded";

export function buildProposal(
  record: ProposalRecordInput,
  packRef: PackRef,
  candidates: readonly Candidate[],
): Proposal {
  assertRecord(record);
  assertPackRef(packRef);
  if (!Array.isArray(candidates)) throw new TypeError("buildProposal: candidates must be an array");

  const input = recordInput(record.originalLines);
  const rejected: RejectedCandidate[] = [];
  const direct: Field[] = [];
  const fromField: Array<{ field: Field; raw: unknown }> = [];

  for (const raw of candidates as readonly unknown[]) {
    if (!isRecord(raw)) {
      rejected.push({ candidate: toJsonValue(raw), reason: "candidate.invalid" });
      continue;
    }
    const result = proposeField(
      input,
      raw.element as Element,
      raw.value as string,
      raw.provenance as Provenance,
    );
    if (!result.ok) {
      rejected.push({ candidate: toJsonValue(raw), reason: result.reason });
    } else if (
      result.field.provenance.kind === "inferred" &&
      "field" in result.field.provenance.from
    ) {
      fromField.push({ field: result.field, raw });
    } else {
      direct.push(result.field);
    }
  }

  // Pass 1: span, transform, dataset, human, external and span-inferred fields.
  const base = resolveConflicts(direct, rejected);
  // Pass 2: a field inferred from another field needs that field accepted in pass 1.
  const inferred: Field[] = [];
  for (const { field, raw } of fromField) {
    const from = (field.provenance as { from: { field: ElementRef } }).from.field;
    if (base.has(key(from))) inferred.push(field);
    else rejected.push({ candidate: toJsonValue(raw), reason: "inferred.source_field_missing" });
  }
  const all = resolveConflicts([...base.values(), ...inferred], rejected);

  const fields: ProposalField[] = [...all.values()]
    .sort(compareRefs)
    .map((f) => ({ ...f, confidence: null }));

  const findings: Finding[] = [];
  for (const f of fields) {
    const length = valueLength(f.value);
    const max = ELEMENT_MAX_LENGTH[f.element];
    if (length > max) {
      findings.push({
        ruleId: LENGTH_EXCEEDED,
        severity: "reject",
        target: { element: f.element, index: f.index },
        message: `${f.element} is ${length} characters; the limit is ${max}. The value is kept in full and needs review.`,
      });
    }
  }

  const proposal = {
    recordId: record.id,
    pack: { id: packRef.id, version: packRef.version },
    fields,
    rejected: sortByJson(rejected),
    findings: sortByJson(findings),
  };
  return deepFreeze(proposal) as unknown as Proposal;
}

/** The stored and compared form of a Proposal: stable JSON (sorted keys, no whitespace). */
export function proposalToJson(proposal: Proposal): string {
  return stableStringify(proposal);
}

/**
 * Group fields by element occurrence. Identical duplicates collapse to one; two different values
 * (or provenances) for the same occurrence are both rejected as `field.conflict`, so the field
 * stays empty for review whatever order the candidates arrived in.
 */
function resolveConflicts(
  fields: readonly Field[],
  rejected: RejectedCandidate[],
): Map<string, Field> {
  const groups = new Map<string, Map<string, Field>>();
  for (const f of fields) {
    const k = key(f);
    const byJson = groups.get(k) ?? new Map<string, Field>();
    byJson.set(stableStringify(f), f);
    groups.set(k, byJson);
  }
  const out = new Map<string, Field>();
  for (const [k, byJson] of groups) {
    const distinct = [...byJson.values()];
    const only = distinct[0];
    if (distinct.length === 1 && only) out.set(k, only);
    else
      for (const f of distinct)
        rejected.push({ candidate: toJsonValue(f), reason: "field.conflict" });
  }
  return out;
}

function key(ref: ElementRef): string {
  return `${ref.element}#${ref.index}`;
}

function compareRefs(a: ElementRef, b: ElementRef): number {
  return elementOrder(a.element) - elementOrder(b.element) || a.index - b.index;
}

function sortByJson<T>(items: readonly T[]): T[] {
  return items
    .map((item) => [stableStringify(item), item] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, item]) => item);
}

function assertRecord(record: ProposalRecordInput): void {
  if (
    !isRecord(record) ||
    typeof record.id !== "string" ||
    record.id.length === 0 ||
    !Array.isArray(record.originalLines) ||
    !record.originalLines.every((l) => typeof l === "string")
  ) {
    throw new TypeError("buildProposal: record needs an id and string originalLines");
  }
}

function assertPackRef(packRef: PackRef): void {
  if (
    !isRecord(packRef) ||
    typeof packRef.id !== "string" ||
    packRef.id.length === 0 ||
    typeof packRef.version !== "string" ||
    packRef.version.length === 0
  ) {
    throw new TypeError("buildProposal: packRef needs an id and a version");
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
