---
title: "M4-SUBMIT · Submit: public repo + submission tag (owner OK)"
milestone: "M4 · Submission"
labels: ["owner"]
blocked_by: ["M4-GATE"]
estimate: "1h"
resources: []
needs: ["P-01", "P-03", "P-33", "P-35"]
---

## Context
The entry is due Fri 4 Dec 2026, 14:00 PT (Sat 5 Dec, 03:30 IST), with no extensions; the plan
targets Thu 3 Dec (PROJECT.md §1, §8). A private repo or a missing licence disqualifies, and the licence
must show in the repo's About. CLAUDE.md forbids making the repo public before this ticket and without
the owner's OK. The `submission` git tag freezes what was judged; the app must stay testable until
29 Jan 2027.

## Scope
1. Ask the owner for the go-ahead with the M4-GATE result; record the OK on the issue. Nothing below runs
   without it.
2. Make the repo public (`gh repo edit --visibility public --accept-visibility-change-consequences`);
   set the About description, website (app URL) and topics (`kiro`, `kiroween`, `iso20022`).
3. Create an annotated tag `submission` on the M4-GATE commit and push it.
4. Run `./scripts/check-submission.sh --public`.
5. Owner fills the Devpost form from `docs/submission/devpost.md`, pastes the judge credentials from
   `.sandbox-credentials.md` into the private field, sets the category to Resurrection, adds the video,
   repo, app, Crew repo, write-up, blog and social URLs, and submits.
6. Owner saves the Devpost confirmation (screenshot to `.review/M4-SUBMIT/`, not tracked) and comments
   the submission URL and time (PT) on the issue.
7. Afterwards, `main` may move on, but production keeps serving a build at or after the tag until
   29 Jan 2027; note that on the issue.

## Out of scope
- Any code or document change (all of it is gated in M4-GATE)
- History rewrites or force-pushes (never)

## Acceptance Criteria
1. The owner's go-ahead comment is on the issue before the visibility change (timestamps).
2. `gh repo view` shows visibility PUBLIC and licence Apache-2.0.
3. An anonymous clone (no credentials) of the public repo succeeds and contains a tracked `/.kiro`.
4. The `submission` tag exists on the remote and points at the M4-GATE commit.
5. `./scripts/check-submission.sh --public` prints PASS for every check.
6. The Devpost submission URL and the submit time (before 4 Dec 2026 14:00 PT) are on the issue.

## Deliverables
- Public repo with the `submission` tag; Devpost submission; issue comment with URLs and times

## Validation Gate
```bash
set -euo pipefail
gh repo view --json visibility,licenseInfo -q '.visibility+" "+.licenseInfo.spdxId' | grep -qx 'PUBLIC Apache-2.0'
repo=$(gh repo view --json url -q .url)
tmp=$(mktemp -d "$TMPDIR/public.XXXX")
GIT_TERMINAL_PROMPT=0 git -c credential.helper= clone -q "$repo.git" "$tmp/c"
test -n "$(git -C "$tmp/c" ls-files .kiro)"
git ls-remote --tags origin submission | grep -q submission
test "$(git rev-parse 'submission^{commit}')" = "$(git rev-parse origin/main)" || echo "note: main has moved past the tag; confirm the tag is the M4-GATE commit"
./scripts/check-submission.sh --public
```

## Handoff
- Judging (16 Dec 2026 → 29 Jan 2027): the sandboxes keep resetting nightly and the daily synthetic check
  keeps running; production may only change through green PRs that keep the storyboard e2e passing.
