# Upload and mapping

Serves first: **AP clerk** and **payroll specialist** (CSV/XLSX lists), then the **treasury analyst**
(pain.001, MT101). The judge sees it for about 20 seconds in the storyboard (0:35 to 0:55). Route:
`/upload`, then `/batches/:id/mapping`.

## Purpose

Take one file, say what 4x35 found in it (format, encoding, rows, columns), let the person confirm
the column mapping, choose the bank pack and the target form, and start the check. Nothing is
changed in the file: the original bytes are kept as uploaded.

## Layout

Two steps on one route, shown as a short vertical sequence, not a wizard with hidden pages:

1. **File**: a drop zone with a "Choose a file" button. Accepted: CSV, XLSX, pain.001 (.001.03,
   .001.09, .001.12), MT101. After upload, a detection summary replaces the drop zone: file name,
   size, sha256 (first 12 characters, mono, copy button), detected format and version, encoding,
   delimiter, line ending, rows (or transactions) found.
2. **Mapping and pack** (opens below once detection finishes):
   - **Columns** (CSV/XLSX only): a table, one row per 4x35 input (Name, Address line 1 to 4,
     Postcode, Town, Country, IBAN or account, Party role), with the detected source column in a
     Select, its detection confidence band (High / Medium / Low, as text), and three sample values
     from the file in mono with `dir="auto"`. Unmapped optional inputs say "Not mapped". For XML and
     MT101 the mapping is fixed by the format and the table shows the element paths read-only.
   - **Pack**: a Select of packs; each option shows `<pack>@<version>`, the source name, retrieved
     date and "Effective from: {{date}}" or "Effective from: not set".
   - **Target form**: radio group, Structured or Hybrid, each with one line explaining it. Hybrid
     notes "Town and country are required; at most 2 address lines; nothing repeated."
   - **Message version** (payment files only): shown read-only from the file, with the note for
     .001.03 that building name, floor, post box, room, town location and district are not in this
     version and go to address lines where the pack allows.
   - Primary action "Check {{count}} records against {{pack}}"; secondary "Choose another file".

### 375

Single column. The drop zone becomes a large "Choose a file" button (no drag on touch). The mapping
table becomes one card per input: input name, Select (full width, 48px), sample values below.
Pack and form controls stack full width. The primary action is full width at the end of the form
(not sticky, so it never covers content).

### 768

Single column at 720px. Mapping table with columns Input, Source column, Confidence; sample values
in a second line under each row.

### 1440

Two columns: left (8/12) the mapping table with all columns (Input, Source column, Confidence,
Samples); right (4/12), sticky, the summary panel: file detection, pack Select, target form, LLM
labeller status line, and the primary action. The person sees the decision and its consequences
side by side.

## Components

Drop zone (a `label` wrapping a file `input`, plus drag and drop), Button, Select, radio group,
Table, StatusBadge (detection confidence uses text bands, not status colours; mapping problems use
`warning` or `fail`), ProgressPanel (upload and detection), EmptyState, ErrorState, Toast, Tooltip
(pack source and retrieved date).

LLM labeller status line in the summary: "Span labeller: off for this workspace" or "Span
labeller: on (labels and substrings only; values always come from your file)". It is a fact, not
a toggle here; owners change it in workspace settings.

## States

### Empty

The drop zone with its heading "Upload a file", the accepted formats, the size limit, and the line
"The original file is kept unchanged. Uploads are deleted after 30 days." In a judge sandbox an extra
line offers "Or use a sample file" with two synthetic samples (a supplier CSV and a pain.001.001.09).

### Loading

During upload: ProgressPanel "Uploading {{file}}", bytes done / total, then "Reading the file: detecting
format and encoding" (indeterminate, still named). Detection then fills the summary row by row; the
mapping table shows Skeleton rows with the caption "Matching columns".

### Error

- Unsupported file type: inline message on the drop zone, `fail` badge, "This file type is not
  supported. Upload CSV, XLSX, pain.001 (.001.03, .001.09, .001.12) or MT101."
