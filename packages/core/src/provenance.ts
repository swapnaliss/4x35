/**
 * Provenance (ADR 0008): every proposed value carries exactly one of six kinds, and
 * `proposeField` is the checker that decides whether a value may enter a Proposal. It is
 * defensive: callers (parsers, dataset lookups, the LLM adapter, the API) may hand it anything,
 * so every argument is validated at run time and anything not provably derived is rejected.
 *
 * Offsets in a span are UTF-16 code-unit offsets into `nfc(input)`, the NFC form of the record's
 * original lines joined with "\n" (`recordInput`). A span is `[start, end)`.
 *
 * HOT FILE: one ticket at a time (CLAUDE.md).
 */
import { ELEMENT_MAX_OCCURS, type Element, isElement } from "./elements.js";
import { deepFreeze } from "./freeze.js";
import { getTransform } from "./transforms.js";

export const PROVENANCE_KINDS = [
  "span",
  "transform",
  "dataset",
  "inferred",
  "human",
  "external",
] as const;

export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

export interface Span {
  readonly start: number;
  readonly end: number;
}

/** One occurrence of an element; `index` is 0 except for AdrLine (0..6). */
export interface ElementRef {
  readonly element: Element;
  readonly index: number;
}

export interface SpanProvenance {
  readonly kind: "span";
  readonly span: Span;
}

export interface TransformProvenance {
  readonly kind: "transform";
  readonly transform: { readonly id: string; readonly version: number };
  readonly source: Span;
}

export interface DatasetProvenance {
  readonly kind: "dataset";
  readonly datasetId: string;
  readonly recordKey: string;
  readonly unique: true;
  /** The input span that corroborates the match. */
  readonly source: Span;
}

export interface InferredProvenance {
  readonly kind: "inferred";
  readonly ruleId: string;
  readonly from: { readonly span: Span } | { readonly field: ElementRef };
}

export interface HumanProvenance {
  readonly kind: "human";
  /** The session actor (a user id) who entered the value in the UI. */
  readonly actorId: string;
}

export interface ExternalProvenance {
  readonly kind: "external";
  /** The API token the value came through. */
  readonly tokenId: string;
}

export type Provenance =
  | SpanProvenance
  | TransformProvenance
  | DatasetProvenance
  | InferredProvenance
  | HumanProvenance
  | ExternalProvenance;

/** An accepted value: its element occurrence, the full value, and how it was derived. */
export interface Field {
  readonly element: Element;
  readonly index: number;
  readonly value: string;
  readonly provenance: Provenance;
}

