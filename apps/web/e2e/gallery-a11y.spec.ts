import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// M1-06 AC 3: axe on the component gallery at 375 / 768 / 1440 px, light and dark, reports zero
// serious or critical violations. Screenshots and axe JSON go to .review/M1-06/ (gitignored) for
// the independent ui-reviewer. Also: target sizes, visible focus, hover and focus state captures.
const OUT = join(import.meta.dirname, "..", "..", "..", ".review", "M1-06");
mkdirSync(OUT, { recursive: true });

const WIDTHS = [375, 768, 1440] as const;
const THEMES = ["light", "dark"] as const;
const VIEWS = ["all", "dialog", "dialog-destructive", "dialog-busy", "toast", "select"] as const;
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];
const INTERACTIVE = 'button, a[href], input, [role="combobox"], [tabindex="0"]';

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
  if (view.startsWith("dialog")) await expect(page.getByRole("dialog")).toBeVisible();
  if (view === "toast") await expect(page.getByText("371 records approved").first()).toBeVisible();
}

async function axe(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  writeFileSync(join(OUT, `${name}.axe.json`), JSON.stringify(results, null, 2));
  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  expect(blocking, blocking.join("\n")).toEqual([]);
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
        await axe(page, name);
        // Nothing may scroll sideways at any width (WCAG 1.4.10 reflow); wide tables scroll inside
        // their own labelled region instead.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
}

// Tooltips and the chip popover, each opened the way a person opens it.
const TIPS = [
  {
    name: "chip-popover",
    open: async (p: Page) => {
      const chip = p.getByRole("button", { name: /Dataset match/ });
      await chip.focus();
      await p.keyboard.press("Enter");
      await expect(p.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "chip-tooltip",
    open: async (p: Page) => {
      await p.getByRole("button", { name: /Dataset match/ }).hover();
      await expect(p.getByRole("tooltip")).toBeVisible();
    },
  },
  {
    name: "disabled-reason",
    open: async (p: Page) => {
      await p.keyboard.press("Tab");
      await p.keyboard.press("Tab");
      await expect(p.getByRole("tooltip")).toContainText("Four-eyes");
    },
  },
  {
    name: "badge-description",
    open: async (p: Page) => {
      await p.locator('[data-status="fail"]').focus();
      await expect(p.getByRole("tooltip")).toBeVisible();
    },
  },
  {
    name: "plain",
    open: async (p: Page) => {
      await p.getByRole("button", { name: "Approve", exact: true }).hover();
      await expect(p.getByRole("tooltip")).toBeVisible();
    },
  },
];

for (const tip of TIPS) {
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      test(`tooltip ${tip.name} @ ${width} ${theme}: opens, no serious or critical axe violations`, async ({
        page,
      }) => {
        await open(page, "tooltip", theme, width);
        await tip.open(page);
        const name = `tooltip-${tip.name}-${width}-${theme}`;
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        await axe(page, name);
      });
    }
  }
}

// WCAG 2.5.8 and the design README: 44px targets at 375 and 768, 24px at desktop.
for (const width of WIDTHS) {
  test(`target sizes @ ${width}`, async ({ page }) => {
    await open(page, "all", "light", width);
    const min = width >= 1024 ? 24 : 44;
    const small = await page.locator(INTERACTIVE).evaluateAll(
      (els, m) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            // A checkbox's hit area is its wrapping label.
            const box = (el.closest("label") ?? el).getBoundingClientRect();
            return {
              el: el.outerHTML.slice(0, 90),
              w: Math.round(box.width),
              h: Math.round(box.height),
            };
          })
          .filter((b) => b.w < m || b.h < m),
      min,
    );
    expect(small, JSON.stringify(small, null, 1)).toEqual([]);
  });
}

for (const theme of THEMES) {
  test(`keyboard focus is visible on every tab stop, with captures (${theme})`, async ({
    page,
  }) => {
    await open(page, "all", theme, 1440);
    const seen = new Set<string>();
    let checked = 0;
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const s = getComputedStyle(el);
        const kind =
          el.getAttribute("role") ??
          (el.tagName === "INPUT"
            ? `input-${(el as HTMLInputElement).type}`
            : el.tagName.toLowerCase());
        const chip = el.dataset.provenance ? "chip" : el.dataset.status ? "badge" : "";
        return {
          kind: chip || kind,
          style: s.outlineStyle,
          width: Number.parseFloat(s.outlineWidth),
        };
      });
      if (!info) break;
      expect(info.style, `tab stop ${i} (${info.kind})`).toBe("solid");
      expect(info.width, `tab stop ${i} (${info.kind})`).toBeGreaterThanOrEqual(2);
      if (!seen.has(info.kind)) {
        seen.add(info.kind);
        await page
          .locator(":focus")
          .screenshot({ path: join(OUT, `focus-${info.kind}-${theme}.png`) });
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
    // Rows of a keyboard grid take focus programmatically (M2-18 adds roving focus).
    await page.locator('[data-row="R-0103"]').focus();
    await page
      .locator('[data-row="R-0103"]')
      .screenshot({ path: join(OUT, `focus-table-row-${theme}.png`) });
    await page.screenshot({ path: join(OUT, `focus-1440-${theme}.png`) });
  });

  test(`hover and pressed states are captured (${theme})`, async ({ page }) => {
    await open(page, "all", theme, 1440);
    for (const name of ["Approve 371", "Edit field", "Skip", "Discard batch"]) {
      const b = page.getByRole("button", { name, exact: true }).first();
      await b.hover();
      await b.screenshot({ path: join(OUT, `hover-${name.replace(/\W+/g, "-")}-${theme}.png`) });
      await page.mouse.down();
      await b.screenshot({ path: join(OUT, `active-${name.replace(/\W+/g, "-")}-${theme}.png`) });
      await page.mouse.up();
      await page.keyboard.press("Escape");
    }
    const row = page.getByRole("row", { name: /R-0003/ });
    await row.hover();
    await row.screenshot({ path: join(OUT, `hover-table-row-${theme}.png`) });
  });
}
