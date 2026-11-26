/** Joins class names, skipping falsy parts. Tokens carry the design; this only composes them. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
