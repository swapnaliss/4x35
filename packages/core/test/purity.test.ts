import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Architecture rule: packages/core is pure. Its src/ may import no Node built-in and no I/O
// library; the core talks to the outside world only through interfaces other packages implement.
const SRC = fileURLToPath(new URL("../src", import.meta.url));

const builtins = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));
const IO_PACKAGES = [
  /^pg(-.+)?$/,
  /^pg-boss$/,
  /^drizzle-(orm|kit)(\/.*)?$/,
  /^hono(\/.*)?$/,
  /^@hono\//,
  /^@anthropic-ai\//,
  /^@modelcontextprotocol\//,
  /^undici$/,
  /^pino(-.+)?$/,
  /^@4x35\/(db|llm|server|web|mcp)(\/.*)?$/,
];

function isForbidden(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  if (builtins.has(specifier.split("/")[0] ?? "")) return true;
  return IO_PACKAGES.some((re) => re.test(specifier));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(c|m)?tsx?$/.test(e.name) ? [p] : [];
  });
}

function violations(): string[] {
  return sourceFiles(SRC).flatMap((file) =>
    ts
      .preProcessFile(readFileSync(file, "utf8"), true, true)
      .importedFiles.map((f) => f.fileName)
      .filter(isForbidden)
      .map((spec) => `${relative(SRC, file)} imports ${spec}`),
  );
}

describe("packages/core purity guard", () => {
  it("finds source files to check", () => {
    expect(sourceFiles(SRC).length).toBeGreaterThan(0);
  });

  it("src imports no Node built-in or I/O module", () => {
    expect(violations()).toEqual([]);
  });

  it("recognises the forms a forbidden import can take", () => {
    for (const s of ["node:fs", "fs", "fs/promises", "pg", "drizzle-orm/pg-core", "@4x35/db"]) {
      expect(isForbidden(s), s).toBe(true);
    }
    for (const s of ["./provenance.js", "zod", "@4x35/rulepacks"]) {
      expect(isForbidden(s), s).toBe(false);
    }
  });
});
