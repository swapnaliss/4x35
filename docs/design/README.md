# 4x35 design system

The interface for 4x35: free-text MT addresses in, ISO 20022 structured or hybrid addresses out,
with a reason for every field and a person's approval for every change. This file sets the
direction, principles, copy rules, tokens, status and provenance vocabularies and the shared
component states. The screen specs are in [`screens/`](screens/).

Written by the `ux-designer` agent for ticket M1-06 (issue #19). The `ui-reviewer` agent, not the
designer or the builder, approves the UI built from it.

**Skill note.** The `frontend-design` skill was not installed in the session that wrote this
system. The rules below come from the `ux-designer` agent brief, PROJECT.md and the ADRs alone.

**Sources.** [`PROJECT.md`](../../PROJECT.md) (pain, users, journey, storyboard, claims),
[ADR 0008](../adr/0008-provenance.md) (provenance), [ADR 0009](../adr/0009-rule-packs.md) (packs),
[ADR 0012](../adr/0012-react-spa.md) (SPA, states, WCAG), [ADR 0013](../adr/0013-auth.md) (invite
only, four-eyes), [ADR 0018](../adr/0018-globalisation.md) (scripts, i18n),
[ADR 0022](../adr/0022-payment-file-link.md) (linking), [`docs/architecture.md`](../architecture.md)
(state machines; the UI polls, there is no push channel).

---

## Users

Every screen spec names which of these users it serves first. The hackathon judge is a user, not an
afterthought: Design is 20% of the score, and a judge has about three minutes.

| User | Device and context | Language and script | Skill | The one job |
|---|---|---|---|---|
| **AP clerk** (primary) | Windows laptop docked to a 24-inch monitor (1440 and wider), office, the week before a payment run; interrupted often | Works in English or a local language; reads supplier names in Latin, Cyrillic, CJK, Devanagari and Arabic script without being able to type all of them | Spreadsheet-fluent; does not know ISO 20022 element names | Clear the supplier list so the next payment run passes the bank's address rules, without retyping 500 addresses |
| **Payroll specialist or bureau** | Laptop (1440, sometimes 768 split-screen next to the payroll system), monthly cut-off, many client companies | English; employee addresses in up to about 30 countries | Knows the payroll system's export; knows the bank sent a notice; little XML | Make every employee address in this month's payroll file meet the bank pack, then hand back a file in the same layout |
| **Treasury analyst or ERP admin** | Desktop, two monitors, keyboard-heavy; may also call the API or MCP server | English; reads XML and element names | Knows pain.001 versions, PostalAddress6 vs 24, CBPR+ | Pre-flight the ERP's pain.001 against the chosen pack and get a corrected file whose bytes outside `PstlAdr` are untouched |
| **Small bank or fintech operations** (secondary) | Desktop in an ops room, queue of client files, audit expectations | English; client data in many scripts | Expert in payment formats and exceptions | See per-transaction findings for a client's file against a named pack version, with an audit trail to show the client |
| **Hackathon judge** | Laptop browser at 1440, sometimes a phone at 375; signed into a judge sandbox with credentials from Devpost; has never heard of 4x35 | English | Technical, not a payments specialist | In three minutes: understand what this does, see an address turned into fields with reasons, see a field left empty rather than guessed, and see a payment file go red to green |

Design consequences:
- **The first screen explains itself.** The batches home (app shell) carries a one-line statement of
  what 4x35 does and the five-step journey, with the sandbox's sample batches already present.
- **Desktop-first, phone-capable.** Review and pre-flight are dense desktop tasks; at 375 every
  screen still works (read, approve one record, download) with 44px targets.
- **Element names are secondary.** Labels lead with plain words ("Town") and show the ISO element
  (`TwnNm`) beside it in mono for the people who need it.
- **Scripts are first-class.** Original lines render in their own script; nothing is
  transliterated on screen unless a transform did it, and then both are shown.

## Direction: "the ledger and the ruler"

4x35 is a working tool for people checking money movement. It should feel like a well-kept ledger:
quiet paper-and-ink surfaces, dense tables, strong type hierarchy, colour reserved for status and
provenance. Nothing decorative competes with the evidence.

The one signature element is the **35-column ruler**: wherever the original free-text lines
appear, they render in mono on a faint 35-character grid (four rows, one per MT line), with a
column count at the right edge. Each structured field links back to the exact characters it came
from: focus or hover a field, and its span lights up in the ruler (`--color-highlight-span`, plus
an underline so it is not colour alone). It shows the product's promise (nothing invented) and the
"resurrection" theme (the four 35-character lines of SWIFT MT) without a single illustration.

What we avoid: gradient hero banners, stock illustrations, emoji, glassmorphism, card grids of
vanity numbers, spinners without words, and any number that has no measurement behind it.

Visual rules:
- **Type:** system fonts only (`--font-sans`, `--font-mono`), so every script renders from the OS
  without a web-font download. Tabular numerals (`font-variant-numeric: tabular-nums`) for every
  count, length and amount.
- **Density:** `--text-sm` (14px) is the default in tables; `--text-base` (16px) for body and
  inputs. Row height `--row-height` (44px); a compact density (`--row-height-compact`, 36px) exists
  for desktop only.
- **Colour:** neutrals carry the layout; primary ink blue (`--color-primary`) marks the one main
  action per view; status and provenance colours appear only inside a StatusBadge, ProvenanceChip
  or a row-edge marker, and always beside an icon and a label.
- **Space:** a 4px base (`--space-1` to `--space-8`). Panels separate with hairlines
  (`--color-border`), not heavy shadows. Shadows only for floating layers (dialogs, popovers,
  toasts).
- **Motion:** short and functional (row status changes, panel open). Zero under
  `prefers-reduced-motion: reduce`; the running icon stops rotating.
- **Themes:** light and dark, from `prefers-color-scheme` by default, with a manual override
  (System / Light / Dark) in the user menu that sets `data-theme` on `<html>`.

## Principles

1. **Evidence over decoration.** Every status links to its reason: a badge in a table opens the
   finding, a field opens its provenance and the span it came from, a pack name opens its source
   URL and retrieved date.
2. **Status is never colour alone.** Every status has an icon shape, a text label and a colour. The
   palette is chosen so that `pass` and `fail` differ in both hue family (teal against vermillion)
   and lightness, and stays readable for deuteranopia, protanopia and tritanopia; the icon and the
   label carry the meaning anyway.
3. **Calm density.** Many rows, few colours. One primary action per view. Secondary detail lives
   one keystroke away (record detail, tooltips), not on the main surface.
4. **Honest copy.** We say what we checked and against which pack version. We never promise a bank
   outcome, never present a cutover date as near, and never show a number we have not measured
   (see Copy rules).
5. **Live, not refresh.** Long work (parsing, structuring, pre-flight) shows a ProgressPanel that
   polls the batch status: a label, done / total, the current step and when it last updated. Never
   a bare spinner. Rows change status in place as results arrive.
6. **Every state designed.** Each spec defines Empty, Loading, Error, Partial and Success. Offline
   is handled by the shell (a banner; actions queue nothing and say so).
7. **Every script renders.** Original text displays in its script with `dir="auto"` and the
   correct `lang` where known; mono for the 4 x 35 lines; no clipping of tall glyphs (Devanagari
   matras, Arabic diacritics) because line height is never below `--leading-tight`.
8. **WCAG 2.2 AA is the floor.** Contrast (4.5:1 text, 3:1 non-text), a visible 2px focus ring
   with 3:1 contrast, full keyboard paths, targets of 24px on desktop and 44px on touch widths,
   logical reading order, no information lost at 400% zoom or 320px width, reduced motion.
9. **A human approves every change.** Nothing is applied without an approve action. Bulk approve
   exists, but only over rows whose every value is auto-approvable, and it states what it will
   record before it records it.

## Copy rules

Voice: plain, short, specific. Second person ("you"), present tense, sentence case. Name the
thing, the count and the pack.

**Claims discipline** (from PROJECT.md and CLAUDE.md; a `ui-reviewer` blocks any breach):
- Results say **"checked against `<pack>@<version>`"**, with the pack's source and retrieved date a
  click away. Example: "Checked against `cbpr-plus-generic@2026.11` (source retrieved 18 Nov 2026)".
- **Never promise a bank outcome.** Do not write that a bank will take, process, approve, refuse or
  bounce a file. Write what the pack's rules say: "fails 2 rules in `<pack>@<version>`", "meets
  every rule in `<pack>@<version>`".
- **Swift's date is not set.** Swift deferred the removal of unstructured addresses on 27 Aug 2026
  and has not set a new date. Never present any cutover as imminent; no countdowns. If a pack has
  `effective_from: not_set`, the UI shows "Effective from: not set".
- **No number without a measurement.** Counts come from the batch on screen. Accuracy figures
  appear only on the accuracy page (a later ticket), per country with n. No "99% accurate", no
  "saves N hours".
- **No certification language.** 4x35 does not certify compliance. Avoid "compliant",
  "certified", "approved by the bank". "Meets the pack's rules" is the strongest claim.
- **Never invent, and say so.** An empty field says why it is empty ("Left empty: no part of the
  input is a town, so nothing was guessed"). Never "Unknown" without a reason.
- **Never truncate, and say so.** An over-length value is a finding with both numbers: "41
  characters; `TwnNm` allows 35".
- **Bank names as text.** No bank logos (ADR 0021).
- **Synthetic data is labelled.** Judge sandboxes carry the banner "Sandbox: synthetic data, reset
  nightly".

Mechanics:
- **i18n keys appear in every spec.** Every user-visible string has a key in the spec's `## Copy`
  table (`| Key | en |`). Keys are `<screen>.<area>.<item>` in lower camelCase segments (for
  example `reviewQueue.toolbar.bulkApprove`); shared component strings are `components.<component>.<item>`,
  `status.<status>.label|description` and `provenance.<kind>.label|description` (below).
  Interpolation is `{{name}}`. No string is concatenated in code; whole sentences are keys so word
  order can change per locale.
- **Counts avoid plural grammar in English** ("Selected: {{count}}") until M3-10 adds i18next
  plural forms per locale.
- Dates: ISO 8601 UTC in data, local date and time in the UI with the time zone named on hover.
- Numbers: tabular figures; thousands separators from the locale.
- Element names in mono and never translated (`TwnNm`, `AdrLine`).
- Errors say what happened, why if known, and what to do next, in that order. No "Oops".

---

## Design tokens

Source of truth in code: [`apps/web/src/styles/tokens.css`](../../apps/web/src/styles/tokens.css).
Light values sit on `:root`, dark on `[data-theme="dark"]`, and the dark values repeat under
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }`. Colours are `#rrggbb`
only; a token contrast test parses them. Feature screens use these tokens and no ad-hoc colours.

Contrast is checked by a test, not assumed: every `--status-*-fg` on its `--status-*-bg`, every
`--prov-*-fg` on its `--prov-*-bg`, `--color-text` and `--color-text-muted` on `--color-bg`,
`--color-surface` and `--color-surface-raised`, `--color-primary-fg` on `--color-primary` and
`--color-primary-hover`, and `--color-danger-fg` on `--color-danger` are all at least 4.5:1 in both
themes; `--color-focus` and `--color-border-strong` are at least 3:1 against `--color-bg` and
`--color-surface`; every `--status-*-fg` is also at least 4.5:1 on `--color-surface` so a status
label can sit on a plain row.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#f5f4f0` | `#111418` | Page background behind panels |
| `--color-surface` | `#ffffff` | `#171b20` | Panels, table body, dialogs |
| `--color-surface-raised` | `#fbfaf7` | `#1f242a` | Sticky headers, toolbars, popovers, the evidence pane |
| `--color-border` | `#dcd9d1` | `#2f353d` | Hairlines between rows and panels (decorative, not a boundary that conveys state) |
| `--color-border-strong` | `#7d7a72` | `#7b838e` | Input, select and checkbox outlines (3:1 non-text contrast) |
| `--color-text` | `#1a1d21` | `#e7e9ec` | Body text, values, headings |
| `--color-text-muted` | `#545961` | `#a5adb8` | Secondary text: hints, metadata, column headers |
| `--color-primary` | `#1f4b84` | `#8fb4ec` | Primary button fill, links, current step |
| `--color-primary-fg` | `#ffffff` | `#0d1a2e` | Text and icons on primary |
| `--color-primary-hover` | `#173a68` | `#a9c6f2` | Primary button hover and pressed |
| `--color-danger` | `#b3261e` | `#f29b8f` | Danger button fill, destructive text |
| `--color-danger-fg` | `#ffffff` | `#2a0a06` | Text on danger |
| `--color-focus` | `#1f5fd1` | `#8ab8ff` | Focus ring on every interactive element |
| `--color-overlay` | `#11151a` | `#000000` | Dialog scrim, mixed with --overlay-opacity |
| `--overlay-opacity` | `0.55` | `0.65` | Scrim strength for color-mix with --color-overlay |
| `--color-row-hover` | `#f0eee8` | `#1d2228` | Table row under the pointer |
| `--color-row-selected` | `#e6edf7` | `#1c2a3d` | Table row selected for bulk action (always paired with a checked checkbox) |
| `--color-highlight-span` | `#fff1b8` | `#4a3d0c` | Highlight of the input span a field came from, in the original-lines ruler |
| `--status-pass-fg` | `#0b5f55` | `#7fd6c7` | Status `pass`: icon and label text |
| `--status-pass-bg` | `#e2f2ee` | `#0b2420` | Status `pass`: badge fill |
| `--status-pass-border` | `#3f8f84` | `#3f9486` | Status `pass`: badge outline and row-edge marker |
| `--status-fail-fg` | `#86230b` | `#ffc2ad` | Status `fail`: icon and label text |
| `--status-fail-bg` | `#fbdccf` | `#5c1f0f` | Status `fail`: badge fill |
| `--status-fail-border` | `#c4532f` | `#c9603c` | Status `fail`: badge outline and row-edge marker |
| `--status-warning-fg` | `#6b4a00` | `#f2d27a` | Status `warning`: icon and label text |
| `--status-warning-bg` | `#fbefc8` | `#352a08` | Status `warning`: badge fill |
| `--status-warning-border` | `#a07a12` | `#a8862a` | Status `warning`: badge outline and row-edge marker |
| `--status-review-fg` | `#5b2a86` | `#d4b8f0` | Status `review`: icon and label text |
| `--status-review-bg` | `#efe6f8` | `#2c1c40` | Status `review`: badge fill |
| `--status-review-border` | `#8a5cb8` | `#8f6bbd` | Status `review`: badge outline and row-edge marker |
| `--status-approved-fg` | `#23408f` | `#b3c6f5` | Status `approved`: icon and label text |
| `--status-approved-bg` | `#e3e9f8` | `#1a2648` | Status `approved`: badge fill |
| `--status-approved-border` | `#5672bf` | `#6a84c8` | Status `approved`: badge outline and row-edge marker |
| `--status-empty-fg` | `#4a4f57` | `#c2c7ce` | Status `empty`: icon and label text |
| `--status-empty-bg` | `#eeede9` | `#262a30` | Status `empty`: badge fill |
| `--status-empty-border` | `#85827a` | `#7d848d` | Status `empty`: badge outline and row-edge marker |
| `--status-running-fg` | `#0a5577` | `#92d0ee` | Status `running`: icon and label text |
| `--status-running-bg` | `#dff0f8` | `#0d2a3a` | Status `running`: badge fill |
| `--status-running-border` | `#3e8ab0` | `#4a93b8` | Status `running`: badge outline and row-edge marker |
| `--prov-span-fg` | `#1d4a78` | `#a9c8ef` | Provenance `span`: chip label and icon |
| `--prov-span-bg` | `#e4edf7` | `#172a40` | Provenance `span`: chip fill |
| `--prov-span-border` | `#5b82ad` | `#5b83b3` | Provenance `span`: chip outline (dashed for dataset, inferred, external) |
| `--prov-transform-fg` | `#0c5866` | `#8fd4e0` | Provenance `transform`: chip label and icon |
| `--prov-transform-bg` | `#ddf0f3` | `#0d2c33` | Provenance `transform`: chip fill |
| `--prov-transform-border` | `#3e8c99` | `#3f909e` | Provenance `transform`: chip outline (dashed for dataset, inferred, external) |
| `--prov-dataset-fg` | `#6e4300` | `#f0c784` | Provenance `dataset`: chip label and icon |
| `--prov-dataset-bg` | `#f9ebd2` | `#33240a` | Provenance `dataset`: chip fill |
| `--prov-dataset-border` | `#a8752a` | `#a87d34` | Provenance `dataset`: chip outline (dashed for dataset, inferred, external) |
| `--prov-inferred-fg` | `#84195f` | `#f0a9d6` | Provenance `inferred`: chip label and icon |
| `--prov-inferred-bg` | `#f7e2ef` | `#3a1330` | Provenance `inferred`: chip fill |
| `--prov-inferred-border` | `#b5508f` | `#b65a93` | Provenance `inferred`: chip outline (dashed for dataset, inferred, external) |
| `--prov-human-fg` | `#2e5b17` | `#a9d98e` | Provenance `human`: chip label and icon |
| `--prov-human-bg` | `#e5f1dc` | `#1b2e12` | Provenance `human`: chip fill |
| `--prov-human-border` | `#5f8f45` | `#66984b` | Provenance `human`: chip outline (dashed for dataset, inferred, external) |
| `--prov-external-fg` | `#5a4434` | `#d9c3b1` | Provenance `external`: chip label and icon |
| `--prov-external-bg` | `#efe8e1` | `#2e241c` | Provenance `external`: chip fill |
| `--prov-external-border` | `#8f7562` | `#927a67` | Provenance `external`: chip outline (dashed for dataset, inferred, external) |
| `--font-sans` | `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", "Noto Sans CJK JP", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "PingFang TC", "Microsoft JhengHei", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Kohinoor Devanagari", "Nirmala UI", "Noto Sans Devanagari", "Geeza Pro", "Noto Sans Arabic", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif` | same as light | All UI text; system fonts with CJK, Devanagari, Arabic, Cyrillic fallbacks |
| `--font-mono` | `ui-monospace, "SFMono-Regular", "SF Mono", "Cascadia Mono", "Segoe UI Mono", Menlo, Consolas, "Liberation Mono", "Noto Sans Mono", "DejaVu Sans Mono", "Noto Sans Mono CJK JP", "MS Gothic", monospace` | same as light | Original 4 x 35 lines, ISO element names, XML, hashes, IBANs |
| `--text-xs` | `0.75rem` | same as light | 12px: badges, chip labels, counters |
| `--text-sm` | `0.875rem` | same as light | 14px: table cells, form hints (the dense default) |
| `--text-base` | `1rem` | same as light | 16px: body, inputs (16px stops iOS zoom) |
| `--text-lg` | `1.125rem` | same as light | 18px: panel titles |
| `--text-xl` | `1.375rem` | same as light | 22px: screen titles |
| `--text-2xl` | `1.75rem` | same as light | 28px: the one headline number per screen |
| `--leading-tight` | `1.25` | same as light | Headings, table rows |
| `--leading-normal` | `1.5` | same as light | Body copy, reasons |
| `--weight-regular` | `400` | same as light | Body |
| `--weight-medium` | `500` | same as light | Labels, badges |
| `--weight-semibold` | `600` | same as light | Headings, headline numbers |
| `--space-1` | `0.25rem` | same as light | Spacing step 1 |
| `--space-2` | `0.5rem` | same as light | Spacing step 2 |
| `--space-3` | `0.75rem` | same as light | Spacing step 3 |
| `--space-4` | `1rem` | same as light | Spacing step 4 |
| `--space-5` | `1.5rem` | same as light | Spacing step 5 |
| `--space-6` | `2rem` | same as light | Spacing step 6 |
| `--space-7` | `3rem` | same as light | Spacing step 7 |
| `--space-8` | `4rem` | same as light | Spacing step 8 |
| `--radius-sm` | `0.25rem` | same as light | Badges, chips, checkboxes |
| `--radius-md` | `0.375rem` | same as light | Buttons, inputs |
| `--radius-lg` | `0.625rem` | same as light | Panels, dialogs |
| `--focus-ring-width` | `2px` | same as light | Focus outline width (2.4.11, 2.4.13) |
| `--focus-ring-offset` | `2px` | same as light | Gap between element and focus outline |
| `--target-min` | `44px` | same as light | Minimum touch target at 375 and 768 |
| `--target-min-desktop` | `24px` | same as light | Minimum pointer target at 1440 (2.5.8) |
| `--row-height` | `2.75rem` | same as light | Review and pre-flight row height (comfortable) |
| `--row-height-compact` | `2.25rem` | same as light | Row height in compact density (desktop only, never below 24px targets) |
| `--shadow-sm` | `0 1px 2px 0 color-mix(in srgb, #1a1d21 8%, transparent)` | `0 1px 2px 0 color-mix(in srgb, #000000 40%, transparent)` | Sticky toolbars, chips on hover |
| `--shadow-md` | `0 4px 12px -2px color-mix(in srgb, #1a1d21 12%, transparent), 0 2px 4px -2px color-mix(in srgb, #1a1d21 8%, transparent)` | `0 4px 12px -2px color-mix(in srgb, #000000 50%, transparent), 0 2px 4px -2px color-mix(in srgb, #000000 40%, transparent)` | Dialogs, popovers, toasts |
| `--duration-fast` | `120ms` | same as light | Hover, focus, chip transitions (0 under reduced motion) |
| `--duration-normal` | `200ms` | same as light | Panel open, row-status change (0 under reduced motion) |
| `--easing-standard` | `cubic-bezier(0.2, 0, 0, 1)` | same as light | All transitions |

---

## Status vocabulary

Seven statuses, fixed. Every place a status appears uses the StatusBadge (icon + label + colour).
Icons are 16px inline SVGs on a 16 x 16 grid, 1.5px stroke, `currentColor` (the status `fg`),
`aria-hidden="true"`; the label carries the accessible name.

| Status | Meaning | Icon shape (16px SVG) | Label (en) | Where it comes from |
|---|---|---|---|---|
| `pass` | Meets every rule of the chosen pack version | A check mark inside a full circle: circle r=6.5 centred at (8,8), check from (5,8.2) to (7.2,10.4) to (11,6) | Pass | Record `already_valid`, or a proposal with no findings; a pre-flight transaction with no findings |
| `fail` | A finding the pack flags with severity `reject` | A cross (two diagonals from (5.5,5.5) to (10.5,10.5) and back) inside a regular octagon (stop-sign outline, flat top) | Fail | Any `reject` finding; over-length values; a missing mandatory element (`TwnNm`, `Ctry` in hybrid) |
| `warning` | Passes, with a note the pack raises (severity `warn` or `strip`) | An equilateral triangle, point up, rounded corners, with a vertical bar and a dot (!) inside | Warning | `warn` findings; `strip` findings (the pack says content would be removed) |
| `review` | Needs a person before it can move on | A flag on a pole: vertical pole at x=4 from y=2 to 14, a rectangular pennant from (4,3) to (12,3) to (10,5.5) to (12,8) to (4,8) | Needs review | Record `needs_review`; a value with `dataset`, `inferred` or `external` provenance; an ambiguous or missing payment-file link |
| `approved` | A person approved it (or edited and approved it) | A shield (flat top, pointed bottom) with a check mark inside | Approved | Record `approved` or `edited`; the decision names the person |
| `empty` | Deliberately left empty: no value had valid provenance, so nothing was guessed | A dashed circle outline (r=6.5, dash 2 / gap 1.6, no fill, nothing inside) | Left empty | A field with no provenance; a record marked `unknown` by a reviewer |
| `running` | A job is working on it right now | Two curved arrows chasing each other around a circle (a refresh loop); rotates 1 turn per 1.2 s, static under reduced motion | Running | Batch `parsing`, `structuring`; a pre-flight run in progress; a record `pending` or `proposed` |

Rules:
- Badge text is always the label, never just the icon. In very narrow cells (375), the badge may
  drop to icon-only **only** if the label is in the row's accessible name and a visible legend sits
  above the list; the default is icon + label.
- Rows in the review queue and pre-flight carry a 3px left-edge marker in `--status-*-border` as a
  scanning aid; it is redundant with the badge, never the only signal.
- Red to green means `fail` to `pass` (vermillion octagon to teal circle). The change animates the
  badge only (a 200ms cross-fade, none under reduced motion) and is announced in a polite live
  region.

## Provenance vocabulary

Six kinds, fixed by ADR 0008. Every proposed value carries exactly one. The ProvenanceChip shows the
kind's icon and label; its tooltip (and the record detail) shows the reason: the span, the
transform name and version, the dataset record, the rule that inferred it, the person and time, or
the token that sent it.

| Kind | Meaning | Icon shape (16px SVG) | Label (en) | Auto-approvable |
|---|---|---|---|---|
| `span` | Copied exactly from the input text (NFC-normalised) | A pair of square brackets `[ ]` | From input | Yes, if validators agree |
| `transform` | A deterministic rule from the closed, versioned transform table applied to input text (NFC, case, whitespace, postcode format, ISO 9 Cyrillic, Latin-ASCII folding, `country-alias`) | A right arrow passing through a small square | Transformed | Yes, if validators agree |
| `dataset` | A unique match in GeoNames, Japan Post or chromium-i18n, backed by an input span; the record is cited | A database cylinder (ellipse top, two bands) | Dataset match | **Never** |
| `inferred` | Derived from other evidence (for example country from postcode shape) | A dot with a dashed line leading to a hollow dot | Inferred | **Never** |
| `human` | Typed or approved by a person in the UI | A person: circle head over rounded shoulders | Entered by a person | Not applicable: it is the approval |
| `external` | Sent by an outside service through an API token | A square with an arrow leaving its top-right corner | External | **Never** (needs a UI reviewer's approval) |

How the UI shows "never auto-approvable" (`dataset`, `inferred`, `external`):
1. The chip has a **dashed** border (`--prov-*-border`), while `span` and `transform` chips have a
   solid one. The difference is shape, not only colour.
2. The chip's accessible name and tooltip end with "Needs individual approval".
3. A record holding any such value has status `review`, is sorted above auto-approvable records in
   risk order, and is **excluded from bulk approve**; the bulk-approve dialog states how many rows
   were excluded and why.
4. In record detail, each such field shows the evidence (dataset name, record id, licence
   attribution, or the inference rule) and its own approve control.

---

## Components

States every implementation must render (the gallery shows each one, in both themes). All
interactive components show the focus ring: `outline: var(--focus-ring-width) solid var(--color-focus); outline-offset: var(--focus-ring-offset)`
on `:focus-visible`. Minimum target `--target-min-desktop` (24px) at 1440 and `--target-min`
(44px) at 375 and 768.

### Base

| Component | Variants and states | Notes |
|---|---|---|
| **Button** | `primary` (fill `--color-primary`), `secondary` (surface fill, `--color-border-strong` outline), `ghost` (no fill, text in `--color-primary`), `danger` (fill `--color-danger`). States: default, hover, active, focus-visible, disabled, loading | Disabled uses `aria-disabled="true"` when a reason exists, so it stays focusable and its tooltip explains why (for example four-eyes). Loading keeps the label, adds a 16px running icon before it, sets `aria-busy="true"`, and blocks repeat clicks; the label may change to the action in progress ("Approving") |
| **Input** | default, focus, invalid (border `--status-fail-border` + octagon icon + message below, `aria-invalid="true"`, `aria-describedby` to the message), disabled | Label always visible above; hint text below in `--color-text-muted`; character counter for length-limited ISO fields ("8 / 35"), which turns into a `fail` message when exceeded and never cuts the text |
| **Select** | default, open, focus, invalid, disabled | Radix Select; typeahead; options can carry a secondary line (pack source, retrieved date) |
| **Table** | default, sortable header (with `aria-sort`), row hover, row selected, row focused, sticky header, virtualised body | `role="grid"` when rows are keyboard-navigable (review, pre-flight), plain `table` otherwise. Tabular numerals in numeric columns, right aligned. Selection uses a leading checkbox column (TableSelectCell / TableSelectAllHead); the caption sits above the scroll area and names the scroll region. |
| **Dialog** | default, with destructive action, loading (primary in loading state) | Radix Dialog; focus moves to the title, is trapped, returns to the trigger on close; Esc closes unless a request is in flight; scrim is `--color-overlay` at `--overlay-opacity` |
| **Toast** | `info`, `success`, `error` | Bottom-right at 1440, bottom full-width at 375, above the keyboard safe area. Info and success: `role="status"`, auto-dismiss after 6 s, paused on hover or focus. Error: `role="alert"`, stays until dismissed. Every toast has a close button and, where useful, one action ("Undo", "View") |
| **Tooltip** | default | Opens on hover after 300ms and on keyboard focus immediately; dismissable with Esc without moving focus (1.4.13); never the only place essential information lives on touch (tap the chip opens a popover instead) |
| **Skeleton** | text line, badge, table row | Static blocks in `--color-border` at 60% height of the content they replace; no shimmer under reduced motion; always paired with a visible text label of what is loading (ProgressPanel or a caption) |

### Project

| Component | Variants and states | Notes |
|---|---|---|
| **StatusBadge** | one per status: `pass`, `fail`, `warning`, `review`, `approved`, `empty`, `running`; sizes `sm` (table) and `md` (headers); optional count ("Fail 412") | Icon + label + colour, never colour alone. `fg` on `bg` with a 1px `border`. Optional `description` shown in its tooltip. As a link, it navigates to the reason |
| **ProvenanceChip** | one per kind: `span`, `transform`, `dataset`, `inferred`, `human`, `external`; solid border for auto-approvable kinds, dashed for the others | Button that opens a tooltip (pointer) or popover (touch, keyboard Enter) with the reason. Accessible name: "{{kind label}}: {{reason}}" plus "Needs individual approval" where it applies |
| **EmptyState** | title, body, optional action (Button), optional secondary link | Left-aligned in tables, centred only in full-screen empties. No illustration; a 24px status or step icon at most |
| **ErrorState** | renders an RFC 9457 problem+json: `title`, `detail`, `status`, `instance` (trace id), optional `errors[]` list; retry action; copy-trace-id action | `role="alert"` when it replaces content after a user action. Shows the HTTP status as "Error {{status}}" in muted text; the trace id in mono with a copy button so support can find the log line. 401 sends to sign-in; 403 explains the role; 409 offers reload of the latest version; 429 shows when to retry |
| **ProgressPanel** | determinate (done / total), indeterminate (step known, total not yet), stalled (no update for 30 s), failed, completed | Always: a label ("Structuring addresses"), the current step ("Step 3 of 4: matching postcodes"), done / total when known, last-updated time. `role="status"` with `aria-live="polite"`, announcements throttled to one per 10 s and on step change. Indeterminate still names the step. A native `progress` element carries the value |

## Component copy

Keys used by the shared components. Screen-specific copy lives in each screen spec.

| Key | en |
|---|---|
| `components.button.loading` | Working |
| `components.input.counter` | {{used}} / {{max}} |
| `components.input.overLimit` | {{used}} characters; {{element}} allows {{max}}. Nothing is cut: shorten it or leave it for review. |
| `components.input.required` | Required |
| `components.select.placeholder` | Choose |
| `components.select.noOptions` | No options |
| `components.table.sortAscending` | Sorted ascending |
| `components.table.sortDescending` | Sorted descending |
| `components.table.selectRow` | Select row |
| `components.table.selectRowNamed` | Select {{row}} |
| `components.table.selectAll` | Select all rows that can be bulk approved |
| `components.dialog.close` | Close |
| `components.dialog.cancel` | Cancel |
| `components.toast.dismiss` | Dismiss |
| `components.toast.region` | Notifications |
| `components.toast.undo` | Undo |
| `components.toast.view` | View |
| `components.tooltip.moreInfo` | More information |
| `components.skeleton.loading` | Loading {{what}} |
| `components.emptyState.defaultTitle` | Nothing here yet |
| `components.errorState.title` | Something went wrong |
| `components.errorState.status` | Error {{status}} |
| `components.errorState.traceId` | Trace id |
| `components.errorState.copyTraceId` | Copy trace id |
| `components.errorState.copied` | Trace id copied |
| `components.errorState.fallbackDetail` | The server did not say what went wrong. Try again. If it keeps happening, send the trace id shown here, if there is one, to your workspace owner. |
| `components.errorState.retry` | Try again |
| `components.errorState.signInAgain` | Sign in again |
| `components.errorState.reloadLatest` | Load the latest version |
| `components.errorState.retryAfter` | Too many requests. Try again in {{seconds}} seconds. |
| `components.errorState.forbidden` | Your role ({{role}}) cannot do this. Ask a workspace owner. |
| `components.errorState.offlineTitle` | You are offline |
| `components.errorState.offline` | You are offline. Nothing was saved. Reconnect and try again. |
| `components.progressPanel.counter` | {{done}} of {{total}} |
| `components.progressPanel.step` | Step {{current}} of {{steps}}: {{stepName}} |
| `components.progressPanel.indeterminate` | {{stepName}}. Counting rows. |
| `components.progressPanel.updated` | Updated {{time}} |
| `components.progressPanel.stalled` | No update for {{seconds}} seconds. The job is still queued; you can leave this page. |
| `components.progressPanel.failed` | Stopped at step {{current}}: {{reason}} |
| `components.progressPanel.completed` | Done in {{duration}} |
| `components.statusBadge.withCount` | {{label}} {{count}} |
| `components.provenanceChip.needsApproval` | Needs individual approval |
| `components.provenanceChip.accessibleName` | {{label}}: {{reason}} |
| `components.provenanceChip.accessibleNameNeedsApproval` | {{label}}: {{reason}}. Needs individual approval. |
| `status.pass.label` | Pass |
| `status.pass.description` | Meets every rule in {{pack}}. |
| `status.fail.label` | Fail |
| `status.fail.description` | Fails a rule in {{pack}}. Open it to see which one. |
| `status.warning.label` | Warning |
| `status.warning.description` | Meets the rules in {{pack}}, with a note to read. |
| `status.review.label` | Needs review |
| `status.review.description` | A person needs to look at this before it can be used. |
| `status.approved.label` | Approved |
| `status.approved.description` | Approved by {{name}} on {{date}}. |
| `status.empty.label` | Left empty |
| `status.empty.description` | No value had a source in the input, so nothing was guessed. |
| `status.running.label` | Running |
| `status.running.description` | A job is working on this now. |
| `provenance.span.label` | From input |
| `provenance.span.description` | Copied exactly from the original lines: "{{span}}". |
| `provenance.transform.label` | Transformed |
| `provenance.transform.description` | "{{span}}" changed by the rule {{transform}} (v{{version}}). |
| `provenance.dataset.label` | Dataset match |
| `provenance.dataset.description` | The only match for "{{span}}" in {{dataset}} (record {{recordId}}). |
| `provenance.inferred.label` | Inferred |
| `provenance.inferred.description` | Derived from {{evidence}} by the rule {{rule}}. |
| `provenance.human.label` | Entered by a person |
| `provenance.human.description` | Entered or approved by {{name}} on {{date}}. |
| `provenance.external.label` | External |
| `provenance.external.description` | Sent by {{tokenName}} through the API on {{date}}. |

Placeholder for the production entry until M1-07 ships the app shell (then these keys are removed):

| Key | en |
|---|---|
| `app.placeholder.title` | 4x35 is being built |
| `app.placeholder.body` | This page will become the 4x35 workspace once the first screens are released. |

## Screen specs

| Screen | Spec | Built in |
|---|---|---|
| App shell and batches home | [`screens/app-shell.md`](screens/app-shell.md) | M1-07 |
| Sign in and accept invite | [`screens/sign-in-and-invite.md`](screens/sign-in-and-invite.md) | M1-07 |
| Upload and mapping | [`screens/upload-and-mapping.md`](screens/upload-and-mapping.md) | M1-07, M2 |
| Health report | [`screens/health-report.md`](screens/health-report.md) | M1-07, M2 |
| Review queue (hero) | [`screens/review-queue.md`](screens/review-queue.md) | M2 |
| Record detail | [`screens/record-detail.md`](screens/record-detail.md) | M2 |
| Pre-flight | [`screens/preflight.md`](screens/preflight.md) | M2 |
| Export | [`screens/export.md`](screens/export.md) | M1-07, M2 |

Later screens (accuracy, attributions, privacy) get specs in their own tickets. Every spec has the
same sections: Purpose, Layout (375 / 768 / 1440), Components, States (Empty, Loading, Error,
Partial, Success), Interactions, Keyboard map, Copy (i18n keys), Accessibility.

All sample data in these specs is synthetic and fictitious (for example "Kestrel Lantern Works
GmbH, Laternengasse 12, 99999 Beispielstadt").