export const REJECTION_REASONS = [
  "candidate.invalid",
  "element.unknown",
  "element.index_out_of_range",
  "value.not_string",
  "value.empty",
  "provenance.missing",
  "provenance.kind_unknown",
  "span.invalid",
  "span.out_of_bounds",
  "span.splits_code_point",
  "span.mismatch",
  "transform.unknown",
  "transform.mismatch",
  "dataset.reference_missing",
  "dataset.not_unique",
  "inferred.rule_missing",
  "inferred.source_missing",
  "inferred.source_field_missing",
  "human.actor_missing",
  "external.token_missing",
  "field.conflict",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type ProposeFieldResult =
  | { readonly ok: true; readonly field: Field }
  | { readonly ok: false; readonly reason: RejectionReason };

/** The checker's view of a record's text: original lines joined with "\n". */
export function recordInput(originalLines: readonly string[]): string {
  return originalLines.join("\n");
}

export function nfc(text: string): string {
  return text.normalize("NFC");
}

/**
 * Accept `value` for `element` only if `provenance` proves where it came from:
 * - `span`: value equals `nfc(input).slice(start, end)` exactly;
 * - `transform`: a table entry (id + version) replayed on its source span yields the value;
 * - `dataset`: dataset id, record key, `unique: true` and a corroborating input span;
 * - `inferred`: a rule id and the span or field it was derived from;
 * - `human`: a session actor id; `external`: an API token id.
 * Anything else is rejected with a reason, and the field stays empty.
 */
export function proposeField(
  input: string,
  element: Element | ElementRef,
  value: string,
  provenance: Provenance,
): ProposeFieldResult {
  const ref = toElementRef(element as unknown);
  if (!ref.ok) return ref;
  if (typeof value !== "string") return reject("value.not_string");
  if (value.length === 0) return reject("value.empty");
  const text = nfc(input);
  const checked = checkProvenance(text, value, provenance as unknown);
  if (!checked.ok) return checked;
  return { ok: true, field: freezeField({ ...ref.ref, value, provenance: checked.provenance }) };
}

/**
 * `span` and `transform` fields are auto-approvable only when the deterministic validators agree;
 * `dataset`, `inferred`, `external` and `human` never are (a human value is approved by the
 * review flow, not automatically).
 */
export function isAutoApprovable(
  field: Pick<Field, "provenance">,
  validatorsAgree: boolean,
): boolean {
  switch (field.provenance.kind) {
    case "span":
    case "transform":
      return validatorsAgree === true;
    default:
      return false;
  }
}

type Checked<T> =
  | { readonly ok: true; readonly provenance: T }
  | { ok: false; reason: RejectionReason };

function reject(reason: RejectionReason): { ok: false; reason: RejectionReason } {
  return { ok: false, reason };
}

function toElementRef(
  element: unknown,
): { ok: true; ref: ElementRef } | { ok: false; reason: RejectionReason } {
  if (typeof element === "string") {
    return isElement(element)
      ? { ok: true, ref: { element, index: 0 } }
      : reject("element.unknown");
  }
  if (!isRecord(element)) return reject("element.unknown");
  const { element: name, index } = element;
  if (!isElement(name)) return reject("element.unknown");
  if (!Number.isInteger(index) || (index as number) < 0) {
    return reject("element.index_out_of_range");
  }
  if ((index as number) >= ELEMENT_MAX_OCCURS[name]) return reject("element.index_out_of_range");
  return { ok: true, ref: { element: name, index: index as number } };
}

function checkProvenance(text: string, value: string, p: unknown): Checked<Provenance> {
  if (!isRecord(p)) return reject("provenance.missing");
  switch (p.kind) {
    case "span": {
      const span = checkSpan(text, p.span);
      if (!span.ok) return span;
      if (text.slice(span.span.start, span.span.end) !== value) return reject("span.mismatch");
      return ok({ kind: "span", span: span.span });
    }
    case "transform": {
      const t = p.transform;
      if (!isRecord(t) || typeof t.id !== "string" || typeof t.version !== "number") {
        return reject("transform.unknown");
      }
      const entry = getTransform(t.id, t.version);
      if (!entry) return reject("transform.unknown");
      const span = checkSpan(text, p.source);
      if (!span.ok) return span;
      if (entry.apply(text.slice(span.span.start, span.span.end)) !== value) {
        return reject("transform.mismatch");
      }
      return ok({
        kind: "transform",
        transform: { id: entry.id, version: entry.version },
        source: span.span,
      });
    }
    case "dataset": {
      if (!nonEmpty(p.datasetId) || !nonEmpty(p.recordKey)) {
        return reject("dataset.reference_missing");
      }
      if (p.unique !== true) return reject("dataset.not_unique");
      const span = checkSpan(text, p.source);
      if (!span.ok) return span;
      return ok({
        kind: "dataset",
        datasetId: p.datasetId,
        recordKey: p.recordKey,
        unique: true,
        source: span.span,
      });
    }
    case "inferred": {
      if (!nonEmpty(p.ruleId)) return reject("inferred.rule_missing");
      const from = p.from;
      if (!isRecord(from)) return reject("inferred.source_missing");
      if ("span" in from) {
        const span = checkSpan(text, from.span);
        if (!span.ok) return span;
        return ok({ kind: "inferred", ruleId: p.ruleId, from: { span: span.span } });
      }
      if ("field" in from) {
        const ref = toElementRef(from.field);
        if (!ref.ok) return reject("inferred.source_missing");
        return ok({ kind: "inferred", ruleId: p.ruleId, from: { field: ref.ref } });
      }
      return reject("inferred.source_missing");
    }
    case "human":
      if (!nonEmpty(p.actorId)) return reject("human.actor_missing");
      return ok({ kind: "human", actorId: p.actorId });
    case "external":
      if (!nonEmpty(p.tokenId)) return reject("external.token_missing");
      return ok({ kind: "external", tokenId: p.tokenId });
    default:
      return reject("provenance.kind_unknown");
  }
}

function checkSpan(
  text: string,
  span: unknown,
): { ok: true; span: Span } | { ok: false; reason: RejectionReason } {
  if (!isRecord(span)) return reject("span.invalid");
  const { start, end } = span;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return reject("span.invalid");
  const s = start as number;
  const e = end as number;
  if (s < 0 || e <= s) return reject("span.invalid");
  if (e > text.length) return reject("span.out_of_bounds");
  if (!text.slice(s, e).isWellFormed()) return reject("span.splits_code_point");
  return { ok: true, span: Object.freeze({ start: s, end: e }) };
}

function ok<T extends Provenance>(provenance: T): Checked<T> {
  return { ok: true, provenance };
}

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function freezeField(field: Field): Field {
  return deepFreeze(field);
}
