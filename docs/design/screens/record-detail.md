# Record detail

Serves first: **AP clerk** fixing one hard record; **treasury analyst** and **small-bank ops**
checking why a value is what it is; the **judge**, who sees a Japanese, an Indian and a German
address expanded with a reason per field and one field left empty rather than guessed. Route:
`/batches/:id/records/:recordId`.

## Purpose

Show, for one record, every proposed ISO 20022 field with its value, its provenance and the reason
for it, side by side with the original four lines it came from. An empty field says why it is
empty. The person approves, edits, leaves fields empty or marks the record unknown here, and sees
the record's full decision history.

## Layout

1. **Header**: back link "Back to review" (returns to the same row), `h1` = the party name
   (`dir="auto"`), country, party role, StatusBadge, and the scope line "Checked against
   `{{pack}}` · {{form}} form". Previous / next record buttons on the right.
2. **Original lines** (the 35-column ruler): the four MT lines in `--font-mono` on a faint
   35-character grid, each line numbered 1 to 4 with its length at the right ("31 / 35"). Spans
   used by fields are underlined; the span of the focused or hovered field is highlighted
   (`--color-highlight-span` plus a 2px underline). Unused text stays plain, and a line under the
   ruler lists any input text no field used ("Not used: 'c/o accounts'").
