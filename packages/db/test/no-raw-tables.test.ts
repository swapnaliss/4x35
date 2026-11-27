// M1-03 AC 8: no file outside `packages/db/src/repo/` imports the Drizzle tables. Workspace data is
// reached only through the scoped repositories, so a raw query cannot forget the workspace filter.
//
// The allow-list is explicit and every entry says why. Everything else in apps/, packages/ and
// integrations/ (product code, scripts and tests alike) is scanned.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { is, Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SCHEMA_DIR = "packages/db/src/schema/";

/** Paths (repo-relative, `/`-separated) allowed to import the tables, with the reason. */
const ALLOWED: readonly {
  readonly path: string;
  readonly typeOnly: boolean;
  readonly why: string;
}[] = [
  { path: "packages/db/src/repo/", typeOnly: false, why: "the repository layer itself" },
  { path: SCHEMA_DIR, typeOnly: false, why: "the table definitions" },
  { path: "packages/db/src/client.ts", typeOnly: false, why: "registers the tables with Drizzle" },
  { path: "packages/db/src/mappers/", typeOnly: true, why: "row types only, no queries" },
  { path: "packages/db/test/schema.test.ts", typeOnly: false, why: "DDL test of the schema" },
  { path: "packages/db/test/schema.int.test.ts", typeOnly: false, why: "DDL test of the schema" },
  {
    path: "packages/db/test/roundtrip.int.test.ts",
    typeOnly: false,
    why: "row round-trip test of the schema (M1-02)",
  },
];

const SCANNED_ROOTS = ["apps", "packages", "integrations"];
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "coverage", ".turbo"]);
const SOURCE = /\.(?:ts|tsx|mts|cts|js|mjs)$/;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
}

export interface TableImport {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

// `import … from "x"`, `export … from "x"`, `import("x")`, `import "x"`.
const STATIC = /(?:^|[;\s])(import|export)\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const BARE = /(?:^|[;\s])import\s+["']([^"']+)["']/g;

/**
 * The imports of `source` (a file at repo-relative `file`) that reach the Drizzle tables: a module
 * under `packages/db/src/schema/`, or the `schema` name of `@4x35/db`.
 */
export function tableImports(file: string, source: string): TableImport[] {
  const found: TableImport[] = [];
  const fileDir = dirname(file);
  const reachesSchema = (spec: string): boolean => {
    if (spec.startsWith(".")) {
      const target = join(fileDir, spec).split(sep).join("/");
      return `${target}/`.startsWith(SCHEMA_DIR) || target === SCHEMA_DIR.slice(0, -1);
    }
    return /^@4x35\/db\/.*schema/.test(spec);
  };
  for (const m of source.matchAll(STATIC)) {
    const [, , typeKw, clause = "", spec = ""] = m;
    const typeOnly = typeKw !== undefined;
    if (reachesSchema(spec)) found.push({ specifier: spec, typeOnly });
    else if (spec === "@4x35/db" && /(^|[\s{,*])(as\s+)?schema\b/.test(clause)) {
      // `import { schema } from "@4x35/db"` or `{ type X, schema }`: a value import of the tables.
      const names = clause
        .replace(/[{}]/g, "")
        .split(",")
        .map((n) => n.trim());
      const valueSchema = names.some((n) => /^schema(\s+as\s+\w+)?$/.test(n));
      if (valueSchema || /\*\s+as\s+schema/.test(clause)) found.push({ specifier: spec, typeOnly });
    }
  }
  for (const m of source.matchAll(DYNAMIC)) {
    const spec = m[1] ?? "";
    if (reachesSchema(spec)) found.push({ specifier: spec, typeOnly: false });
  }
  for (const m of source.matchAll(BARE)) {
    const spec = m[1] ?? "";
    if (reachesSchema(spec)) found.push({ specifier: spec, typeOnly: false });
  }
  return found;
}

function allowed(file: string, imp: TableImport): boolean {
  return ALLOWED.some(
    (a) =>
      (file === a.path || (a.path.endsWith("/") && file.startsWith(a.path))) &&
      (!a.typeOnly || imp.typeOnly),
  );
}

describe("no raw Drizzle tables outside packages/db/src/repo/ (M1-03 AC 8)", () => {
  it("the scanner finds table imports in each form (planted violations)", () => {
    const f = "apps/server/src/x.ts";
    // Built at run time, so this file's own text holds no table import for the scan to find.
    const S = ["..", "..", "..", "packages", "db", "src", "schema"].join("/");
    expect(tableImports(f, 'import { schema } from "@4x35/db";')).toHaveLength(1);
    expect(
      tableImports(f, 'import { type Database, schema, withTx } from "@4x35/db";'),
    ).toHaveLength(1);
    expect(tableImports(f, 'import { type Database, withTx } from "@4x35/db";')).toHaveLength(0);
    expect(tableImports(f, `import * as s from "${S}/index.js";`)).toHaveLength(1);
    expect(tableImports(f, `const s = await import("${S}/batches.js");`)).toHaveLength(1);
    expect(tableImports(f, `export { users } from "${S}/identity.js";`)).toHaveLength(1);
    const repoFile = "packages/db/src/repo/x.ts";
    const imp = tableImports(repoFile, 'import { users } from "../schema/index.js";');
    expect(imp).toHaveLength(1);
    expect(imp.every((i) => allowed(repoFile, i))).toBe(true);
    const mapper = "packages/db/src/mappers/x.ts";
    const valueImp = tableImports(mapper, 'import { users } from "../schema/identity.js";');
    expect(valueImp.every((i) => allowed(mapper, i))).toBe(false);
    const typeImp = tableImports(mapper, 'import type { users } from "../schema/identity.js";');
    expect(typeImp.every((i) => allowed(mapper, i))).toBe(true);
  });

  it("no file outside the allow-list imports the tables", () => {
    const files: string[] = [];
    for (const r of SCANNED_ROOTS) walk(join(ROOT, r), files);
    expect(files.length).toBeGreaterThan(50);
    const violations: string[] = [];
    for (const full of files) {
      const file = relative(ROOT, full).split(sep).join("/");
      for (const imp of tableImports(file, readFileSync(full, "utf8"))) {
        if (!allowed(file, imp)) violations.push(`${file} imports ${imp.specifier}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("the @4x35/db public API exports no table", () => {
    const tables = Object.entries(publicApi)
      .filter(([, v]) => is(v, Table))
      .map(([k]) => k);
    expect(tables).toEqual([]);
    expect(Object.keys(publicApi)).not.toContain("schema");
  });
});
