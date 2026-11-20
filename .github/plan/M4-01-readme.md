---
title: "M4-01 · README for judges"
milestone: "M4 · Submission"
labels: ["docs", "critical"]
blocked_by: ["M3-GATE"]
estimate: "4h"
resources: []
needs: ["P-03"]
---

## Context
Presentation is 20% of the rubric and the README is the first thing a judge opens (PROJECT.md §7:
"README for judges", M4-01). `README.md` already has placeholder sections to fill. Claims discipline is
binding: no number without a measurement in the repo, accuracy per country with n. Domain wording rules
apply: "checked against `<pack>@<version>`", never "the bank will accept"; Swift's cutover date is not
set and is never presented as imminent. The rules require disclosure of other AI tools used (PROJECT.md
§1, CLAUDE.md).

## Scope
1. Fill every placeholder in `README.md`: Problem (the bank notice, who suffers, sources linked),
   Solution (the core journey in 8 steps with one screenshot each from `docs/screenshots/`), Why now
   (deferred cutover, market dates, bank enforcement; dates with sources, no imminence), Architecture (a
   diagram from `docs/architecture.md` §4 plus links to the ADRs), Accuracy (from M3-07's snippet, kept
   as generated), Demo (app URL, "judge credentials in the Devpost private field", video link once M4-03
   has it), How Kiro built it (a short summary linking `docs/kiro-writeup.md` from M4-02), Future vision
   (PROJECT.md §11), How to run (`make up`, migrate, seed, test).
2. **Judge quick start** near the top: sign in to your sandbox, upload or use the seeded files, read the
   health report, review, pre-flight, export; what resets nightly.
3. **What this does not do** (PROJECT.md §9) and **Known limitations** from `BL-01` entries marked
   `accepted limitation`.
4. **Built with** and **AI tools disclosure**: Kiro (how), Claude Code (how it was used: ticket
   execution and review), any asset tools; the workflow templates disclosed as standard development
   resources; "no code from any earlier project".
5. A claims ledger `docs/evidence/claims.md`: every number in the README → its source file and the value
   there. `scripts/check-claims.mjs` reads the ledger, checks each value appears in its source file, and
   checks every number-bearing sentence in the README is in the ledger.
6. Screenshots captured from production on synthetic data into `docs/screenshots/` (light theme, 1440 px,
   alt text in the README).
7. Links: Crew repo, Kiro power path, MCP server README, `/accuracy`, `/privacy`, `/attributions`,
   licence, NOTICE.

## Out of scope
- The Kiro write-up body (M4-02), the video (M4-03), the Devpost text (M4-05)
- Untracking workflow files (M4-CLEANUP); avoid linking to `PROJECT.md`, `WORKFLOW.md`, `CLAUDE.md` or
  `.github/plan/` because they become untracked

## Acceptance Criteria
1. No placeholder text remains (`grep -n '_Placeholder' README.md` finds nothing), except the video link,
   which M4-03 fills.
2. `node scripts/check-claims.mjs` passes: every README number is in the ledger and found in its source.
3. A link check over `README.md` passes: every relative link resolves to a tracked file, and every
   external link returns 2xx or 3xx.
4. No forbidden wording: no "will accept", "will reject", "guaranteed compliant", and no sentence giving
   a Swift removal date as set (grep plus the claims check).
5. The README links no file that M4-CLEANUP untracks.
6. Every image has alt text; headings are in order (a markdown lint rule run).
7. The AI tools disclosure section exists and names Kiro and Claude Code.

## Deliverables
- `README.md`, `docs/screenshots/*.png`, `docs/evidence/claims.md`, `scripts/check-claims.mjs`,
  `scripts/check-links.mjs`

## Validation Gate
```bash
set -euo pipefail
! grep -n '_Placeholder' README.md | grep -v -i 'video'
node scripts/check-claims.mjs README.md docs/evidence/claims.md
node scripts/check-links.mjs README.md
! grep -niE 'will (accept|reject)|guaranteed compliant' README.md
! grep -nE '\]\((PROJECT|WORKFLOW|CLAUDE)\.md|\]\(\.github/plan/' README.md
grep -qiE 'Claude Code' README.md && grep -qiE 'Kiro' README.md
npx tsx evals/accuracy/readme-snippet.ts --check README.md
./scripts/landing-checks.sh
```

## Handoff
- **M4-03 (video)**: the README's judge quick start is the video's flow; the screenshots are the
  fallback shots.
- **M4-05 (Devpost)**: the README's Problem, Solution and Built with sections are the source text.
- **M4-CLEANUP**: `scripts/check-claims.mjs` and `scripts/check-links.mjs` stay tracked (the gate uses
  them).
