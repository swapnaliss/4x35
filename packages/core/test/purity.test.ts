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
// M1-01 extends the M0-05 list to every I/O library and SDK the stack uses or could pull in.
const IO_PACKAGES = [
  // databases and jobs
  /^pg(-.+)?$/,
  /^pg-boss$/,
  /^postgres$/,
  /^drizzle-(orm|kit|zod)(\/.*)?$/,
  /^(ioredis|redis)$/,
  // HTTP servers and clients
  /^hono(\/.*)?$/,
  /^@hono\//,
  /^(undici|axios|node-fetch|got|ky|ws|express|fastify)$/,
  // model, cloud and platform SDKs
  /^@anthropic-ai\//,
  /^@aws-sdk\//,
  /^@smithy\//,
  /^(openai|@openai\/.+)$/,
  /^@google(-cloud)?\//,
  /^@modelcontextprotocol\//,
  /^@kirocrew\//,
  /^kirocrew(-.+)?$/,
  /^@sentry\//,
  /^@opentelemetry\//,
  // logging, files, processes
  /^pino(-.+)?$/,
  /^(exceljs|xlsx|chokidar|fs-extra|glob|execa)$/,
  // runtime-specific schemes
  /^(bun|deno):/,
  // outer workspaces: dependencies point inward to core
  /^@4x35\/(db|llm|server|web|mcp|formats|synth|kiro-power)(\/.*)?$/,
];

function isForbidden(specifier: string): boolean {
  if (specifier.startsWith("node:")) return true;
  if (builtins.has(specifier.split("/")[0] ?? "")) return true;
  return IO_PACKAGES.some((re) => re.test(specifier));
}

/** Runtime dependencies core may declare. Anything else must be argued in a ticket. */
const ALLOWED_DEPENDENCIES = ["zod"];

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
    for (const s of [
      "node:fs",
      "fs",
      "fs/promises",
      "crypto",
      "pg",
      "pg-boss",
      "drizzle-orm/pg-core",
      "hono/cors",
      "@anthropic-ai/sdk",
      "@aws-sdk/client-bedrock-runtime",
      "openai",
      "@modelcontextprotocol/sdk/server",
      "undici",
      "@4x35/db",
    ]) {
      expect(isForbidden(s), s).toBe(true);
    }
    for (const s of ["./provenance.js", "../elements.js", "zod", "@4x35/rulepacks"]) {
      expect(isForbidden(s), s).toBe(false);
    }
  });

  it("finds static, re-export, dynamic and require imports", () => {
    const src = [
      'import { readFileSync } from "node:fs";',
      'export { Pool } from "pg";',
      'const h = await import("hono");',
      'const s = require("@anthropic-ai/sdk");',
      'import type { X } from "drizzle-orm";',
    ].join("\n");
    const found = ts.preProcessFile(src, true, true).importedFiles.map((f) => f.fileName);
    expect(found.filter(isForbidden)).toEqual([
      "node:fs",
      "pg",
      "hono",
      "@anthropic-ai/sdk",
      "drizzle-orm",
    ]);
  });

  it("declares no runtime dependency but zod", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(
      Object.keys(pkg.dependencies ?? {}).filter((d) => !ALLOWED_DEPENDENCIES.includes(d)),
    ).toEqual([]);
  });
});
