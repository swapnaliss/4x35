# App shell and batches home

Serves first: **hackathon judge** (the first screen after sign-in), then the AP clerk returning to
a batch in progress. Route: `/` (batches home) and the frame around every signed-in route.

## Purpose

Frame every signed-in screen with the same orientation: which workspace I am in, which batch, which
step of the journey, and whether this is a sandbox. The batches home is the first screen a judge
sees, so it says in one sentence what 4x35 does, shows the five steps, and lists the batches
already in the workspace with their status and next step.

## Layout

Regions, in reading and tab order: skip link, sandbox banner (sandbox workspaces only), top bar,
batch stepper (inside a batch), main content, footer.

- **Top bar** (48px, `--color-surface`, bottom hairline): product name "4x35" as the home link;
  workspace name with a switcher (owners of several workspaces); right side: keyboard shortcuts
  button (`?`), user menu (name, role, theme: System / Light / Dark, sign out).
- **Sandbox banner** (above the top bar, `--status-warning-bg` with the warning icon): "Sandbox:
  synthetic data, reset nightly." Not dismissable; it is a fact about the data.
- **Batch stepper** (inside a batch route only): five steps, Upload, Health report, Review,
  Pre-flight, Export. Each step shows a StatusBadge-style marker: done (`approved` icon), current
  (filled primary dot and bold label, `aria-current="step"`), blocked (muted, with a reason
  tooltip), and a count where useful ("Review 41 left").
- **Batches home main**: a one-line statement and a three-sentence "How it works" strip, then the
  batches table, then the primary action "Upload a file".
- **Footer** (muted, `--text-xs`): "Uploads are deleted after 30 days." Links: Attributions,
  Privacy (pages built in later tickets), app version and commit.

### 375

- Top bar: "4x35" left; a menu button (44 x 44) right opens a full-height sheet with workspace,
  shortcuts, theme and sign out. Workspace name moves into the sheet.
- Sandbox banner wraps to two lines; never truncated.
- Stepper collapses to "Step 3 of 5: Review" with a disclosure button that lists all five steps.
- Batches table becomes a list of cards: file name (wraps), kind and format on line 2, StatusBadge
  and "Next: Review 41 records" on line 3; the whole card is one 44px+ link.
- "Upload a file" is a full-width primary button pinned below the statement, not floating.

### 768

- Top bar shows workspace name; user menu collapses to an avatar button with the name in its
  accessible name.
- Stepper: horizontal, labels shown, counts hidden behind tooltips.
- Batches table: columns File, Status, Next step, Uploaded; Pack moves under File as a second line.

### 1440

- Content max width 1280px, left aligned to a 24px gutter; the review and pre-flight screens opt
  out of the max width to use the full viewport.
- Top bar: everything visible. Stepper sits under the top bar, full width, 40px.
- Batches home: statement and "How it works" in a single row of three short columns (Upload and
  check; Review with reasons; Pre-flight and export) above the table. Table columns: File, Kind,
  Pack and form, Status, Records, Next step, Uploaded, Uploaded by.

## Components

- Skip link "Skip to main content" (visible on focus).
- Top bar, workspace switcher (Select), user menu (Radix DropdownMenu), theme radio group.
- Sandbox banner (StatusBadge `warning` icon + text, `role="note"`).
- Batch stepper (`nav` with `aria-label`, ordered list).
- Batches Table with StatusBadge per batch (batch states map: uploaded, parsing, structuring =
  `running`; ready_for_review = `review`; reviewed and exported = `approved`, with the Next step column
  saying "Exported on {{date}}" for exported batches; failed = `fail`; the fixed labels of the
  status vocabulary are never renamed).
- EmptyState, ErrorState, Skeleton, Toast region (one per app), offline banner.
- Keyboard shortcuts Dialog (lists the shortcuts of the current screen and global ones).

## States

### Empty

