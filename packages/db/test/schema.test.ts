// Unit checks of the M1-02 schema modules (no database needed).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { enumCheck } from "../src/schema/columns.js";
import * as schema from "../src/schema/index.js";

const src = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), "utf8");

describe("schema modules", () => {
  it("define exactly the 16 tables of the ticket", () => {
    const names = Object.values(schema)
      .filter((v) => is(v, PgTable))
      .map((t) => getTableName(t as PgTable))
      .sort();
    expect(names).toEqual([
      "api_tokens",
      "audit_events",
      "batches",
      "decisions",
      "exports",
      "idempotency_keys",
      "invites",
      "job_timings",
      "memberships",
      "payment_file_links",
      "preflight_runs",
      "proposals",
      "records",
      "sessions",
      "users",
      "workspaces",
    ]);
  });

  it("enumCheck refuses a value that is not a plain token (it is inlined into DDL)", () => {
    expect(() => enumCheck("t", schema.batches.kind, "c", ["ok", "x'); drop table t; --"])).toThrow(
      /not allowed in a CHECK/,
    );
  });

  it("the migrator imports neither the schema nor @4x35/core (runtime image, BL-01 7130276258)", () => {
    for (const f of ["migrate.ts", "pool.ts", "seed.ts"]) {
      const imports = [...src(f).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
      expect(
        imports.filter((i) => /@4x35\/core|\/schema|\/client|\/mappers/.test(i ?? "")),
      ).toEqual([]);
    }
  });
});
