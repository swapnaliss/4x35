# Pre-flight

Serves first: **treasury analyst or ERP admin** and **small-bank ops**; the **payroll specialist**
before handing back a payroll file; the **judge** sees it for 20 seconds in the storyboard (1:35 to
1:55: red to green). Route: `/batches/:id/preflight`.

## Purpose

Check a payment file (pain.001 .03, .09, .12 or MT101), transaction by transaction, against one
pack version, link its parties to approved master-list addresses, and show each transaction move
from `fail` to `pass` as approved addresses are applied. Every result says "checked against
`<pack>@<version>`"; nothing here promises a bank outcome.

## Layout

1. **Header**: `h1` "Pre-flight", file name, message version, and the scope line "Checked against
   `{{pack}}` (source retrieved {{date}})" with the source popover.
2. **Before / after summary**: two columns of counts, "Before: as uploaded" and "After: with
   approved addresses", each a row of StatusBadges with counts (Pass, Warning, Fail, Needs review).
   Between them a plain arrow and the change line: "{{fixed}} transactions moved from fail to pass."
3. **Link panel**: how parties were linked to the master list (ADR 0022): "Linked by IBAN or
   account and name: {{matched}} · Ambiguous: {{ambiguous}} · No match: {{none}}", each count a
   link to its filtered rows. Ambiguous and unmatched parties go to review; only approved or edited
   records are applied.
4. **Transactions grid** (virtualised for large files): one row per transaction. Columns: Before
   (StatusBadge), After (StatusBadge), End-to-end id (mono), Party (debtor or creditor, name with
   `dir="auto"`), Country, Amount and currency (tabular, right aligned), Link (Matched, Ambiguous,
   No match, as text with an icon), Findings (count and top finding).
