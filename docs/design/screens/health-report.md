# Health report

Serves first: **AP clerk** and the **finance or treasury lead** they report to; the **judge** sees
the headline in the storyboard ("412 would fail", 0:35 to 0:55). Route: `/batches/:id/health`.

## Purpose

Answer, for one batch and one pack version: how many records meet the pack's rules as they stand,
how many fail and why, and in which countries. It is the "before" picture. Every number on it is a
count from this batch, and every count opens the records behind it.

## Layout

Top to bottom:

1. **Header**: `h1` "Health report", file name, and the scope line "Checked against
   `{{pack}}` · {{form}} form · {{date}}" with the pack's source and retrieved date in a tooltip.
2. **Headline**: one sentence with one large number (`--text-2xl`, tabular): "**412** of 500
   records fail at least one rule in `cbpr-plus-generic@2026.11`." (example data). Below it, a status
   strip of StatusBadges with counts: Pass, Warning, Fail, Needs review, Left empty; each is a link to
   the review queue filtered to that status.
3. **Distribution bar**: one horizontal stacked bar (100% width, 12px high) of the same counts, with
   segments in status colours separated by 2px gaps and a text legend under it (icon + label +
   count). The bar is decoration for scanning; the legend and the strip carry the data.
4. **By country** table: Country (name + ISO code), Records (n), Pass, Warning, Fail, Needs review,
   Top finding. Sorted by Fail descending. Each count links to the filtered queue.
5. **By rule** table: Rule (plain name + rule id in mono), Severity (StatusBadge), Records, One
   synthetic example (original line in mono with the offending part underlined), "View records".
6. **Next step** panel: "Start review" (primary), with the line "Proposals are ready for {{count}}
   records. Nothing changes until a person approves it."

### 375

Header wraps; the scope line moves under the title. The headline number sits on its own line. The
status strip wraps into two rows of badges. The distribution bar stays (full width). Country and rule
tables become lists of cards (country name, n, then a line of three badges with counts). The
"Start review" button is full width below the headline as well as at the end.

### 768

Status strip on one line. Country table shows Country, Records, Fail, Needs review; Pass and Warning
move into an expandable row. Rule table shows Rule, Severity, Records.

### 1440

Header and headline across the full width; then a two-column body: left (7/12) the By country
table, right (5/12) the By rule table, each scrolling independently only if longer than the
viewport. The next-step panel is a sticky footer bar inside `main` (not covering content: `main`
gets matching bottom padding).

## Components

StatusBadge (with counts), Table (sortable headers), distribution bar (SVG with `role="img"` and an
accessible summary), Tooltip (pack source), ProgressPanel (while structuring), EmptyState,
ErrorState, Skeleton, Button.

## States

### Empty

The batch has zero records (for example a payment file with no parties that have addresses):
EmptyState "No addresses to check", body "This file has no party with an address. Nothing was
changed.", action "Upload another file".

### Loading

While the batch is `parsing` or `structuring`, the page shows a ProgressPanel in place of the
headline: "Structuring addresses", "Step 2 of 4: splitting lines", "220 of 500", "Updated 3 seconds
ago", polling every 2 s. The tables below show Skeleton rows captioned "The report fills in when
structuring finishes." The pack scope line is visible from the start, so the person knows what is
being checked.

### Error

- The batch failed (state `failed`): ErrorState with the stored reason ("Structuring stopped at step
  3: the pack `{{pack}}` could not be loaded"), the trace id, and "Try again" (re-enqueues the
  idempotent job), plus "Upload another file".
- The report request fails: ErrorState in place of the tables; the header stays.

### Partial

Structuring is done for some chunks and still running for others: the headline shows counts so far
with the label "So far: {{done}} of {{total}} records checked", the ProgressPanel stays visible above
it, and rows of the tables update in place. Rows that could not be read at upload are listed under a
`warning` line "{{count}} rows could not be read" with a link; they are excluded from the counts and
the headline says so.

### Success

All records are checked: the headline, strip, bar and tables are final; the ProgressPanel collapses
to the line "Done in {{duration}}". A polite announcement reads the headline once. If every record
already meets the pack's rules, the headline says "All {{total}} records meet the rules in
`{{pack}}`." and the next step becomes "Pre-flight the payment file" or "Export".

## Interactions

- Every count is a link to the review queue with the filter applied (status, country, rule).
- Sorting either table by any header; the sort is reflected in `aria-sort` and the URL.
- The pack name opens a popover: source URL (new tab), retrieved date, `effective_from` (a date or
  "not set"), message versions, the number of rules.
