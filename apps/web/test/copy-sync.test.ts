import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readCopyTables } from "../scripts/copy-tables.mjs";
import { i18n } from "../src/i18n";

// M1-06 scope 5: en keys for every string in the components and the specs. Every row of every
// `| Key | en |` table in docs/design/ resolves in en.json to the same text.
const rows = readCopyTables(join(import.meta.dirname, "..", "..", ".."));

describe("copy tables in docs/design match en.json", () => {
  it("reads the README and all eight screen specs", () => {
    const files = new Set(rows.map((r) => r.file.split("/").pop()));
    expect(files.size).toBe(9);
    expect(rows.length).toBeGreaterThan(500);
  });

  it("every key is defined with the spec's text", () => {
    const missing = rows.filter((r) => i18n.getResource("en", "translation", r.key) !== r.en);
    expect(missing.map((r) => `${r.key} (${r.file.split("/").pop()})`)).toEqual([]);
  });
});
