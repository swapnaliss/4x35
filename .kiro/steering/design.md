---
inclusion: fileMatch
fileMatchPattern: ["apps/web/**", "docs/design/**"]
---

# Design rules for the web app

Source of truth: [docs/design/README.md](../../docs/design/README.md),
[tokens.css](../../apps/web/src/styles/tokens.css), [app.css](../../apps/web/src/styles/app.css).
Where this file and those differ, they win. Fix this file.

## 1. Screens
- Build every screen to its spec in `docs/design/screens/`.
- A screen without a spec gets one from the `ux-designer` agent first. No spec, no code.
- Every screen passes the `ui-reviewer` agent before it merges.
- Each spec defines the five states (see Accessibility) and a `## Copy` table.

## 2. Tokens
- Values live in `tokens.css` (light and dark). `app.css` maps them to Tailwind utilities.
- Use only the utilities below. The Tailwind default palette, font, text, radius and shadow scales are cleared, so `bg-red-500` does not exist.
- No raw colours: no hex, `rgb()`, `hsl()`, `oklch()` or named colours in components, CSS or inline styles.
- Add a new colour as a token in `tokens.css` (both themes, contrast test green), then map it in `app.css`.

| Role | Token | Utility (bg-, text-, border-) |
|---|---|---|
| Page | `--color-bg` | `bg-canvas` |
| Surface | `--color-surface`, `--color-surface-raised` | `bg-panel`, `bg-panel-raised` |
| Border | `--color-border`, `--color-border-strong` | `border-line`, `border-line-strong` |
| Text | `--color-text`, `--color-text-muted` | `text-fg`, `text-fg-muted` |
| Primary | `--color-primary`, `-hover`, `-fg` | `bg-accent`, `bg-accent-hover`, `text-on-accent` |
| Danger | `--color-danger`, `-fg` | `bg-destructive`, `text-on-destructive` |
| Focus, overlay | `--color-focus`, `--color-overlay` | `ring` colour `ring-ring`, `bg-scrim` |
| Rows | `--color-row-hover`, `--color-row-selected` | `bg-row-hover`, `bg-row-selected` |
| Span highlight | `--color-highlight-span` | `bg-span-highlight` |

- Status colours: `text-st-<status>`, `bg-st-<status>-bg`, `border-st-<status>-line`.
- Provenance colours: `text-pv-<kind>`, `bg-pv-<kind>-bg`, `border-pv-<kind>-line`.
- Type scale: `text-cap`, `text-dense`, `text-body`, `text-lead`, `text-title`, `text-headline`. Fonts: `font-ui`, `font-code` (use mono for the 4 x 35 lines and ISO element names).
- Radius: `rounded-chip`, `rounded-control`, `rounded-panel`. Shadow: `shadow-low`, `shadow-float`.
- Size: `min-h-target`, `min-w-target`, `min-h-target-desktop`, `h-row`, `h-row-compact`. Utilities: `focus-ring`, `tabular`.
- Spacing uses the Tailwind scale. Line height is never below `--leading-tight`.

## 3. Status vocabulary
Seven statuses, fixed. Render every one with `StatusBadge`: icon, label and colour together. Never colour alone.

| Status | Label | Icon shape |
|---|---|---|
| `pass` | Pass | check in a full circle |
| `fail` | Fail | cross in an octagon |
| `warning` | Warning | triangle with exclamation mark |
| `review` | Needs review | flag on a pole |
| `approved` | Approved | shield with a check |
| `empty` | Left empty | dashed circle, nothing inside |
| `running` | Running | two chasing arrows (static under reduced motion) |

- Icons are 16px inline SVG from `components/icons.tsx`, `currentColor`, `aria-hidden`. The label is the accessible name.
- Icon-only badges are allowed at 375 only with the label in the row's accessible name and a visible legend.
- The 3px row-edge marker is redundant with the badge, never the only signal.

## 4. Provenance vocabulary
Six kinds (ADR 0008), one per value, shown with `ProvenanceChip`.