- Too large (413): "This file is {{size}}. The limit is {{limit}}."
- XML with a DOCTYPE: "This XML file declares a DOCTYPE, which 4x35 does not read for safety. Export
  the file again without it."
- Unreadable encoding: "4x35 could not tell how this file's text is encoded. Save it as UTF-8 and
  upload again."
- Missing mandatory mapping (no Country and no address lines): the Columns table marks the row `fail`
  and the primary action explains "Map at least the address lines or the country to continue."
- Server problem: ErrorState with trace id and "Try again"; the chosen file stays selected.

### Partial

- Some rows could not be parsed (for example a row with more cells than the header): a `warning`
  line "{{count}} rows could not be read and are listed in the health report. The other rows can be
  checked." with a link to the list. Checking can continue.
- Low-confidence column guesses: the row shows "Low" and a `review` badge "Check this mapping"; the
  primary action stays enabled.
- Duplicate upload (same file, pack and form as an existing batch): "You uploaded this file with the
  same pack and form on {{date}}." with "Open that batch" (primary) and "Choose another file".

### Success

After "Check …": the page moves to the health report route, which shows the structuring
ProgressPanel ("Structuring addresses: 120 of 500, step 2 of 4: splitting lines"). A Toast says
"Upload saved. Checking against {{pack}}."

## Interactions

- Drop or choose a file starts the upload at once; there is no separate "Upload" button.
- Changing the pack or form re-labels the primary action and recomputes nothing until it is pressed.
- Mapping Selects list every source column with a sample; choosing a column already used by another
  input swaps them and says so in a polite live region ("Town and Postcode swapped").
- The pack option tooltip shows source URL, retrieved date, `effective_from` and message versions;
  the link opens the source in a new tab with the external-link icon and the words "opens in a new
  tab".
- The sha256 copy button copies the full hash.

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `Tab` / `Shift+Tab` | Move through drop zone button, mapping Selects, pack, form, actions | Page |
| `Enter` / `Space` | Open the file chooser from the drop zone button | Drop zone |
| `Space` / `Enter` / `Arrow Down` | Open a Select | Select |
| `Arrow Up` / `Arrow Down`, type to search | Move through options | Open Select |
| `Arrow Left` / `Arrow Right` | Change target form | Radio group |
| `Ctrl+Enter` (`Cmd+Enter` on macOS) | Start the check (same as the primary action) | Page, when the form is valid |
| `Esc` | Close an open Select or tooltip | Select, tooltip |

## Copy

