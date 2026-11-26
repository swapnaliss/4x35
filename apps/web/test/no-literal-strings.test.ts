import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Every user-visible string in components/ comes from an i18n key (ADR 0018, M1-06 AC 2). This
// parses each .tsx file and fails on JSX text, string-literal children and string-literal values
// of user-visible attributes. Class names, ids, data-* and ARIA state values are not copy.
const ROOT = join(import.meta.dirname, "..", "src", "components");
const VISIBLE_ATTRS = new Set([
  "aria-label",
  "aria-description",
  "aria-valuetext",
  "aria-roledescription",
  "aria-placeholder",
  "title",
  "placeholder",
  "alt",
  "label",
  "content",
  "description",
]);

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

const hasWords = (s: string) => /\p{L}/u.test(s);

function findLiterals(fileName: string, source: string): string[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hits: string[] = [];
  const where = (n: ts.Node) =>
    `${fileName}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && hasWords(node.text)) {
      hits.push(`${where(node)} text "${node.text.trim()}"`);
    } else if (ts.isJsxExpression(node) && node.expression && ts.isJsxElement(node.parent)) {
      const e = node.expression;
      if ((ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) && hasWords(e.text)) {
        hits.push(`${where(node)} child "${e.text}"`);
      } else if (ts.isTemplateExpression(e) && hasWords(e.getText())) {
        hits.push(`${where(node)} template child ${e.getText()}`);
      }
    } else if (ts.isJsxAttribute(node) && VISIBLE_ATTRS.has(node.name.getText())) {
      const init = node.initializer;
      const lit =
        init && ts.isStringLiteral(init)
          ? init.text
          : init &&
              ts.isJsxExpression(init) &&
              init.expression &&
              ts.isStringLiteral(init.expression)
            ? init.expression.text
            : undefined;
      if (lit !== undefined && hasWords(lit))
        hits.push(`${where(node)} ${node.name.getText()}="${lit}"`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return hits;
}

describe("no user-visible literal strings in components/", () => {
  const list = files(ROOT);

  it("finds the component files", () => {
    expect(list.length).toBeGreaterThanOrEqual(13);
  });

  it("detects a literal when one is present (the check itself works)", () => {
    const bad = `export const A = () => <div title="Hello"><p>Upload a file</p>{"Retry"}</div>;`;
    expect(findLiterals("bad.tsx", bad)).toHaveLength(3);
    const good = `export const A = ({t}) => <div title={t("x")} className="flex gap-2">{t("y")}</div>;`;
    expect(findLiterals("good.tsx", good)).toEqual([]);
  });

  for (const f of list) {
    it(relative(ROOT, f), () => {
      expect(findLiterals(relative(ROOT, f), readFileSync(f, "utf8"))).toEqual([]);
    });
  }
});
