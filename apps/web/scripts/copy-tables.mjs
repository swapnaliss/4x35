// Reads the `| Key | en |` copy tables from docs/design/README.md ("## Component copy") and every
// docs/design/screens/*.md ("## Copy"). The design docs are the source of copy; en.json must hold
// every key with the same text (test/copy-sync.test.ts). Run `node scripts/sync-copy.mjs` to merge.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const KEY = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

/** @returns {{ file: string, key: string, en: string }[]} */
export function readCopyTables(repoRoot) {
  const design = join(repoRoot, "docs", "design");
  const files = [
    join(design, "README.md"),
    ...readdirSync(join(design, "screens"))
      .filter((f) => f.endsWith(".md"))
      .sort()
      .map((f) => join(design, "screens", f)),
  ];
  const rows = [];
  for (const file of files) {
    let inCopy = false;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (line.startsWith("## ")) inCopy = /^## (Component copy|Copy)\s*$/.test(line);
      if (!inCopy || !line.startsWith("| `")) continue;
      const cells = line
        .split(/(?<!\\)\|/)
        .slice(1, -1)
        .map((c) => c.trim());
      const key = (cells[0] ?? "").replace(/^`|`$/g, "");
      if (!KEY.test(key) || cells.length < 2) continue;
      rows.push({ file, key, en: (cells[1] ?? "").replace(/\\\|/g, "|") });
    }
  }
  return rows;
}
