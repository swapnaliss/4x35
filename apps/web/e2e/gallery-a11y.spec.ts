import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// M1-06 AC 3: axe on the component gallery at 375 / 768 / 1440 px, light and dark, reports zero
// serious or critical violations. Screenshots and axe JSON go to .review/M1-06/ (gitignored) for
// the independent ui-reviewer.
const OUT = join(import.meta.dirname, "..", "..", "..", ".review", "M1-06");
mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 768, 1440] as const;
const THEMES = ["light", "dark"] as const;
const VIEWS = ["all", "dialog", "tooltip", "toast", "select"] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function open(page: Page, view: string, theme: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({
    colorScheme: theme === "dark" ? "dark" : "light",
    reducedMotion: "reduce",
  });
  await page.goto(`/dev/gallery.html?view=${view}&theme=${theme}`);
  await expect(page.locator('[data-gallery="4x35-gallery-entry"]')).toBeVisible();
  if (view === "select") {
    await page.getByRole("combobox", { name: "Bank rule pack" }).click();
    await expect(page.getByRole("listbox")).toBeVisible();
  }
  if (view === "dialog") await expect(page.getByRole("dialog")).toBeVisible();
  if (view === "tooltip") await expect(page.getByRole("tooltip").first()).toBeVisible();
  if (view === "toast") await expect(page.getByText("371 records approved").first()).toBeVisible();
}

for (const view of VIEWS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`gallery ${view} @ ${width} ${theme}: no serious or critical axe violations`, async ({
        page,
      }) => {
        await open(page, view, theme, width);
        const name = `${view}-${width}-${theme}`;
        await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: view === "all" });
        const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
        writeFileSync(join(OUT, `${name}.axe.json`), JSON.stringify(results, null, 2));
        const blocking = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .map(
            (v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
          );
        expect(blocking, blocking.join("\n")).toEqual([]);
        // Nothing may scroll sideways at any width (WCAG 1.4.10 reflow); wide tables scroll inside
        // their own wrapper instead.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
}

for (const theme of THEMES) {
  test(`keyboard focus is visible (${theme})`, async ({ page }) => {
    await open(page, "all", theme, 1440);
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toHaveCount(1);
    const ring = await focused.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: Number.parseFloat(s.outlineWidth) };
    });
    expect(ring.style).toBe("solid");
    expect(ring.width).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: join(OUT, `focus-1440-${theme}.png`) });
    // Every interactive element in the gallery is reachable with Tab and shows the same ring.
    let checked = 0;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const w = await page.evaluate(() => {
        const el = document.activeElement;
        return el && el !== document.body
          ? Number.parseFloat(getComputedStyle(el).outlineWidth)
          : -1;
      });
      if (w === -1) break;
      expect(w).toBeGreaterThanOrEqual(2);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
}
