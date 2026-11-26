import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROVENANCE_KINDS } from "../src/components/ProvenanceChip";
import { STATUSES } from "../src/components/StatusBadge";

// M1-06 AC 4: every status colour pair passes 4.5:1 in both themes, computed from tokens.css with
// the WCAG 2.2 relative-luminance formula. Text pairs need 4.5:1; the focus ring needs 3:1 (1.4.11).
const css = readFileSync(join(import.meta.dirname, "..", "src", "styles", "tokens.css"), "utf8");

/** Custom properties declared directly in the first block whose selector matches. */
function block(selector: (s: string) => boolean): Record<string, string> {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const sel = (m[1] ?? "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
    if (!selector(sel)) continue;
    const vars: Record<string, string> = {};
    for (const d of (m[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
      vars[d[1] as string] = (d[2] as string).replace(/\s+/g, " ").trim();
    return vars;
  }
  throw new Error("selector not found in tokens.css");
}

const light = block((s) => s === ":root");
const darkAttr = block((s) => s.includes('[data-theme="dark"]') && !s.includes(":not("));
const darkMedia = block((s) => s.includes(':root:not([data-theme="light"])'));
const dark = { ...light, ...darkAttr };

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(m[1] as string, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (ch[0] as number) + 0.7152 * (ch[1] as number) + 0.0722 * (ch[2] as number);
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

function resolve(vars: Record<string, string>, name: string): string {
  let v = vars[name];
  for (let i = 0; i < 5 && v?.startsWith("var("); i++)
    v = vars[v.slice(4, -1).split(",")[0]?.trim() ?? ""];
  if (!v) throw new Error(`${name} is not defined`);
  return v;
}

type Pair = [fg: string, bg: string, min: number];
const pairs: Pair[] = [
  ["--color-text", "--color-bg", 4.5],
  ["--color-text", "--color-surface", 4.5],
  ["--color-text", "--color-surface-raised", 4.5],
  ["--color-text-muted", "--color-bg", 4.5],
  ["--color-text-muted", "--color-surface", 4.5],
  ["--color-text-muted", "--color-surface-raised", 4.5],
  ["--color-primary-fg", "--color-primary", 4.5],
  ["--color-primary-fg", "--color-primary-hover", 4.5],
  ["--color-danger-fg", "--color-danger", 4.5],
  ["--color-focus", "--color-bg", 3],
  ["--color-focus", "--color-surface", 3],
  ["--color-border-strong", "--color-bg", 3],
  ["--color-border-strong", "--color-surface", 3],
  // Highlighted options, hovered and selected rows keep body and muted text readable.
  ["--color-text", "--color-row-hover", 4.5],
  ["--color-text", "--color-row-selected", 4.5],
  ["--color-text-muted", "--color-row-selected", 4.5],
  ["--color-text", "--color-highlight-span", 4.5],
  ...STATUSES.flatMap((s): Pair[] => [
    [`--status-${s}-fg`, `--status-${s}-bg`, 4.5],
    // Status text also appears on plain surfaces (field errors, toasts, panels).
    [`--status-${s}-fg`, "--color-surface", 4.5],
    [`--status-${s}-fg`, "--color-surface-raised", 4.5],
  ]),
  ...PROVENANCE_KINDS.map((k): Pair => [`--prov-${k}-fg`, `--prov-${k}-bg`, 4.5]),
];

describe("token contrast (WCAG 2.2)", () => {
  it("computes the known reference ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#767676", "#ffffff")).toBeGreaterThan(4.5);
  });

  it("the prefers-color-scheme dark block matches [data-theme=dark]", () => {
    expect(darkMedia).toEqual(darkAttr);
  });

  for (const [theme, vars] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    for (const [fg, bg, min] of pairs) {
      it(`${theme}: ${fg} on ${bg} >= ${min}:1`, () => {
        const ratio = contrast(resolve(vars, fg), resolve(vars, bg));
        expect(ratio, `${theme} ${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
