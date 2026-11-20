---
title: "M4-GATE · Submission ready, proved from a clean clone"
milestone: "M4 · Submission"
labels: ["gate"]
blocked_by: ["M4-01", "M4-02", "M4-03", "M4-04", "M4-05", "M4-CLEANUP"]
estimate: "2h"
resources: []
needs: []
---

## Context
PROJECT.md §8: "M4-GATE from a clean clone after M4-CLEANUP; then M4-SUBMIT". This is the last check
before the repo goes public and the entry is submitted (deadline Fri 4 Dec 2026 14:00 PT, no
extensions). It proves what a judge will get: a clone that builds and tests, an app that works, and
every artefact the rules require. Gates are empirical (`/gate`); nothing is deferred to pass.

## Scope
Run `/gate M4-GATE`: confirm every blocker is closed, then from a **fresh clone of `main` after
M4-CLEANUP** (not the working tree): install, `make up`, migrations, seed, landing checks, then
production and artefact checks. Post the results table on the issue.

## Out of scope
- Making the repo public, tagging, submitting (M4-SUBMIT)
- New fixes (a failure goes back to its ticket via `BL-01`)

## Acceptance Criteria
Re-prove, each with evidence:
1. **M4-CLEANUP**: the clean clone has none of the internal paths, has `/.kiro` tracked, and the
   citation check prints nothing.
2. The clean clone installs (`npm ci`), starts (`make up`), migrates, seeds and passes
   `./scripts/landing-checks.sh` (full level), including the accuracy eval with invented = 0.
3. **M4-01**: no placeholders, the claims check and the link check pass on `README.md`; the AI tools
   disclosure is present.
4. **M4-02**: the write-up has every Kiro feature section; its numbers match `kiro-stats.json`
   regenerated in the clean clone.
5. **M4-03**: the video URL in the README resolves (oEmbed 200); the recorded duration on the issue is
   < 180 s; captions end before 3:00.
6. **M4-04**: the blog and social URLs resolve; the required mention and hashtag are present in the
   drafts.
7. **M4-05**: `./scripts/check-submission.sh` prints PASS for every pre-public check.
8. Production: the storyboard e2e (M2-26) passes; `/accuracy`, `/privacy` and `/attributions` load
   without login; judge sandboxes have reset in the last 26 hours.
9. The Crew repo is public with Apache-2.0 and a green last CI run.
10. Secrets: `gitleaks detect` over the full history of the clean clone is clean.

## Deliverables
- Gate result comment on the issue (AC table with evidence, the clean-clone commit SHA)
- Screenshots in `.review/M4-GATE/`

## Validation Gate
```bash
set -euo pipefail
tmp=$(mktemp -d "$TMPDIR/m4gate.XXXX")
git clone -q "$(git remote get-url origin)" "$tmp/c" && cd "$tmp/c"
git log -1 --format='%H %s'
INTERNAL='^(\.github/plan/|PROJECT\.md$|WORKFLOW\.md$|CLAUDE\.md$|\.claude/(commands|agents)/|scripts/(waves|bootstrap_github|check-prereqs|check-plan)\.py$|docs/(engineering-standards|PREREQS|budget)\.md$)'
! git ls-files | grep -E "$INTERNAL"
test -n "$(git ls-files .kiro)" && ! git check-ignore -q .kiro
gitleaks detect --source . --no-banner
npm ci
make reset            # down with volumes, then up: migrate + seed (M0-06)
./scripts/landing-checks.sh
! grep -n '_Placeholder' README.md
node scripts/check-claims.mjs README.md docs/evidence/claims.md
node scripts/check-links.mjs README.md
node scripts/kiro-stats.mjs --out "$TMPDIR/kiro-stats.json" --check-properties
cmp <(python3 -m json.tool --sort-keys "$TMPDIR/kiro-stats.json") <(python3 -m json.tool --sort-keys docs/evidence/kiro-stats.json)
url=$(grep -oE 'https://(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[A-Za-z0-9_-]+' README.md | head -1)
curl -fsS -o /dev/null "https://www.youtube.com/oembed?url=$url&format=json"
./scripts/check-submission.sh
make e2e-prod
npm run sandbox:status -- --target prod
gh repo view swapnaliss/4x35-crew --json visibility,licenseInfo -q '.visibility+" "+.licenseInfo.spdxId' | grep -qx 'PUBLIC Apache-2.0'
```

## Handoff
- **M4-SUBMIT**: the gate comment (clean-clone SHA) is the commit to tag `submission`; the owner's
  go-ahead is asked with the gate result in hand.