- "Start review" opens the review queue sorted by risk.
- The rule example underlines the offending characters in the original line; hovering or focusing
  the rule shows the full rule description (our words, never copied guide text).

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `Tab` / `Shift+Tab` | Move through header links, status strip, tables, next step | Page |
| `Enter` | Follow the focused count link | Links |
| `Enter` / `Space` | Sort by the focused column header | Table headers |
| `r` | Start review (same as the primary action) | Page, not in inputs |
| `p` | Open the pack details popover | Page, not in inputs |
| `Esc` | Close the pack popover | Popover |

## Copy

| Key | en |
|---|---|
| `healthReport.header.title` | Health report |
| `healthReport.header.scope` | Checked against {{pack}} · {{form}} form · {{date}} |
| `healthReport.header.formStructured` | structured |
| `healthReport.header.formHybrid` | hybrid |
| `healthReport.headline.failing` | {{failCount}} of {{total}} records fail at least one rule in {{pack}}. |
| `healthReport.headline.allPass` | All {{total}} records meet the rules in {{pack}}. |
| `healthReport.headline.soFar` | So far: {{done}} of {{total}} records checked |
| `healthReport.headline.excluded` | {{count}} rows could not be read and are not counted. |
| `healthReport.strip.label` | Records by status |
| `healthReport.bar.label` | Share of records by status |
| `healthReport.bar.summary` | Pass {{pass}}, Warning {{warning}}, Fail {{fail}}, Needs review {{review}}, Left empty {{empty}} |
| `healthReport.country.title` | By country |
| `healthReport.country.caption` | Records by country, sorted by most failures |
| `healthReport.country.country` | Country |
| `healthReport.country.records` | Records |
| `healthReport.country.pass` | Pass |
| `healthReport.country.warning` | Warning |
| `healthReport.country.fail` | Fail |
| `healthReport.country.review` | Needs review |
| `healthReport.country.topFinding` | Top finding |
| `healthReport.country.more` | Show pass and warning counts |
| `healthReport.rule.title` | By rule |
| `healthReport.rule.caption` | Findings by rule in {{pack}} |
| `healthReport.rule.rule` | Rule |
| `healthReport.rule.severity` | Severity |
| `healthReport.rule.records` | Records |
| `healthReport.rule.example` | Example |
| `healthReport.rule.viewRecords` | View records |
| `healthReport.next.body` | Proposals are ready for {{count}} records. Nothing changes until a person approves it. |
| `healthReport.next.startReview` | Start review |
| `healthReport.next.preflight` | Pre-flight the payment file |
| `healthReport.next.export` | Export |
| `healthReport.pack.source` | Source |
| `healthReport.pack.retrieved` | Retrieved {{date}} |
| `healthReport.pack.effectiveFrom` | Effective from: {{date}} |
| `healthReport.pack.effectiveNotSet` | Effective from: not set |
| `healthReport.pack.versions` | Message versions: {{versions}} |
| `healthReport.pack.ruleCount` | Rules: {{count}} |
| `healthReport.progress.title` | Structuring addresses |
| `healthReport.progress.tablesPending` | The report fills in when structuring finishes. |
| `healthReport.empty.title` | No addresses to check |
| `healthReport.empty.body` | This file has no party with an address. Nothing was changed. |
| `healthReport.empty.action` | Upload another file |
| `healthReport.error.batchFailed` | Structuring stopped at step {{step}}: {{reason}} |
| `healthReport.error.uploadAnother` | Upload another file |
| `healthReport.partial.unreadable` | {{count}} rows could not be read |
| `healthReport.partial.viewUnreadable` | View unreadable rows |
| `healthReport.success.done` | Done in {{duration}} |

## Accessibility

- The headline is a paragraph directly after the `h1`, so a screen reader reaches the main finding
  second. The large number is part of the sentence, not a separate element.
- The distribution bar is `role="img"` with `aria-label` from `healthReport.bar.summary`; the legend
  is real text. No information exists only in the bar.
- Tables have captions, `scope="col"` headers and `aria-sort`; numeric columns are right aligned with
  tabular numerals; every count link's accessible name includes its context ("Fail, Japan, 38
  records").
- Country names are localised from ISO codes; the code is visible too, so no flag icons are needed
  (and none are used).
- The rule example's underline is a text decoration plus `mark` semantics, never colour only.
- ProgressPanel announcements are polite and throttled; the final headline is announced once.
- Single-key shortcuts (`r`, `p`) are inactive in inputs and can be turned off in the shortcuts
  dialog.
