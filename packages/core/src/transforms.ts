/**
 * The closed, versioned transform table (ADR 0008). A `transform` provenance names one entry by
 * `id` and `version`; the checker replays it on the cited input span. Nothing outside this table
 * can produce a value. Postcode format, ISO 9 Cyrillic and Latin-ASCII folding arrive with M2-10.
 */
export interface TransformDef {
  readonly id: string;
  readonly version: number;
  readonly description: string;
  /** Pure and total: same input, same output, no I/O. */
  readonly apply: (text: string) => string;
}

function def(id: string, version: number, description: string, apply: (t: string) => string) {
  return Object.freeze({ id, version, description, apply }) satisfies TransformDef;
}

/** Any Unicode whitespace (`\s` with the `u` flag covers tab, NBSP, ideographic space, ...). */
const WHITESPACE_RUN = /\s+/gu;

export const TRANSFORMS = Object.freeze([
  def("nfc", 1, "Unicode NFC normalisation", (t) => t.normalize("NFC")),
  def(
    "whitespace.collapse",
    1,
    "Collapse every run of Unicode whitespace to one U+0020 and trim both ends",
    (t) => t.replace(WHITESPACE_RUN, " ").trim(),
  ),
  def("case.upper", 1, "Locale-independent upper case (String.prototype.toUpperCase)", (t) =>
    t.toUpperCase(),
  ),
] as const);

export type TransformId = (typeof TRANSFORMS)[number]["id"];

export const TRANSFORM_IDS: readonly TransformId[] = TRANSFORMS.map((t) => t.id);

/** The entry with exactly this id and version, or undefined. */
export function getTransform(id: string, version: number): TransformDef | undefined {
  return TRANSFORMS.find((t) => t.id === id && t.version === version);
}
