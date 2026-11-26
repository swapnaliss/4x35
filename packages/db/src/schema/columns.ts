// Shared column types and helpers for the schema modules (M1-02). Not a table module.
import { type SQL, sql } from "drizzle-orm";
import { type AnyPgColumn, check, customType, timestamp } from "drizzle-orm/pg-core";

/** `bytea`: original uploads and export artefacts (ADR 0003). node-postgres returns a Buffer. */
export const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
});

/** `citext` (extension installed by 0000_baseline): case-insensitive emails. */
export const citext = customType<{ data: string }>({ dataType: () => "citext" });

/** `timestamptz` read and written as a JS `Date`. */
export const timestamptz = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date", precision: 3 });

/** `<column> IN ('a', 'b', …)`. Values come from code constants, never from input. */
function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  for (const v of values) {
    if (!/^[a-z0-9_]+$/.test(v)) throw new Error(`enum value not allowed in a CHECK: ${v}`);
  }
  return sql`${column} IN (${sql.raw(values.map((v) => `'${v}'`).join(", "))})`;
}

/** A named CHECK that pins an enum column to its value set (ticket M1-02 scope 3). */
export function enumCheck(
  table: string,
  column: AnyPgColumn,
  columnName: string,
  values: readonly string[],
) {
  return check(`${table}_${columnName}_check`, inList(column, values));
}