| Kind | Label | Border | Auto-approvable |
|---|---|---|---|
| `span` | From input | solid | yes, if validators agree |
| `transform` | Transformed | solid | yes, if validators agree |
| `dataset` | Dataset match | dashed | never |
| `inferred` | Inferred | dashed | never |
| `human` | Entered by a person | solid | not applicable |
| `external` | External | dashed | never |

- `dataset`, `inferred` and `external` chips have a dashed border and end their tooltip and accessible name with "Needs individual approval".
- A record holding one of them is status `review`, sorts above auto-approvable records, and is excluded from bulk approve. The bulk dialog says how many rows were excluded and why.
- Record detail shows the evidence and a separate approve control for each such field.

## 5. Copy rules
- Voice: plain, short, specific. Second person, present tense, sentence case. No "Oops".
- Say "checked against `<pack>@<version>`" and put the pack source and retrieved date one click away.
- Never promise a bank outcome. Write what the pack's rules say: "fails 2 rules in `<pack>@<version>`", "meets every rule in `<pack>@<version>`".
- Never write "compliant", "certified" or "approved by the bank". Never use bank logos.
- Swift's cutover date is not set. No countdowns, no "soon". A pack with `effective_from: not_set` shows "Effective from: not set".
- No number without a measurement. Counts come from the batch on screen. Accuracy appears only per country, with n.
- Never invent. An empty field says why it is empty. Never show a bare "Unknown".
- Never truncate. Over-length is a finding with both numbers: "41 characters; `TwnNm` allows 35".
- Errors say what happened, why if known, and what to do next.
- Sandbox data carries the banner "Sandbox: synthetic data, reset nightly".
- i18n: every user-visible string is a key. No literal strings in JSX (`no-literal-strings.test.ts`).
  - Keys: `<screen>.<area>.<item>`, `components.<component>.<item>`, `status.<status>.label|description`, `provenance.<kind>.label|description`.
  - Interpolate with `{{name}}`. Never concatenate. Write whole sentences so word order can change.
  - Avoid English plural grammar ("Selected: {{count}}").
  - Element names (`TwnNm`, `AdrLine`) are mono and never translated.
- `apps/web/src/i18n/en.json` stays in sync with the spec Copy tables. Run `apps/web/scripts/sync-copy.mjs`. `apps/web/test/copy-sync.test.ts` must pass.

## 6. Accessibility
- WCAG 2.2 AA is the floor: 4.5:1 text, 3:1 non-text. `tokens-contrast.test.ts` must pass in both themes.
- Every interactive element uses the `focus-ring` utility (2px, offset 2px).
- Targets are 44px (`min-h-target`) at 375 and 768, 24px at desktop.
- Every action has a keyboard path. Grids use arrow keys. Dialogs trap focus and return it to the trigger. Esc closes a tooltip without moving focus.
- No information lost at 320px width or 400% zoom.
- Render original text with `dir="auto"` and `lang` where known.
- Five designed states on every screen: empty, loading, error, partial, success.
- Long work shows `ProgressPanel` (label, step, done / total, last updated). Never a bare spinner.
- Live updates use `role="status"` and `aria-live="polite"`. Errors that replace content use `role="alert"`.
- Reduced motion: no rotation, shimmer or cross-fade under `prefers-reduced-motion`.
- Disabled actions with a reason use `aria-disabled="true"` and a tooltip that gives the reason.

## 7. Components
Reuse before you build. Import from `apps/web/src/components`.
- Base (`components/ui`): `Button`, `Input`, `Select`, `Table`, `Dialog`, `Toast`, `Tooltip`, `Skeleton`.
- Project: `StatusBadge`, `ProvenanceChip`, `EmptyState`, `ErrorState`, `ProgressPanel`.
- `ErrorState` renders an RFC 9457 problem+json with a trace id and a retry action.
- Pair `Skeleton` with a visible text label.
- A new shared component needs a row in the README Components tables and all its states in the gallery, in both themes.
