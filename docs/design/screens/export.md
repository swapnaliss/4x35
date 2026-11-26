# Export

Serves first: **AP clerk** and **payroll specialist** (the corrected list in its original layout),
**treasury analyst** (the corrected payment file), **small-bank ops** and the **finance or treasury
lead** (the audit report); the **judge** sees it for 15 seconds in the storyboard (1:55 to 2:10).
Route: `/batches/:id/export`.

## Purpose

Hand back what was done, in the formats people already use: the corrected payment file (only the
`PstlAdr` ranges changed), the corrected list in its original layout (same columns, encoding,
delimiter and line endings), and an audit report (record, before, after, approver, pack version).
Say exactly what is in each file and what is not, before the person downloads it.

## Layout

1. **Header**: `h1` "Export", file name, scope line "Checked against `{{pack}}` · last pre-flight
   {{time}}".
2. **What is included** summary: "{{approved}} approved · {{edited}} edited · {{unknown}} left as
   the original · {{pending}} not reviewed yet (kept as the original)". Each count links to the
   filtered review queue.
3. **Artefacts**: one row (or card) per artefact, with:
   - name and format ("Corrected payment file · pain.001.001.09 XML"; "Corrected list · CSV, UTF-8,
     comma, CRLF, same columns as uploaded"; "Audit report · CSV and JSON")
   - what changed ("Address blocks changed: 371 of 500. Everything else kept byte for byte.")
   - StatusBadge for readiness (`pass` Ready, `running` Building, `warning` Ready with notes, `fail`
     Not available, with the reason)
   - Download button, size, and SHA-256 (first 12 characters in mono, copy full)
4. **Previous exports**: table of earlier exports (time, person, artefact, SHA-256, pack version);
   exports are new rows, never overwritten.
5. **Note**: "Downloads are deleted with the batch after 30 days. The audit hashes are kept."

### 375

Single column; artefacts as cards with a full-width Download button (48px). The summary line wraps
into a list. Previous exports become cards (time, person, artefact) with the hash on its own line.

### 768

Single column at 720px; artefacts as rows with the Download button at the right; previous exports
table shows Time, Artefact, Person; hash in a second line.

### 1440

Content width 1280px. Summary and artefacts in the left 8/12; right 4/12 a panel "Before you
download" with the scope line, the pre-flight summary (badges Before and After), and the
four-eyes note where it applies.

## Components

StatusBadge, Button (primary for the first ready artefact, secondary for others; loading while
building), Table, Tooltip, copy-hash button, ProgressPanel (building artefacts), Toast,
EmptyState, ErrorState, Skeleton.

## States

### Empty

Nothing reviewed yet: EmptyState "Nothing to export yet", body "Approve or edit at least one record.
Records you do not review are exported as they were uploaded.", action "Go to review". The audit
report artefact is still available (it lists the batch and the pack version, with no decisions).

### Loading

Artefacts build on request; each building artefact shows a ProgressPanel inside its row: "Building
corrected payment file", "Step 2 of 3: splicing address blocks", "{{done}} of {{total}}
transactions". Other artefacts stay downloadable. First load of the page shows Skeleton rows with
the caption "Loading export options".

### Error

- An artefact fails to build: its row shows `fail` "Not available" with the reason and trace id
  and "Try again"; the other artefacts are unaffected.
- The corrected payment file would not match its XSD after the splice: "The corrected file did not
  pass the pain.001.001.{{version}} schema check, so it was not offered. {{detail}}" and a link to
  the transactions concerned. Nothing broken is ever offered for download.
- The batch was purged (410): "This batch was deleted after 30 days. Its audit hashes are kept." with
  "Back to batches".

### Partial

Some records are not reviewed or are marked unknown: the summary says how many, every artefact
notes "{{count}} records kept as the original", and the payment-file artefact shows `warning`
"Ready with notes: {{count}} transactions still fail in {{pack}}" with a link to pre-flight. The
person can still download; the notes are also written into the audit report.

### Success

Artefacts are ready: each shows `pass` "Ready", size and SHA-256. After a download a Toast "Saved
{{file}}. SHA-256 {{hash}}." and a new row in Previous exports with the person and time.

## Interactions

- Download triggers the browser's save; the button shows its loading state until the response
  starts.
- Copy hash copies the full SHA-256 and confirms in a polite live region.
- Each count in the summary opens the review queue filtered to those records.
- Four-eyes workspaces: if records were approved by the uploader's second person, the panel names
  both; if four-eyes is on and some approvals are pending, the summary says so.
- Export never changes a record's state; it only creates a new export row and an audit event.

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `Tab` / `Shift+Tab` | Move through summary links, artefact actions, previous exports | Page |
| `Enter` / `Space` | Download or copy the focused artefact's hash | Buttons |
| `1` / `2` / `3` | Download the payment file / the list / the audit report | Page, not in inputs |
| `b` | Back to pre-flight | Page, not in inputs |
| `?` | Show all shortcuts | Global |

## Copy

| Key | en |
|---|---|
| `export.header.title` | Export |
| `export.header.scope` | Checked against {{pack}} · last pre-flight {{time}} |
| `export.summary.title` | What is included |
| `export.summary.approved` | {{count}} approved |
| `export.summary.edited` | {{count}} edited |
| `export.summary.unknown` | {{count}} left as the original |
| `export.summary.pending` | {{count}} not reviewed yet (kept as the original) |
| `export.artefact.paymentFile` | Corrected payment file |
| `export.artefact.paymentFormat` | {{version}} XML |
| `export.artefact.paymentChanged` | Address blocks changed: {{changed}} of {{total}}. Everything else kept byte for byte. |
| `export.artefact.list` | Corrected list |
| `export.artefact.listFormat` | {{format}}, {{encoding}}, {{delimiter}}, {{lineEnding}}, same columns as uploaded |
| `export.artefact.listChanged` | Rows changed: {{changed}} of {{total}}. Other cells unchanged. |
| `export.artefact.audit` | Audit report |
| `export.artefact.auditFormat` | CSV and JSON |
| `export.artefact.auditContents` | For each record: before, after, provenance, approver, time and pack version. |
| `export.artefact.ready` | Ready |
| `export.artefact.readyWithNotes` | Ready with notes: {{count}} transactions still fail in {{pack}} |
| `export.artefact.building` | Building |
| `export.artefact.notAvailable` | Not available |
| `export.artefact.keptOriginal` | {{count}} records kept as the original |
| `export.artefact.download` | Download {{name}} |
| `export.artefact.size` | {{size}} |
| `export.artefact.sha256` | SHA-256 |
| `export.artefact.copyHash` | Copy full SHA-256 |
| `export.artefact.hashCopied` | SHA-256 copied |
| `export.history.title` | Previous exports |
| `export.history.caption` | Earlier exports of this batch, newest first |
| `export.history.time` | Time |
| `export.history.person` | Person |
| `export.history.artefact` | Artefact |
| `export.history.pack` | Pack version |
| `export.note.retention` | Downloads are deleted with the batch after 30 days. The audit hashes are kept. |
| `export.panel.title` | Before you download |
| `export.panel.fourEyes` | Approved by {{approver}}; uploaded by {{uploader}}. |
| `export.panel.fourEyesPending` | {{count}} approvals are waiting for a second person. |
| `export.progress.building` | Building {{name}} |
| `export.progress.loading` | Loading export options |
| `export.empty.title` | Nothing to export yet |
| `export.empty.body` | Approve or edit at least one record. Records you do not review are exported as they were uploaded. |
| `export.empty.review` | Go to review |
| `export.error.schema` | The corrected file did not pass the pain.001.001.{{version}} schema check, so it was not offered. {{detail}} |
| `export.error.purged` | This batch was deleted after 30 days. Its audit hashes are kept. |
| `export.error.backToBatches` | Back to batches |
| `export.actions.backToPreflight` | Back to pre-flight |
| `export.success.saved` | Saved {{file}}. SHA-256 {{hash}}. |

## Accessibility

- Each artefact is a list item with a heading (`h2`) naming it; its readiness badge, description
  and actions follow in that order.
- Download buttons have unique accessible names ("Download corrected payment file"), not "Download"
  three times.
- Hashes are in mono with `aria-label` reading "SHA-256 starting {{first12}}"; the copy result is
  announced politely.
- Per-artefact ProgressPanels are polite and throttled; completion is announced once per artefact.
- Number-key shortcuts are inactive in inputs and can be turned off (WCAG 2.1.4).
- Targets: 48px download buttons at 375, 44px at 768, 24px minimum at 1440.
- Reflows at 320px with no horizontal scroll; the hash wraps rather than overflowing.
