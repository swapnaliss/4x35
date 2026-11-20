---
title: "M4-CLEANUP · Public tree: untrack the build workflow before the repo goes public"
milestone: "M4 · Submission"
labels: ["docs", "owner"]
blocked_by: ["M4-01", "M4-02", "M4-03", "M4-04", "M4-05"]
estimate: "2h"
resources: []
needs: ["P-03"]
---

## Context
Judges reading the public repo should see the product, its architecture and its evidence, not the
build workflow. During the build the workflow files must stay tracked, because `/start-milestone` and
`/gate` worktrees only receive tracked files. So this ticket runs **last**, after every other M4 build
ticket and before M4-GATE, which then proves the public tree from a clean clone.

Files are **untracked, not deleted** (`git rm -r --cached` plus `.gitignore`), so the owner keeps them
locally. History is **never rewritten** (CLAUDE.md "Never"): issues, PRs and old commits stay as the
visible record of how the product was built, which also supports the rules' "work after 30 Oct 2026"
and "no undisclosed pre-existing code" checks. Research, outreach, recon notes and review screenshots
were gitignored from day one and never entered history. `/.kiro` must stay tracked at the root
(disqualifier).

## Scope
**Untrack and gitignore:**

| Path | Why |
|---|---|
| `.github/plan/` | Ticket sources; the GitHub issues hold the same content |
| `PROJECT.md`, `WORKFLOW.md`, `CLAUDE.md` | Internal spec and workflow; the system design is public in `docs/architecture.md` |
| `.claude/commands/`, `.claude/agents/` | Workflow commands and agent instructions |
| `scripts/waves.py`, `scripts/bootstrap_github.py`, `scripts/check-prereqs.py`, `scripts/check-plan.py` | Milestone and kickoff tooling |
| `docs/PREREQS.md`, `docs/budget.md` | Internal standards and owner checklists (unless cited, below) |

**Keep tracked:**
- Product code, tests, IaC, CI, `README.md`, `LICENSE`, `NOTICE`, `.env.example`, `.claude/settings.json`
- `/.kiro/` in full (specs, steering, hooks, agents, settings): a disqualifier if missing
- `docs/architecture.md`, `docs/adr/`, `docs/design/`, `docs/evidence/`, `docs/screenshots/`,
  `docs/kiro-usage.md`, `docs/kiro-writeup.md`, `docs/video/`, `docs/posts/`, `docs/submission/`
- `evals/` (datasets, scoring, reports)
- `scripts/landing-checks.sh`, `scripts/check-no-secrets.sh`, `scripts/check-claims.mjs`,
  `scripts/check-links.mjs`, `scripts/check-submission.sh`, `scripts/kiro/`, `scripts/kiro-stats.mjs`,
  `scripts/load/`, `scripts/licences.mjs` (the clean-clone check and the evidence depend on them)
- Any file above that a tracked file cites: list it here, or repoint the citation to the issue. 
  `docs/engineering-standards.md` stays tracked (decided at kickoff, 20 Nov 2026): it is public design
  documentation that `docs/architecture.md` and `.kiro/steering/` cite.
- `scripts/landing-checks.sh` and `.github/workflows/*` must not call an untracked script (check below).

**Decide and record on the issue:** anything the owner wants kept public from the untrack list.

## Out of scope
- Rewriting history or removing anything from old commits
- Making the repo public (M4-SUBMIT, with the owner's go-ahead)

## Acceptance Criteria
1. `git ls-files` lists none of the untracked paths (output on the issue).
2. Every repo path cited by a tracked file is itself tracked: the citation check prints nothing.
3. `/.kiro` is tracked and not ignored; `docs/kiro-usage.md` and `docs/kiro-writeup.md` are tracked.
4. No tracked script or workflow calls an untracked script.
5. `./scripts/landing-checks.sh` passes on a clean clone of the merge commit.
6. CI is green on the merge commit.
7. File count before and after, and the owner's decisions, posted on the issue.

## Deliverables
- `.gitignore` additions and the untracking commit; any repointed citations

## Validation Gate
```bash
set -euo pipefail
INTERNAL='^(\.github/plan/|PROJECT\.md$|WORKFLOW\.md$|CLAUDE\.md$|\.claude/(commands|agents)/|scripts/(waves|bootstrap_github|check-prereqs|check-plan)\.py$|docs/(PREREQS|budget)\.md$)'
if git ls-files | grep -E "$INTERNAL"; then echo "internal paths still tracked"; exit 1; fi
git ls-files | wc -l
test -n "$(git ls-files .kiro)" && ! git check-ignore -q .kiro
git ls-files --error-unmatch docs/kiro-usage.md docs/kiro-writeup.md >/dev/null
# every repo path cited in a tracked file must itself be tracked (a local untracked copy does not count)
missing=$(git grep -hoE '(docs|scripts|infra|fixtures|eval|\.github|\.kiro)/[A-Za-z0-9_./-]+\.(md|ts|tsx|js|mjs|json|ya?ml|sh|py)' \
  | sort -u | while read -r p; do git ls-files --error-unmatch -- "$p" >/dev/null 2>&1 || echo "$p"; done)
[ -z "$missing" ] || { printf 'MISSING:\n%s\n' "$missing"; exit 1; }
! git grep -nE '(waves|bootstrap_github|check-prereqs|check-plan)\.py' -- scripts .github/workflows Makefile package.json
tmp=$(mktemp -d "$TMPDIR/cleanup.XXXX") && git clone -q . "$tmp/c" \
  && (cd "$tmp/c" && npm ci && ./scripts/landing-checks.sh)
gh run list --branch main --limit 1 --json conclusion -q '.[0].conclusion' | grep -qx success
```

## Handoff
- **M4-GATE**: comment with the merge commit SHA, the file count before and after, and the owner's
  decisions; the gate clones that commit.
- **M4-SUBMIT**: the tree is ready to be made public once M4-GATE passes.
