---
title: "BL-01 · Backlog: findings outside the ticket in flight"
milestone: "M0 · Recon & Bootstrap"
labels: ["meta"]
blocked_by: []
estimate: "0h"
resources: []
needs: []
---

## Context

During the build every discovered problem is a fork: fix it now and lose the ticket, or forget it
and lose the finding. This issue is the third option. Findings are logged here as comments with
`/backlog <what you found>` (`.claude/commands/backlog.md`), fixed ticket by ticket in `/start`
Phase 7b, swept after every passed gate (`/gate` step 8), and what remains at submission becomes
the stated limitations and future-vision material (`PROJECT.md` §9 and §11). A limitation found and
stated is a strength; the same limitation found by a judge is a hole.

This issue stays open for the whole build. It has no acceptance criteria of its own and is never
covered by a gate.

## Scope

One comment per finding, in exactly this format:

```markdown
### <YYYY-MM-DD HH:MM> · found in <TICKET-ID> · <type>
**What:**        <one line>
**Impact:**      <what breaks or is at risk>
**Workaround:**  <what we did instead, or "none — deferred">
**Action:**      <fix now | fix before submission | accept as limitation | document in HLD>
**Owner ticket:** <ticket id whose scope it belongs to, or "this ticket">
**Status:** open
```

- `<type>` is exactly one of: `bug` · `gap` · `pitfall` · `constraint` · `assumption-wrong` ·
  `perf` · `security` · `data-quality`.
- **Triage**: blocks the current ticket's AC → fix it now and still log it; breaks a later ticket →
  log it and post a `blocker` comment on that ticket; neither → log and defer.
- **Owner ticket** names the ticket whose scope the fix belongs to; `/start` Phase 0 step 5 lists
  open entries by this line.
- **Status** changes in place, never by a new comment (`gh api -X PATCH
  repos/$REPO/issues/comments/<id>`): `open` → `fixed in #<pr> (<TICKET-ID>)` /
  `deferred → <TICKET-ID> (<blocker>)` / `accepted limitation (<reason>)`. Entries are never
  deleted.
- A finding that invalidates `PROJECT.md` is corrected in `PROJECT.md` in the same commit as the
  current ticket's work.
- No secret, `.env` value or real personal data appears in an entry; no vague entries ("perf could
  be better").

## Out of scope

- Feature requests or new scope (those need the owner and a ticket)
- Gate verdicts (recorded on the gate issues)

## Acceptance Criteria

None: this is a standing log, not a deliverable ticket.

## Deliverables

- Comments on this issue in the format above

## Validation Gate

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
BL=$(python3 -c "import json;print(json.load(open('.github/plan/issue-map.json'))['BL-01'])")
gh api "repos/$REPO/issues/$BL/comments" --paginate --jq '.[] | select(.body|test("\\*\\*Status:\\*\\* open")) | (.body|split("\n")[0])'
```

## Handoff

- **Every `/start`**: Phase 0 step 5 reads open entries this ticket owns or touches.
- **Every `/gate`**: step 8 sweeps open entries after a pass.
- **M4-01, M4-05**: accepted limitations feed the README and Devpost "what it does not do" section.
