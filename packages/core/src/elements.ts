/**
 * The ISO 20022 PostalAddress24 elements 4x35 can propose, with their maximum lengths.
 * The per-message-version element map (pain.001.001.03 lacks BldgNm, Flr, ...) is M2-06.
 */
export const ELEMENTS = [
  "StrtNm",
  "BldgNb",
  "BldgNm",
  "Flr",
  "PstBx",
  "Room",
  "PstCd",
  "TwnNm",
  "TwnLctnNm",
  "DstrctNm",
  "CtrySubDvsn",
  "Ctry",
  "AdrLine",
] as const;

export type Element = (typeof ELEMENTS)[number];

/** Maximum length of each element, in Unicode code points (XSD `maxLength` counts characters). */
export const ELEMENT_MAX_LENGTH: Readonly<Record<Element, number>> = Object.freeze({
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

/** `AdrLine` occurs 0..7 times; every other element at most once. */
export const ELEMENT_MAX_OCCURS: Readonly<Record<Element, number>> = Object.freeze(
  Object.fromEntries(ELEMENTS.map((e) => [e, e === "AdrLine" ? 7 : 1])) as Record<Element, number>,
);

export function isElement(value: unknown): value is Element {
  return typeof value === "string" && (ELEMENTS as readonly string[]).includes(value);
}

/** Position of an element in `ELEMENTS`: the sort order of fields in a Proposal. */
export function elementOrder(element: Element): number {
  return ELEMENTS.indexOf(element);
}

/** Length as the schema counts it: Unicode code points, not UTF-16 code units. */
export function valueLength(value: string): number {
  let n = 0;
  for (const _ of value) n++;
  return n;
}
