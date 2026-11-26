# Review queue (hero)

Serves first: **AP clerk** and **payroll specialist** clearing hundreds of records against a
deadline; **small-bank ops** working a client file; the **judge** sees it for 40 seconds in the
storyboard (0:55 to 1:35: a Japanese, an Indian and a German address expanded, reasons per field, a
field left empty rather than guessed, bulk-approve 371). Route: `/batches/:id/review`.

## Purpose

Let one person clear a batch quickly without giving up control: the riskiest records first, every
proposed field with its provenance and reason, inline fixes, honest "leave it empty", and a bulk
approve that only ever covers rows whose every value is auto-approvable. Nothing changes in the
data until a person approves it; every decision is recorded with the person, the time and the pack
version.

## Layout

Three regions inside `main`, which opts out of the 1280px max width:

1. **Toolbar** (sticky, `--color-surface-raised`, 48px): progress line ("Reviewed 129 of 500 · 371
   ready for bulk approve"), search box, Sort Select (Risk, default; Country; Name; File order),
   Filters button (with active-filter count), Density toggle (desktop only), selection count, and
   the **Bulk approve** button (secondary until a selection exists, then primary).
2. **Grid** (virtualised): one row per record. Columns, left to right:
   - Select checkbox (24px box in a 44px hit area at touch widths)
   - Status (StatusBadge)
   - Name (wraps to 2 lines, full text in the evidence pane)
   - Country (ISO code + name)
   - Original line 1 (mono, `dir="auto"`, clipped visually with an ellipsis glyph; the full four
     lines are always in the evidence pane; the data itself is never cut)
   - Proposal summary: `TwnNm` · `PstCd` · `Ctry` values, mono, with an `empty` icon for any
     mandatory element left empty
   - Findings (count, with the top finding's short name)
   - Attention (ProvenanceChips only for kinds that need individual approval: `dataset`, `inferred`,
     `external`; blank otherwise)
   - Confidence band (High, Medium, Low, as text)
   Each row has a 3px left-edge marker in its status border colour (redundant with the badge).
3. **Evidence pane** (right, resizable, default 440px at 1440): for the focused row, the
   35-column ruler with the four original lines, then the proposed fields as a compact list
   (element label, ISO element in mono, value, ProvenanceChip, reason, length "8 / 35"), then
   findings, then the row's actions: Approve, Edit, Leave empty (mark unknown), Open full record.
   The pane follows focus without stealing it.

**Risk sort** (default) orders records by, in this order:
1. any `fail` finding (severity `reject`), more findings first;
2. any value with `dataset`, `inferred` or `external` provenance (needs individual approval);
3. any mandatory element left empty;
4. `warning` findings;
5. confidence band Low, then Medium, then High;
6. records already meeting the pack (`pass`) last.
Ties keep file order. The toolbar shows "Sorted by risk: failures first" with a tooltip listing
these rules, so the order is explainable, not magic.

**Bulk approve eligibility** (computed by the server, shown in the UI): a record is eligible when it
has no `fail` finding, every value is `span` or `transform`, the deterministic validators agree,
and the confidence band is High. Ineligible rows can still be selected, but the bulk-approve dialog
lists them as excluded with the reason.

### 375

- No evidence pane and no grid columns: a list of record cards (min 88px), each card: checkbox
  (44 x 44), StatusBadge, name, country, the proposal summary on one line, findings count, and the
  attention chips. Tapping a card opens record detail as a full screen.
- The toolbar becomes two rows: progress line; then Sort, Filters, and a selection bar that appears
  only when something is selected ("Selected: 12 · Approve") pinned to the bottom of the viewport
  above the safe area, never covering the last card (the list gets bottom padding).
- Keyboard shortcuts still work with a hardware keyboard; the shortcuts button stays in the menu.

### 768

- Grid with columns Select, Status, Name, Country, Proposal summary, Findings; the Attention chips
  move under the name. The evidence pane becomes a bottom sheet (50% height) that opens on Enter or
  tap and closes with Esc; focus moves into it and back.

### 1440

- Full layout: toolbar, grid (flex), evidence pane (440px, resizable 360 to 640px with a keyboard
  operable splitter). A collapsible filter rail (240px) on the left lists Status, Country, Rule,
  Provenance kind and Confidence, each with counts; collapsed by default to give the grid room, and
  opened by the Filters button or `f`.

## Components

Table in grid mode (virtualised, `role="grid"`), StatusBadge, ProvenanceChip, Input (inline field
edit with counter), Button (approve, edit, leave empty, bulk approve; loading states), Dialog (bulk
approve confirm), Toast (with Undo), Tooltip, Select (sort), filter rail (checkbox groups with
counts), splitter, the 35-column ruler, EmptyState, ErrorState, ProgressPanel, Skeleton, keyboard
shortcuts Dialog.

## States

### Empty

- No records need review (all records already meet the pack): EmptyState "Nothing to review", body
  "All {{total}} records meet the rules in {{pack}} as they are. Nothing was changed.", action
  "Pre-flight the payment file" or "Export".
- Filters match nothing: an inline EmptyState in the grid "No records match these filters" with
  "Clear filters".
- Everything is reviewed: EmptyState "Review complete", body "{{approved}} approved, {{edited}}
  edited, {{unknown}} left empty. Each decision is in the audit report.", action "Pre-flight the
  payment file".

### Loading

- First load: toolbar renders with the progress line as Skeleton; the grid shows 12 Skeleton rows
  captioned "Loading records, risk first". The evidence pane shows "Select a record to see its
  evidence."
- Structuring still running for later chunks: a ProgressPanel strip under the toolbar ("Structuring
  addresses: 380 of 500, step 3 of 4: matching postcodes"); rows already proposed are reviewable.
- An action in flight: the row's action button shows its loading state; the row stays focusable.

### Error

- Records request fails: ErrorState in the grid area (problem+json title, detail, trace id, "Try
  again"); the toolbar stays.
- A decision fails: an error Toast "Could not approve {{name}}: {{detail}}" with "Try again"; the
  row returns to its previous status; focus stays on the row.
- Conflict (409, another reviewer changed this record): the row shows a `review` badge and the
  message "{{otherName}} changed this record at {{time}}." with "Load the latest version"; the
  person's unsaved edit is kept in the field until they choose.
- Four-eyes (the uploader cannot approve): Approve and Bulk approve are `aria-disabled` with the
  tooltip "This workspace needs a second person: you uploaded this batch, so someone else approves
  it." Edit and Leave empty stay available; edits then wait for another person's approval.

### Partial

- Some rows failed to load in a page of the virtualised list: those rows render as a single error
  row "These {{count}} rows did not load" with "Try again"; the rest stay usable.
- Bulk approve partially succeeds (the server rejects some rows because they changed): the Toast says
  "Approved {{approved}} records. {{skipped}} changed since you selected them and were not approved."
  with "Show them", which filters the grid to those rows.
- Payment-file link ambiguities appear here too, as records with the `review` badge and the
  finding "Matches {{count}} records in the list by account and name"; they are resolved in record
  detail.

### Success

A row approved: its badge turns to `approved` in place (no reordering under the person), focus
advances to the next row, the progress line updates ("Reviewed 130 of 500"), and a polite
announcement reads "Approved {{name}}. {{left}} left to review." Bulk approve success: Toast
"Approved {{count}} records. Each decision is recorded with your name and {{pack}}." with Undo for
10 seconds (Undo records a reopen decision per record; decisions are append-only).

## Interactions

- **Focus model**: one row is focused at a time (roving `tabindex`); `Tab` leaves the grid to the
  evidence pane. `j`/`k` and Arrow Down/Up move focus; the evidence pane follows the focused row
  after a 120ms debounce so fast scrolling stays smooth.
- **Approve** (`a`): records an approve decision for the focused record's current proposal and
  advances. If the record holds a value that needs individual approval (`dataset`, `inferred`,
  `external`), `a` first opens the evidence pane with that field highlighted and asks for a second
  `a` to confirm ("Press a again to approve, including the dataset match for Town"), so it is never
  approved blind.
- **Edit** (`e`): moves focus into the evidence pane's first flagged field (or the first field) as
  an Input with the character counter; `Tab` moves between fields; `Enter` saves the edit as a
  `human` value and approves the record; `Esc` cancels and returns focus to the row. Over-length
  input shows the over-limit message and cannot be saved; nothing is cut.
- **Leave empty / mark unknown** (`u`): records an `unknown` decision for the record: its address is
  left as the original in exports, the reason is "Marked unknown by {{name}}", and it is listed in
  the audit report. In edit mode, each field has a "Leave empty" button that clears the proposed
  value and records why.
- **Select** (`x`): toggles the focused row's checkbox. `Shift+x` selects every eligible row in the
  current filter (not hidden rows). `Shift+Click` and `Shift+j`/`Shift+k` extend a range.
- **Bulk approve** (`Shift+a` or the button): opens a Dialog: "Approve {{count}} records?", the
  breakdown (eligible count; excluded count with reasons: has a failing rule, has a value that needs
  individual approval, changed since selection), the scope line "Checked against {{pack}}", and
  "Approve {{count}}" (primary) / "Cancel". The dialog never approves excluded rows.
- **Open record** (`Enter` or `o`): goes to record detail; Back returns to the same row and scroll
  position.
- **Search** (`/`): filters by name, original text or IBAN suffix; the URL keeps the query.
- **Live updates**: the grid polls every 5 s for decisions by others and for newly structured rows;
  changes apply in place without reordering; new rows join at the end of their risk group with a
  "New rows: {{count}}" button that re-sorts on demand.
- **Density** (desktop): Comfortable (44px rows) or Compact (36px rows); both keep 24px targets.

## Keyboard map

Single-key shortcuts are active only while focus is inside the grid or the evidence pane and not
inside a text input; they can be turned off in the shortcuts dialog (WCAG 2.1.4).

| Key | Action | Scope |
|---|---|---|
| `j` / `Arrow Down` | Next row | Grid |
| `k` / `Arrow Up` | Previous row | Grid |
| `a` | Approve the focused record (asks once more if it holds a value that needs individual approval) | Grid, evidence pane |
| `e` | Edit: focus the first flagged field of the focused record | Grid, evidence pane |
| `u` | Mark the focused record unknown (leave its address empty; it stays as the original) | Grid, evidence pane |
| `x` | Select or unselect the focused row for bulk approve | Grid |
| `Shift+x` | Select every eligible row in the current filter | Grid |
| `Shift+j` / `Shift+k` | Extend the selection down / up | Grid |
| `Shift+a` | Bulk approve the selected rows (opens the confirm dialog) | Grid, toolbar |
| `Enter` / `o` | Open the full record | Grid |
| `Home` / `End` | First / last row | Grid |
| `Page Down` / `Page Up` | Move one screen of rows | Grid |
| `Arrow Left` / `Arrow Right` | Move between cells of the focused row (for the checkbox, chips and links) | Grid |
| `/` | Focus search | Grid, toolbar |
| `f` | Open or close the filter rail | Grid, toolbar |
| `s` | Focus the sort Select | Grid, toolbar |
| `Esc` | Cancel edit; else clear selection; else close sheet or rail | Anywhere on the screen |
| `Tab` (in edit) | Next field | Evidence pane edit |
| `Enter` (in edit) | Save the edit and approve | Evidence pane edit |
| `?` | Show all shortcuts | Global |

## Copy

| Key | en |
|---|---|
| `reviewQueue.page.title` | Review |
| `reviewQueue.toolbar.progress` | Reviewed {{reviewed}} of {{total}} |
| `reviewQueue.toolbar.readyForBulk` | {{count}} ready for bulk approve |
| `reviewQueue.toolbar.search` | Search names, original text or IBAN |
| `reviewQueue.toolbar.sort` | Sort |
| `reviewQueue.toolbar.sortRisk` | Risk |
| `reviewQueue.toolbar.sortCountry` | Country |
| `reviewQueue.toolbar.sortName` | Name |
| `reviewQueue.toolbar.sortFileOrder` | File order |
| `reviewQueue.toolbar.sortedByRisk` | Sorted by risk: failures first |
| `reviewQueue.toolbar.riskRules` | Failing rules first, then values that need individual approval, then empty mandatory fields, then warnings, then lower confidence. Records that already pass come last. |
| `reviewQueue.toolbar.filters` | Filters |
| `reviewQueue.toolbar.filtersActive` | Filters ({{count}}) |
| `reviewQueue.toolbar.density` | Row density |
| `reviewQueue.toolbar.comfortable` | Comfortable |
| `reviewQueue.toolbar.compact` | Compact |
| `reviewQueue.toolbar.selected` | Selected: {{count}} |
| `reviewQueue.toolbar.bulkApprove` | Bulk approve |
| `reviewQueue.toolbar.newRows` | New rows: {{count}} |
| `reviewQueue.grid.label` | Records to review, {{total}} rows |
| `reviewQueue.grid.select` | Select |
| `reviewQueue.grid.status` | Status |
| `reviewQueue.grid.name` | Name |
| `reviewQueue.grid.country` | Country |
| `reviewQueue.grid.original` | Original line 1 |
| `reviewQueue.grid.proposal` | Proposal |
| `reviewQueue.grid.findings` | Findings |
| `reviewQueue.grid.attention` | Needs attention |
| `reviewQueue.grid.confidence` | Confidence |
| `reviewQueue.grid.confidenceHigh` | High |
| `reviewQueue.grid.confidenceMedium` | Medium |
| `reviewQueue.grid.confidenceLow` | Low |
| `reviewQueue.grid.findingsCount` | {{count}} · {{top}} |
| `reviewQueue.grid.noFindings` | None |
| `reviewQueue.grid.rowLabel` | Row {{index}} of {{total}}. {{status}}. {{name}}, {{country}}. Findings: {{findings}}. {{attention}} {{selected}} |
| `reviewQueue.grid.rowSelected` | Selected. |
| `reviewQueue.grid.rowNotSelected` | Not selected. |
| `reviewQueue.grid.rowAttention` | Holds a value that needs individual approval. |
| `reviewQueue.grid.mandatoryEmpty` | {{element}} left empty |
| `reviewQueue.grid.rowsFailed` | These {{count}} rows did not load |
| `reviewQueue.filters.title` | Filters |
| `reviewQueue.filters.status` | Status |
| `reviewQueue.filters.country` | Country |
| `reviewQueue.filters.rule` | Rule |
| `reviewQueue.filters.provenance` | Provenance |
| `reviewQueue.filters.confidence` | Confidence |
| `reviewQueue.filters.optionCount` | {{label}} ({{count}}) |
| `reviewQueue.filters.clear` | Clear filters |
| `reviewQueue.evidence.title` | Evidence for {{name}} |
| `reviewQueue.evidence.none` | Select a record to see its evidence. |
| `reviewQueue.evidence.original` | Original lines |
| `reviewQueue.evidence.ruler` | Original lines, 4 lines of up to 35 characters |
| `reviewQueue.evidence.lineLength` | {{used}} / 35 |
| `reviewQueue.evidence.fields` | Proposed fields |
| `reviewQueue.evidence.findings` | Findings in {{pack}} |
| `reviewQueue.evidence.resize` | Resize evidence pane |
| `reviewQueue.actions.approve` | Approve |
| `reviewQueue.actions.approving` | Approving |
| `reviewQueue.actions.edit` | Edit |
| `reviewQueue.actions.save` | Save and approve |
| `reviewQueue.actions.cancel` | Cancel |
| `reviewQueue.actions.leaveEmpty` | Leave empty |
| `reviewQueue.actions.markUnknown` | Mark unknown |
| `reviewQueue.actions.openRecord` | Open full record |
| `reviewQueue.actions.confirmIndividual` | Press a again to approve, including the {{kind}} value for {{element}}. |
| `reviewQueue.actions.fourEyes` | This workspace needs a second person: you uploaded this batch, so someone else approves it. |
| `reviewQueue.actions.unknownReason` | Marked unknown by {{name}} |
| `reviewQueue.bulk.title` | Approve {{count}} records? |
| `reviewQueue.bulk.eligible` | {{count}} can be approved together: every value comes from the input or a listed transform, and no rule fails. |
| `reviewQueue.bulk.excludedFailing` | {{count}} excluded: a rule fails. |
| `reviewQueue.bulk.excludedIndividual` | {{count}} excluded: they hold a dataset, inferred or external value that needs individual approval. |
| `reviewQueue.bulk.excludedChanged` | {{count}} excluded: changed since you selected them. |
| `reviewQueue.bulk.scope` | Checked against {{pack}}. Each decision is recorded with your name. |
| `reviewQueue.bulk.confirm` | Approve {{count}} |
| `reviewQueue.bulk.nothingEligible` | None of the selected records can be approved together. Review them one by one. |
| `reviewQueue.empty.nothingTitle` | Nothing to review |
| `reviewQueue.empty.nothingBody` | All {{total}} records meet the rules in {{pack}} as they are. Nothing was changed. |
| `reviewQueue.empty.noMatchTitle` | No records match these filters |
| `reviewQueue.empty.doneTitle` | Review complete |
| `reviewQueue.empty.doneBody` | {{approved}} approved, {{edited}} edited, {{unknown}} left empty. Each decision is in the audit report. |
| `reviewQueue.empty.preflight` | Pre-flight the payment file |
| `reviewQueue.empty.export` | Export |
| `reviewQueue.loading.records` | Loading records, risk first |
| `reviewQueue.loading.structuring` | Structuring addresses |
| `reviewQueue.error.decision` | Could not approve {{name}}: {{detail}} |
| `reviewQueue.error.conflict` | {{otherName}} changed this record at {{time}}. |
| `reviewQueue.error.loadLatest` | Load the latest version |
| `reviewQueue.partial.bulk` | Approved {{approved}} records. {{skipped}} changed since you selected them and were not approved. |
| `reviewQueue.partial.showSkipped` | Show them |
| `reviewQueue.partial.linkAmbiguous` | Matches {{count}} records in the list by account and name |
| `reviewQueue.success.approvedOne` | Approved {{name}}. {{left}} left to review. |
| `reviewQueue.success.approvedBulk` | Approved {{count}} records. Each decision is recorded with your name and {{pack}}. |
| `reviewQueue.success.markedUnknown` | Marked {{name}} unknown. Its original address is kept. |
| `reviewQueue.success.undone` | Undone. {{count}} records are back in review. |

## Accessibility

- **Grid semantics**: `role="grid"` with `aria-label` from `reviewQueue.grid.label`,
  `aria-rowcount` = total records (not the rendered count), `aria-colcount`, and on each rendered
  row `aria-rowindex` (1-based, header row is 1) and `aria-selected` for the bulk selection. The
  header row stays in the DOM while scrolling. `aria-multiselectable="true"`.
- **Virtualisation**: about 30 rows are rendered (viewport plus overscan). Focus is held by row
  index, not DOM node, so scrolling never loses focus; when the focused row would unmount it is kept
  mounted. Keyboard movement scrolls the row into view (`block: "nearest"`).
- **What the screen reader announces**: on moving to a row, its accessible name
  (`reviewQueue.grid.rowLabel`), for example: "Row 12 of 500. Needs review. Kestrel Lantern Works
  GmbH, Japan. Findings: 2, town missing. Holds a value that needs individual approval. Not
  selected." On an action, a polite live region (separate from the grid) says the result:
  "Approved Kestrel Lantern Works GmbH. 128 left to review." On selection: "Selected. Selected: 12."
  The bulk dialog title and breakdown are read when it opens. Polling updates are not announced
  unless they change the focused row ("Changed by Ravi Tester at 10:42").
- **Focus visible**: the focused row has the 2px `--color-focus` ring inset on the row plus
  `--color-row-selected` only if selected; focus and selection are visibly different (ring vs fill
  plus checked box).
- **Not colour alone**: status badges, provenance chips (dashed border for needs-individual-
  approval kinds), confidence as words, row-edge marker redundant.
- **Scripts**: name and original-line cells use `dir="auto"` and `lang` when the country implies a
  script; CJK and Devanagari render from system fonts; row height grows rather than clipping tall
  glyphs.
- **Targets**: 24 x 24 minimum for checkboxes and chips at 1440 (44 x 44 hit area at 375 and 768);
  the splitter has a 24px-wide handle and Arrow Left/Right resize it by 16px.
- **Reduced motion**: no row slide animations; the status change is an instant swap.
- **Zoom**: at 200% the evidence pane drops below the grid (768 layout); at 400% the card layout
  (375) applies with no horizontal scroll.