| Key | en |
|---|---|
| `upload.page.title` | Upload a file |
| `upload.dropZone.heading` | Upload a file |
| `upload.dropZone.choose` | Choose a file |
| `upload.dropZone.dragHint` | or drop it here |
| `upload.dropZone.formats` | CSV, XLSX, pain.001 (.001.03, .001.09, .001.12) or MT101 |
| `upload.dropZone.limit` | Up to {{limit}} |
| `upload.dropZone.keptUnchanged` | The original file is kept unchanged. Uploads are deleted after 30 days. |
| `upload.dropZone.sample` | Or use a sample file |
| `upload.dropZone.sampleList` | Synthetic supplier list (CSV) |
| `upload.dropZone.samplePayment` | Synthetic payment file (pain.001.001.09) |
| `upload.detect.title` | What we found |
| `upload.detect.file` | File |
| `upload.detect.size` | Size |
| `upload.detect.sha256` | SHA-256 |
| `upload.detect.copyHash` | Copy full SHA-256 |
| `upload.detect.format` | Format |
| `upload.detect.encoding` | Encoding |
| `upload.detect.delimiter` | Delimiter |
| `upload.detect.lineEnding` | Line ending |
| `upload.detect.rows` | Rows |
| `upload.detect.transactions` | Transactions |
| `upload.progress.uploading` | Uploading {{file}} |
| `upload.progress.reading` | Reading the file: detecting format and encoding |
| `upload.progress.matchingColumns` | Matching columns |
| `upload.mapping.title` | Columns |
| `upload.mapping.input` | 4x35 input |
| `upload.mapping.source` | Column in your file |
| `upload.mapping.confidence` | Match |
| `upload.mapping.samples` | Sample values |
| `upload.mapping.notMapped` | Not mapped |
| `upload.mapping.high` | High |
| `upload.mapping.medium` | Medium |
| `upload.mapping.low` | Low |
| `upload.mapping.checkThis` | Check this mapping |
| `upload.mapping.swapped` | {{first}} and {{second}} swapped |
| `upload.mapping.fixedByFormat` | The format fixes these fields. They are shown for reference. |
| `upload.mapping.name` | Name |
| `upload.mapping.addressLine` | Address line {{n}} |
| `upload.mapping.postcode` | Postcode |
| `upload.mapping.town` | Town |
| `upload.mapping.country` | Country |
| `upload.mapping.account` | IBAN or account |
| `upload.mapping.partyRole` | Party role |
| `upload.pack.label` | Bank pack |
| `upload.pack.option` | {{pack}} · {{source}} · retrieved {{date}} |
| `upload.pack.effectiveFrom` | Effective from: {{date}} |
| `upload.pack.effectiveNotSet` | Effective from: not set |
| `upload.pack.sourceLink` | Open the source (opens in a new tab) |
| `upload.form.label` | Target form |
| `upload.form.structured` | Structured |
| `upload.form.structuredHint` | Each part of the address in its own ISO 20022 element. |
| `upload.form.hybrid` | Hybrid |
| `upload.form.hybridHint` | Town and country are required; at most 2 address lines; nothing repeated. |
| `upload.version.label` | Message version |
| `upload.version.pain03Note` | pain.001.001.03 has no elements for building name, floor, post box, room, town location or district. Where the pack allows, those go to address lines; otherwise they become findings. |
| `upload.llm.off` | Span labeller: off for this workspace |
| `upload.llm.on` | Span labeller: on (labels and substrings only; values always come from your file) |
| `upload.actions.check` | Check {{count}} records against {{pack}} |
| `upload.actions.chooseAnother` | Choose another file |
| `upload.actions.mapRequired` | Map at least the address lines or the country to continue. |
| `upload.error.unsupported` | This file type is not supported. Upload CSV, XLSX, pain.001 (.001.03, .001.09, .001.12) or MT101. |
| `upload.error.tooLarge` | This file is {{size}}. The limit is {{limit}}. |
| `upload.error.doctype` | This XML file declares a DOCTYPE, which 4x35 does not read for safety. Export the file again without it. |
| `upload.error.encoding` | 4x35 could not tell how this file's text is encoded. Save it as UTF-8 and upload again. |
| `upload.partial.unreadableRows` | {{count}} rows could not be read and are listed in the health report. The other rows can be checked. |
| `upload.partial.viewRows` | View unreadable rows |
| `upload.partial.duplicate` | You uploaded this file with the same pack and form on {{date}}. |
| `upload.partial.openExisting` | Open that batch |
| `upload.success.toast` | Upload saved. Checking against {{pack}}. |

## Accessibility

- The drop zone is a real file `input` with a visible `label` button; drag and drop is an
  enhancement, never the only path (WCAG 2.5.7: no dragging required).
- Sample values render with `dir="auto"` and in `--font-mono` so mixed scripts (for example
  Japanese, Hindi, Arabic samples) display in their own direction and font fallbacks.
- Confidence is a text band, not a colour; low-confidence rows add a `review` badge with a label.
- Each mapping Select has an accessible name that includes the input ("Column in your file for
  Town").
- The sticky summary panel at 1440 follows the table in DOM order, so reading order is mapping then
  decision; it never overlaps content at 200% zoom (it unsticks below 1024px).
- Progress uses ProgressPanel (`role="status"`, polite, throttled); detection results are announced
  once as a summary ("Found 500 rows, UTF-8, comma-separated").
- Targets: 44px at 375 and 768; 24px minimum at 1440.