No batches in the workspace. The table area shows an EmptyState: title "No batches yet", body "Upload
a supplier or employee list, or a pain.001 or MT101 payment file. 4x35 checks every address against
the bank pack you choose and proposes structured fields with a reason for each.", action "Upload a
file". Judge sandboxes are seeded, so a judge normally sees sample batches; if a reset is running
the empty state says so instead ("The sandbox is being reset. Sample batches return in a few
minutes.").

### Loading

Top bar and stepper render immediately from the session. The batches table shows five Skeleton rows
under the visible caption "Loading batches". After 10 s without a response the caption becomes
"Still loading batches. The server is slow to answer."

### Error

The batches request fails: ErrorState in place of the table with the problem+json title and detail,
the trace id and "Try again". The top bar stays usable. A 401 anywhere returns to sign-in with the
message "Your session ended. Sign in again." and returns to the same URL afterwards. Offline: a
banner under the top bar, "You are offline. Changes cannot be saved until you reconnect.", polite
announcement; it clears itself on reconnect.

### Partial

Some batches are still working: their rows show the `running` badge with the current step ("Running:
structuring 220 of 500") and update in place every 3 s by polling. A batch in `failed` shows the
`fail` badge with its reason and "Open" still works. If the batch list is paginated and the next page
fails, the loaded rows stay and a row-level ErrorState offers "Load more" again.

### Success

The table lists batches newest first, each with status and a "Next step" link that goes straight to
the right screen (for example "Review 41 records" or "Pre-flight the payment file").

## Interactions

- The batch row link goes to the batch's next step; the File name link goes to its health report.
- The stepper links to any step already reachable; unreachable steps are `aria-disabled` with a
  tooltip ("Review opens when structuring is done").
- Theme choice applies instantly, sets `data-theme` on `<html>` (or removes it for System) and is
  stored per user.
- Polling: the batches list polls every 3 s only while any row is `running`, and stops when the tab
  is hidden.
- Global shortcuts are active everywhere except while typing in an input.

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `Tab` / `Shift+Tab` | Move through skip link, banner links, top bar, stepper, main | Global |
| `Enter` | Activate the focused link or button | Global |
| `?` | Open the keyboard shortcuts dialog | Global, not in inputs |
| `g` then `h` | Go to batches home | Global, not in inputs |
| `g` then `u` | Go to upload | Global, not in inputs |
| `Esc` | Close menu, sheet or dialog; focus returns to its trigger | Menus and dialogs |
| `Arrow Up` / `Arrow Down` | Move within an open menu | Menus |

## Copy

| Key | en |
|---|---|
| `appShell.skipLink.main` | Skip to main content |
| `appShell.topBar.home` | 4x35 home |
| `appShell.topBar.workspace` | Workspace |
| `appShell.topBar.switchWorkspace` | Switch workspace |
| `appShell.topBar.shortcuts` | Keyboard shortcuts |
| `appShell.topBar.menu` | Menu |
| `appShell.userMenu.label` | Account menu for {{name}} |
| `appShell.userMenu.role` | Role: {{role}} |
| `appShell.userMenu.theme` | Theme |
| `appShell.userMenu.themeSystem` | System |
| `appShell.userMenu.themeLight` | Light |
| `appShell.userMenu.themeDark` | Dark |
| `appShell.userMenu.signOut` | Sign out |
| `appShell.sandbox.banner` | Sandbox: synthetic data, reset nightly. |
| `appShell.stepper.label` | Batch steps |
| `appShell.stepper.upload` | Upload |
| `appShell.stepper.healthReport` | Health report |
| `appShell.stepper.review` | Review |
| `appShell.stepper.preflight` | Pre-flight |
| `appShell.stepper.export` | Export |
| `appShell.stepper.compact` | Step {{current}} of {{steps}}: {{stepName}} |
| `appShell.stepper.reviewLeft` | {{count}} left |
| `appShell.stepper.blockedReview` | Review opens when structuring is done. |
| `appShell.stepper.blockedPreflight` | Pre-flight needs a payment file in this batch or a linked one. |
| `appShell.stepper.blockedExport` | Export opens when review has started. |
| `appShell.home.title` | Batches |
| `appShell.home.statement` | 4x35 turns free-text payment addresses into ISO 20022 structured addresses, with a reason for every field and a person's approval for every change. |
| `appShell.home.stepOneTitle` | Upload and check |
| `appShell.home.stepOneBody` | Upload a list or a payment file and pick a bank pack. The health report shows what fails and why. |
| `appShell.home.stepTwoTitle` | Review with reasons |
| `appShell.home.stepTwoBody` | Each proposed field shows where it came from. Anything without a source is left empty, never guessed. |
| `appShell.home.stepThreeTitle` | Pre-flight and export |
| `appShell.home.stepThreeBody` | Check the payment file against the pack, then download it with an audit report. |
| `appShell.home.upload` | Upload a file |
| `appShell.table.caption` | Batches in {{workspace}} |
| `appShell.table.file` | File |
| `appShell.table.kind` | Kind |
| `appShell.table.packAndForm` | Pack and form |
| `appShell.table.status` | Status |
| `appShell.table.records` | Records |
| `appShell.table.nextStep` | Next step |
| `appShell.table.uploaded` | Uploaded |
| `appShell.table.uploadedBy` | Uploaded by |
| `appShell.table.kindMasterList` | Supplier or employee list |
| `appShell.table.kindPaymentFile` | Payment file |
| `appShell.table.exportedOn` | Exported on {{date}} |
| `appShell.table.runningStep` | Running: {{stepName}} {{done}} of {{total}} |
| `appShell.table.nextReview` | Review {{count}} records |
| `appShell.table.nextHealth` | Open the health report |
| `appShell.table.nextPreflight` | Pre-flight the payment file |
| `appShell.table.nextExport` | Export |
| `appShell.table.loadMore` | Load more |
| `appShell.empty.title` | No batches yet |
| `appShell.empty.body` | Upload a supplier or employee list, or a pain.001 or MT101 payment file. 4x35 checks every address against the bank pack you choose and proposes structured fields with a reason for each. |
| `appShell.empty.sandboxResetting` | The sandbox is being reset. Sample batches return in a few minutes. |
| `appShell.loading.batches` | Loading batches |
| `appShell.loading.slow` | Still loading batches. The server is slow to answer. |
| `appShell.session.ended` | Your session ended. Sign in again. |
| `appShell.offline.banner` | You are offline. Changes cannot be saved until you reconnect. |
| `appShell.offline.back` | You are back online. |
| `appShell.footer.retention` | Uploads are deleted after 30 days. |
| `appShell.footer.attributions` | Attributions |
| `appShell.footer.privacy` | Privacy |
| `appShell.footer.version` | Version {{version}} ({{commit}}) |
| `appShell.shortcuts.title` | Keyboard shortcuts |
| `appShell.shortcuts.global` | Everywhere |
| `appShell.shortcuts.thisScreen` | On this screen |
| `appShell.shortcuts.goHome` | Go to batches |
| `appShell.shortcuts.goUpload` | Go to upload |
| `appShell.shortcuts.openHelp` | Show this list |

## Accessibility

- Landmarks: `header` (top bar), `nav` (stepper, `aria-label` "Batch steps"), `main` (`id="main"`,
  target of the skip link), `footer`. One `h1` per page: the screen title.
- The sandbox banner is `role="note"`, read once before the top bar; it is text, not only the
  warning colour.
- Stepper: ordered list; the current step has `aria-current="step"`; done steps include "done" in
  their accessible name ("Health report, done"); blocked steps are `aria-disabled="true"` and
  their reason is in `aria-describedby`.
- Route changes move focus to the new `h1` and announce the page title (`document.title` = "Screen
  · Batch · 4x35").
- Character-key shortcuts (`?`, `g h`) are off while focus is in a text field, and the shortcuts
  dialog has a switch to turn them off (WCAG 2.1.4).
- Targets: 44 x 44 at 375 and 768 (menu button, cards); 24 x 24 minimum at 1440.
- At 320px width and 400% zoom nothing scrolls horizontally except the batches table, which is
  replaced by cards below 640px.
- The running badge in the table updates silently; only the transition to done or failed is
  announced (polite), so the screen reader is not flooded by polling.