5. **Transaction drawer**: opens for the focused row: the `PstlAdr` before and after in mono (only
   that range changes; the rest of the file's bytes are untouched), each finding with its rule and
   element, the linked master record with a link to its record detail.
6. **Action bar**: "Run pre-flight again" (secondary) and "Go to export" (primary).

### 375

Header wraps; the before / after summary stacks (Before above After) with the change line between.
The grid becomes cards: end-to-end id, party, amount on line 2, then "Fail → Pass" as two badges
with an arrow, then link status. A card opens the drawer as a full screen. The action bar is at the
end of the list, full width.

### 768

Grid with columns Before, After, End-to-end id, Party, Findings; amount, country and link move to a
second line in each row. The drawer is a bottom sheet.

### 1440

Summary and link panel side by side above the grid; the grid takes the full width; the drawer
docks on the right (440px) without covering the Before and After columns.

## Components

StatusBadge (before, after, counts), Table in grid mode (virtualised), drawer (Dialog in
non-modal side variant at 1440, modal sheet at 375 and 768), ProgressPanel, Tooltip, pack source
popover, Button, Toast, EmptyState, ErrorState, Skeleton.

## States

### Empty

- The batch is a master list with no payment file linked: EmptyState "No payment file to
  pre-flight", body "Upload a pain.001 or MT101 file. Its parties are linked to this list by IBAN or
  account and name.", action "Upload a payment file".
- The payment file has no transactions with addresses: EmptyState "No addresses in this payment
  file", body "There is nothing to check. Nothing was changed."

### Loading

ProgressPanel above the grid: "Pre-flighting {{file}} against {{pack}}", "Step 2 of 3: applying
approved addresses", "{{done}} of {{total}} transactions", "Updated 2 seconds ago", polling every
2 s. Rows already checked render immediately with their Before badge and the After badge `running`
until their result arrives. Before the first rows arrive, 10 Skeleton rows with the caption
"Checking transactions".

### Error

- The run fails: ErrorState with the stored reason, trace id, and "Run pre-flight again" (the job is
  idempotent by batch, pack, step and chunk).
- The file cannot be read as the declared message version: "This file does not match the
  pain.001.001.{{version}} schema at line {{line}}: {{detail}}." with the XSD finding; no
  transaction results are shown as pass.
- The pack version is no longer available: "{{pack}} is not available. Choose another pack
  version." with a pack Select.

### Partial

- Some transactions still fail after applying addresses: they stay `fail` in After with the
  finding; the summary line says "{{remaining}} transactions still fail. Each one lists the rule."
  and the grid is sorted failing first.
- Ambiguous or unmatched links: rows show "Ambiguous" or "No match" in the Link column with the
  `review` badge in After and "Resolve in review" linking to the queue filtered to those parties.
- Records not yet approved: their transactions keep the original address; After equals Before with
  the note "Address not approved yet".

### Success

Every transaction meets the pack: the After column is all `pass` (or `warning` with notes), the
summary says "All {{total}} transactions meet the rules in {{pack}}." with the scope line beneath,
and "Go to export" is primary and focused-next in tab order. The red to green change animates per
badge (200ms cross-fade, none under reduced motion) as results arrive, and a polite announcement
summarises once at the end: "{{fixed}} transactions moved from fail to pass. {{remaining}} still
fail."

## Interactions

- Running starts automatically when the person arrives with new approvals since the last run;
  otherwise the last run (immutable, with its time) is shown with "Run pre-flight again".
- Sort: failing After first (default), then by end-to-end id, party, amount.
- Filter chips above the grid: Still failing, Fixed, Needs review, All.
- Row focus opens the drawer content on the side (1440) without moving focus; `Enter` moves focus
  into the drawer.
- Before / after XML in the drawer highlights only changed characters (fill plus underline).
- "Go to export" goes to the export screen with this run selected.

## Keyboard map

| Key | Action | Scope |
|---|---|---|
| `j` / `Arrow Down` | Next transaction | Grid |
| `k` / `Arrow Up` | Previous transaction | Grid |
| `Enter` | Move focus into the transaction drawer | Grid |
| `Esc` | Close the drawer, focus returns to the row | Drawer |
| `o` | Open the linked master record | Grid, drawer |
| `1` / `2` / `3` / `4` | Filter: Still failing / Fixed / Needs review / All | Grid |
| `Home` / `End` | First / last transaction | Grid |
| `r` | Run pre-flight again | Page, not in inputs |
| `x` | Go to export | Page, not in inputs |
| `?` | Show all shortcuts | Global |

## Copy

| Key | en |
|---|---|
| `preflight.header.title` | Pre-flight |
| `preflight.header.scope` | Checked against {{pack}} (source retrieved {{date}}) |
| `preflight.header.version` | Message version: {{version}} |
| `preflight.summary.before` | Before: as uploaded |
| `preflight.summary.after` | After: with approved addresses |
| `preflight.summary.change` | {{fixed}} transactions moved from fail to pass. |
| `preflight.summary.remaining` | {{remaining}} transactions still fail. Each one lists the rule. |
| `preflight.summary.allPass` | All {{total}} transactions meet the rules in {{pack}}. |
| `preflight.summary.lastRun` | Last run {{time}} |
| `preflight.link.title` | Links to the list |
| `preflight.link.summary` | Linked by IBAN or account and name: {{matched}} · Ambiguous: {{ambiguous}} · No match: {{none}} |
| `preflight.link.matched` | Matched |
| `preflight.link.ambiguous` | Ambiguous |
| `preflight.link.none` | No match |
| `preflight.link.onlyApproved` | Only approved or edited addresses are applied. |
| `preflight.link.resolve` | Resolve in review |
| `preflight.grid.label` | Transactions, {{total}} rows |
| `preflight.grid.before` | Before |
| `preflight.grid.after` | After |
| `preflight.grid.endToEndId` | End-to-end id |
| `preflight.grid.party` | Party |
| `preflight.grid.country` | Country |
| `preflight.grid.amount` | Amount |
| `preflight.grid.link` | Link |
| `preflight.grid.findings` | Findings |
| `preflight.grid.rowLabel` | Transaction {{index}} of {{total}}, {{endToEndId}}. Before: {{before}}. After: {{after}}. {{party}}, {{amount}}. Link: {{link}}. |
| `preflight.grid.notApprovedYet` | Address not approved yet |
| `preflight.filter.label` | Show |
| `preflight.filter.stillFailing` | Still failing |
| `preflight.filter.fixed` | Fixed |
| `preflight.filter.review` | Needs review |
| `preflight.filter.all` | All |
| `preflight.drawer.title` | Transaction {{endToEndId}} |
| `preflight.drawer.before` | Address before |
| `preflight.drawer.after` | Address after |
| `preflight.drawer.onlyRange` | Only this address block changes. The rest of the file is kept byte for byte. |
| `preflight.drawer.findings` | Findings in {{pack}} |
| `preflight.drawer.linkedRecord` | Linked list record |
| `preflight.drawer.openRecord` | Open the record |
| `preflight.drawer.close` | Close |
| `preflight.actions.runAgain` | Run pre-flight again |
| `preflight.actions.export` | Go to export |
| `preflight.progress.title` | Pre-flighting {{file}} against {{pack}} |
| `preflight.progress.checking` | Checking transactions |
| `preflight.empty.noFileTitle` | No payment file to pre-flight |
| `preflight.empty.noFileBody` | Upload a pain.001 or MT101 file. Its parties are linked to this list by IBAN or account and name. |
| `preflight.empty.uploadPayment` | Upload a payment file |
| `preflight.empty.noAddressesTitle` | No addresses in this payment file |
| `preflight.empty.noAddressesBody` | There is nothing to check. Nothing was changed. |
| `preflight.error.schema` | This file does not match the pain.001.001.{{version}} schema at line {{line}}: {{detail}}. |
| `preflight.error.packGone` | {{pack}} is not available. Choose another pack version. |
| `preflight.success.announce` | {{fixed}} transactions moved from fail to pass. {{remaining}} still fail. |

## Accessibility

- Before and After are separate columns with their own headers, each a StatusBadge with icon and
  label; the change is readable without colour ("Fail" then "Pass").
- Grid semantics as in the review queue: `role="grid"`, `aria-rowcount` = total transactions,
  `aria-rowindex` per rendered row, row accessible name from `preflight.grid.rowLabel`.
- Live results: badges update silently while the run progresses; only the ProgressPanel (throttled,
  polite) and the final summary are announced, so a 500-transaction run does not flood the screen
  reader.
- The drawer at 1440 is a complementary region (`aria-label` from its title), not modal; at 375 and
  768 it is a modal Dialog with focus trap and return.
- Amounts use the locale's number format with the ISO currency code as text; tabular numerals.
- Number-key filters are inactive in inputs and can be turned off (WCAG 2.1.4).
- Reduced motion: the red to green cross-fade becomes an instant swap.
- Targets: 44px at 375 and 768, 24px minimum at 1440.
