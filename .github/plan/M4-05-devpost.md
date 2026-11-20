---
title: "M4-05 · Devpost submission text + artefact checklist"
milestone: "M4 · Submission"
labels: ["docs"]
blocked_by: ["M4-01", "M4-02", "M4-03"]
estimate: "2h"
resources: []
needs: ["P-03", "P-35"]
---

## Context
The Devpost form is what judges read first and Stage One is pass/fail on the theme and on "reasonably
applies the required tools" (PROJECT.md §1). Every required artefact must be present: public repo with an
OSI licence in About and `/.kiro` tracked at the root, app URL with judge credentials in the private
field, description, public YouTube video < 3 min, Kiro usage write-up, plus the bonus entries. This
ticket drafts the text and a checklist that M4-SUBMIT runs; it does not submit.

## Scope
1. `docs/submission/devpost.md`: the text for each Devpost field (title, tagline, category
   "Resurrection" with one paragraph on the dead technology, inspiration, what it does, how we built it,
   challenges, accomplishments, what we learned, what's next, built with), the URLs (repo, app, video,
   Crew repo, Kiro write-up, blog), and the testing instructions for judges (sandbox sign-in, nightly
   reset, synthetic data, what to try). It holds **no credentials**: the private field is filled by the
   owner from `.sandbox-credentials.md` (M3-09) in M4-SUBMIT.
2. `docs/submission/checklist.md`: each requirement and disqualifier from PROJECT.md §1 → how it is met →
   the command that proves it.
3. `scripts/check-submission.sh`: runs the checklist commands that can be run before the repo is public
   (licence file, `.kiro` tracked and not ignored, app health, accuracy page, video oEmbed, Crew repo
   public, write-up present, no secrets) and prints a PASS/FAIL table; a `--public` flag adds the checks
   that need the repo public (About licence, anonymous clone).
4. Check the live Devpost form fields once and adjust the field list to match.

## Out of scope
- Submitting, making the repo public, tagging (M4-SUBMIT, owner)

## Acceptance Criteria
1. `devpost.md` has text for every field the live form shows (listed on the issue), within the form's
   length limits.
2. Every number in `devpost.md` is in `docs/evidence/claims.md` (claims check); no forbidden wording.
3. `devpost.md` and `checklist.md` contain no password, token or credential (gitleaks clean; grep for the
   sandbox user emails finds nothing).
4. `scripts/check-submission.sh` prints PASS for every pre-public check on `main`.
5. The checklist covers every artefact and every disqualifier in PROJECT.md §1 (a script compares the
   lists).

## Deliverables
- `docs/submission/devpost.md`, `docs/submission/checklist.md`, `scripts/check-submission.sh`

## Validation Gate
```bash
set -euo pipefail
node scripts/check-claims.mjs docs/submission/devpost.md docs/evidence/claims.md
! grep -niE 'will (accept|reject)|password|4x35_[A-Za-z0-9]{8}' docs/submission/*.md
gitleaks detect --source . --no-banner
./scripts/check-submission.sh
./scripts/landing-checks.sh
```

## Handoff
- **M4-SUBMIT**: paste `devpost.md` into the form, fill the private field from `.sandbox-credentials.md`,
  then run `./scripts/check-submission.sh --public` after the repo goes public.
- **M4-CLEANUP**: `docs/submission/` and `scripts/check-submission.sh` stay tracked.
