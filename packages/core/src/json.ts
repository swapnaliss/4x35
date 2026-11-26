/**
 * Stable JSON: object keys sorted by code unit, no whitespace, `undefined` members dropped. Two
 * structurally equal values always serialise to the same bytes, whatever their key insertion order.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export function stableStringify(value: unknown): string {
  return JSON.stringify(toJsonValue(value));
}

/**
 * A JSON-safe deep copy: keeps strings, finite numbers, booleans, null, arrays and plain objects
 * (keys sorted); anything else (functions, symbols, bigint, NaN, class instances) becomes null,
 * and `undefined` object members are dropped.
 */
export function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : toJsonValue(v)));
  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v !== undefined) out[key] = toJsonValue(v);
    }
    return out;
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