3. **Fields table**: one row per element the target form and message version allow, in ISO order.
   Columns:
   - **Field**: plain label ("Town") and the ISO element in mono (`TwnNm`)
   - **Value**: the proposed value (`dir="auto"`), or the `empty` badge "Left empty"
   - **Provenance**: ProvenanceChip (one of the six kinds); blank for an empty field
   - **Reason**: one sentence. For a value: where it came from ("Copied from line 3, characters
     7 to 18", "Postcode format rule `postcode-jp@1` applied to '1500001'", "Only match for postcode
     150-0001 in Japan Post, record 1500001"). For an empty field: why it is empty ("No part of the
     input is a building number, so nothing was guessed").
   - **Length**: "{{used}} / {{max}}", turning into a `fail` finding when over; never cut
   - **Action**: Edit, Leave empty, Approve this value (only for `dataset`, `inferred`, `external`)
4. **Findings**: list of pack findings for the current proposal: StatusBadge (severity), rule name
   (our words) and rule id (mono), the element it concerns (links to the row), what would make it
   pass.
5. **XML preview** (collapsed by default): the `PstlAdr` block this proposal produces, in mono,
   before and after, for the message version of the batch.
6. **History**: append-only decisions and links: who, what (approve, edit, unknown, reopen, linked
   to payment-file party), when, pack version, proposal version.
7. **Action bar**: Approve (primary), Edit, Mark unknown, Reopen (for decided records).

### 375

Single column. Header wraps; previous / next become two 44px buttons at the bottom of the header.
The ruler keeps 35 columns and scrolls horizontally inside its own box if the screen is narrower
(the only horizontal scroll on the page; announced as "Original lines, scrollable"). The fields
table becomes one card per field: label and element on top, value, then chip and reason, then
length and actions. The action bar is sticky at the bottom above the safe area, with Approve full
width and a "More" menu for Edit, Mark unknown, Reopen; the page has matching bottom padding.

### 768

Single column at 720px. Fields table keeps Field, Value, Provenance and Length; Reason moves to a
second line under each row (always visible, not hidden behind a tooltip).

### 1440

Two columns: left (5/12, sticky) the header block, ruler, findings and history; right (7/12) the
fields table with every column, the XML preview, and the action bar at the end of the table. The
ruler stays in view while the person works down the fields, so the highlight link is visible.

## Components

StatusBadge, ProvenanceChip (with popover listing full evidence: span offsets, transform id and
version, dataset name, record id and licence attribution, inference rule, person and time, token
name), the 35-column ruler, Table, Input (with counter and over-limit message), Button, Dialog
(mark unknown confirm, reopen confirm), Toast, Tooltip, EmptyState, ErrorState, Skeleton,
ProgressPanel.

For `dataset` values the popover cites the source with its licence (for example "GeoNames, CC BY
4.0"), as ADR 0021 requires.

## States

### Empty

The record exists but no proposal could be built (no part of the input matched any element): every
field shows "Left empty" with the reason "Nothing in the input could be placed in this field", the
StatusBadge is `review`, and an inline EmptyState above the table says "No proposal for this
record", body "4x35 found nothing it could place without guessing. Edit the fields from the
original lines, or mark the record unknown." with actions Edit and Mark unknown.

### Loading

Header from the review queue's cache renders at once; the ruler and fields table show Skeleton rows
captioned "Loading proposal and evidence". If the record is still being structured, a ProgressPanel
says "Structuring this record: step 2 of 4: splitting lines" and the page fills in when done.

### Error

- The record cannot be loaded: ErrorState with trace id and "Try again"; "Back to review" stays.
- Not found or purged (404, 410): "This record is no longer available. Uploads are deleted after
  30 days." with "Back to batches".
- Save fails: the Input keeps the typed value, shows the problem detail below it, and the Toast
  offers "Try again".
- Conflict (409): "{{otherName}} changed this record at {{time}}." with "Load the latest version"
  and "Keep my edit" (re-applies the edit on the latest version and asks for approval again).

### Partial

- Some fields have values and some are empty: the normal case. Empty mandatory fields (`TwnNm`,
  `Ctry` in hybrid) carry a `fail` finding; empty optional fields are `empty` with a reason and no
  finding.
- Some values need individual approval: those rows show their dashed chip and an "Approve this
  value" button; the record's Approve button says "Approve record (1 value needs your approval
  first)" and is `aria-disabled` until each such value is approved or edited.
- The payment-file link is ambiguous: a panel "This party matches {{count}} records in the list"
  lists the candidates (name, account suffix, country) with "Link this record" for each and "None of
  these".

### Success

After Approve: StatusBadge becomes `approved`, the history gains a row ("Approved by {{name}} at
{{time}}, {{pack}}"), a Toast "Approved. Next record?" with "Next record" (focus moves to the
button), and the action bar shows Reopen. After an edit: the edited field's chip becomes `human`
with the reason "Entered by {{name}} at {{time}}; was '{{before}}'".

## Interactions

- Focus or hover a field row: its source span lights up in the ruler; focus a span in the ruler
  (each used span is a focusable button): its field row is highlighted and scrolled into view.
- Edit (`e` or the row's Edit): the value becomes an Input with the counter; `Enter` saves as
  `human`, `Esc` cancels. Over-length values show the over-limit message and cannot be saved.
  Characters outside the pack's character set are flagged as a finding while typing ("'ß' is not
  in the pack's character set; the transform `latin-ascii@1` would write 'ss'"), never replaced
  silently.
- Leave empty: clears the proposed value; asks for nothing more, records reason "Left empty by
  {{name}}"; mandatory elements left empty keep their `fail` finding.
- Approve this value: approves one `dataset`, `inferred` or `external` value; its chip stays the
  same kind (the evidence does not change), and the reason gains "Approved by {{name}}".
- Mark unknown: Dialog "Mark this record unknown?" body "Its original address is kept in exports and
  listed in the audit report." Confirm / Cancel.
- Reopen: Dialog, then the record returns to `review`; history records the reopen.
- Previous / next follow the review queue's current sort and filter.

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `Tab` / `Shift+Tab` | Move through header, ruler spans, field rows, actions | Page |
| `j` / `k` | Next / previous field row | Fields table |
| `e` | Edit the focused field | Fields table |
| `Enter` (in edit) | Save the edit | Field Input |
| `Esc` (in edit) | Cancel the edit | Field Input |
| `a` | Approve the record, or the focused value if it needs individual approval | Page, not in inputs |
| `u` | Mark the record unknown (opens the confirm dialog) | Page, not in inputs |
| `n` / `p` | Next / previous record | Page, not in inputs |
| `v` | Show or hide the XML preview | Page, not in inputs |
| `b` | Back to review | Page, not in inputs |
| `Enter` | Open the provenance popover of the focused chip | ProvenanceChip |
| `Esc` | Close popover or dialog | Popover, dialog |
| `?` | Show all shortcuts | Global |

## Copy

| Key | en |
|---|---|
| `recordDetail.header.back` | Back to review |
| `recordDetail.header.scope` | Checked against {{pack}} · {{form}} form |
| `recordDetail.header.partyRole` | Party role: {{role}} |
| `recordDetail.header.previous` | Previous record |
| `recordDetail.header.next` | Next record |
| `recordDetail.ruler.title` | Original lines |
| `recordDetail.ruler.label` | Original lines, 4 lines of up to 35 characters |
| `recordDetail.ruler.scrollable` | Original lines, scrollable |
| `recordDetail.ruler.line` | Line {{n}} |
| `recordDetail.ruler.length` | {{used}} / 35 |
| `recordDetail.ruler.spanButton` | "{{span}}", used for {{field}} |
| `recordDetail.ruler.notUsed` | Not used: {{text}} |
| `recordDetail.ruler.allUsed` | Every part of the input is used. |
| `recordDetail.fields.title` | Proposed fields |
| `recordDetail.fields.caption` | Fields for {{form}} form in {{version}}, with provenance and reason |
| `recordDetail.fields.field` | Field |
| `recordDetail.fields.value` | Value |
| `recordDetail.fields.provenance` | Provenance |
| `recordDetail.fields.reason` | Reason |
| `recordDetail.fields.length` | Length |
| `recordDetail.fields.action` | Action |
| `recordDetail.fields.leftEmpty` | Left empty |
| `recordDetail.fields.lengthValue` | {{used}} / {{max}} |
| `recordDetail.reason.span` | Copied from line {{line}}, characters {{start}} to {{end}}. |
| `recordDetail.reason.transform` | Rule {{transform}} applied to "{{span}}". |
| `recordDetail.reason.dataset` | Only match for "{{span}}" in {{dataset}}, record {{recordId}}. |
| `recordDetail.reason.inferred` | Inferred from {{evidence}} by {{rule}}. Needs your approval. |
| `recordDetail.reason.human` | Entered by {{name}} at {{time}}; was "{{before}}". |
| `recordDetail.reason.humanNew` | Entered by {{name}} at {{time}}. |
| `recordDetail.reason.external` | Sent by {{tokenName}} at {{time}}. Needs a reviewer's approval. |
| `recordDetail.reason.approvedBy` | Approved by {{name}}. |
| `recordDetail.reason.emptyNoSpan` | No part of the input is a {{fieldLabel}}, so nothing was guessed. |
| `recordDetail.reason.emptyAmbiguous` | "{{span}}" could be a {{first}} or a {{second}}, so it was not placed. |
| `recordDetail.reason.emptyDatasetNotUnique` | {{dataset}} has {{count}} matches for "{{span}}", so none was used. |
| `recordDetail.reason.emptyNoTransform` | No listed transform turns "{{span}}" into the pack's character set, so it was left for you. |
| `recordDetail.reason.emptyNoElement` | {{version}} has no element for this. Where the pack allows, it goes to an address line. |
| `recordDetail.reason.emptyByPerson` | Left empty by {{name}}. |
| `recordDetail.reason.emptyNothing` | Nothing in the input could be placed in this field. |
| `recordDetail.provenance.evidence` | Evidence |
| `recordDetail.provenance.offsets` | Line {{line}}, characters {{start}} to {{end}} |
| `recordDetail.provenance.transformId` | Transform {{transform}} version {{version}} |
| `recordDetail.provenance.datasetSource` | {{dataset}}, {{licence}} |
| `recordDetail.findings.title` | Findings in {{pack}} |
| `recordDetail.findings.none` | No findings. This record meets every rule in {{pack}}. |
| `recordDetail.findings.element` | Concerns {{element}} |
| `recordDetail.findings.toPass` | To pass: {{fix}} |
| `recordDetail.findings.overLength` | {{used}} characters; {{element}} allows {{max}}. Nothing was cut. |
| `recordDetail.findings.charset` | "{{char}}" is not in the pack's character set; the transform {{transform}} would write "{{replacement}}". |
| `recordDetail.findings.mandatoryEmpty` | {{element}} is required in {{form}} form. |
| `recordDetail.xml.title` | XML preview |
| `recordDetail.xml.show` | Show XML preview |
| `recordDetail.xml.hide` | Hide XML preview |
| `recordDetail.xml.before` | Before |
| `recordDetail.xml.after` | After |
| `recordDetail.history.title` | History |
| `recordDetail.history.approved` | Approved by {{name}} at {{time}}, {{pack}} |
| `recordDetail.history.edited` | {{element}} edited by {{name}} at {{time}} |
| `recordDetail.history.unknown` | Marked unknown by {{name}} at {{time}} |
| `recordDetail.history.reopened` | Reopened by {{name}} at {{time}} |
| `recordDetail.history.linked` | Linked to payment-file party {{party}} by {{method}} |
| `recordDetail.history.proposed` | Proposal {{version}} built at {{time}} with {{pack}} |
| `recordDetail.actions.approve` | Approve |
| `recordDetail.actions.approveBlocked` | Approve record ({{count}} values need your approval first) |
| `recordDetail.actions.approveValue` | Approve this value |
| `recordDetail.actions.edit` | Edit |
| `recordDetail.actions.save` | Save |
| `recordDetail.actions.cancel` | Cancel |
| `recordDetail.actions.leaveEmpty` | Leave empty |
| `recordDetail.actions.markUnknown` | Mark unknown |
| `recordDetail.actions.reopen` | Reopen |
| `recordDetail.actions.more` | More actions |
| `recordDetail.unknownDialog.title` | Mark this record unknown? |
| `recordDetail.unknownDialog.body` | Its original address is kept in exports and listed in the audit report. |
| `recordDetail.unknownDialog.confirm` | Mark unknown |
| `recordDetail.reopenDialog.title` | Reopen this record? |
| `recordDetail.reopenDialog.body` | It goes back to review. The earlier decision stays in the history. |
| `recordDetail.reopenDialog.confirm` | Reopen |
| `recordDetail.link.title` | This party matches {{count}} records in the list |
| `recordDetail.link.candidate` | {{name}} · account ending {{suffix}} · {{country}} |
| `recordDetail.link.choose` | Link this record |
| `recordDetail.link.none` | None of these |
| `recordDetail.empty.title` | No proposal for this record |
| `recordDetail.empty.body` | 4x35 found nothing it could place without guessing. Edit the fields from the original lines, or mark the record unknown. |
| `recordDetail.loading.proposal` | Loading proposal and evidence |
| `recordDetail.loading.structuring` | Structuring this record |
| `recordDetail.error.gone` | This record is no longer available. Uploads are deleted after 30 days. |
| `recordDetail.error.backToBatches` | Back to batches |
| `recordDetail.error.conflict` | {{otherName}} changed this record at {{time}}. |
| `recordDetail.error.loadLatest` | Load the latest version |
| `recordDetail.error.keepEdit` | Keep my edit |
| `recordDetail.success.approved` | Approved. Next record? |
| `recordDetail.success.nextRecord` | Next record |

## Accessibility

- Reading order: header, original lines, fields, findings, XML preview, history, actions. At 1440
  the sticky left column comes first in the DOM, matching the visual order.
- The fields table has a caption, `scope` headers and one row per element; the Reason column is
  real text, never only a tooltip, so a screen reader hears value, provenance and reason in one row.
  A row's accessible summary: "Town, TwnNm: Shibuya-ku. Dataset match: only match for postcode
  150-0001 in Japan Post. Needs individual approval."
- An empty field reads "Left empty" plus its reason; it is never silent and never a blank cell.
- Span highlight is mirrored: field to span and span to field, by focus as well as hover; the
  highlight is fill plus underline, and the span button's name says which field uses it.
- Values and original lines carry `dir="auto"`; `lang` is set when the script is known (for example
  `ja` for Japanese lines) so screen readers choose the right voice.
- The ruler's horizontal scroll at 375 is a focusable region with `role="region"` and a label;
  everything else reflows at 320px.
- Dialogs trap focus and return it to the trigger; Toast actions are reachable by keyboard.
- Targets: 44px at 375 and 768; 24px minimum at 1440, including span buttons (padded hit area).
