# Workflow

## Where state lives
| What | Where |
|---|---|
| Tickets (source) | `.github/plan/*.md` → GitHub issues via `scripts/bootstrap_github.py` (`issue-map.json`) |
| Milestones, resources, prerequisites | `.github/plan/milestones.json`, `resources.json`, `prereqs.json` |
| Spec per capability (Kiro) | `.kiro/specs/<capability>/{requirements,design,tasks}.md` |
| Design | `docs/architecture.md`, `docs/adr/`, `docs/engineering-standards.md`, `docs/design/` |
| Kiro usage log | `docs/kiro-usage.md` (appended by a hook, M3-05) |
| Ticket working notes | `.prp/` (gitignored) |
| Credential locations | `.dev-refs.md` (gitignored); values only in `.env` |

## Commands
- `/status`: where things stand, with the owner list
- `/start <ticket>`: one ticket end to end (prerequisite check → PRP → implement → verify every AC →
  landing checks → design review for `frontend` → PR → backlog pass → merge → handoff)
- `/start-milestone <n>`: a manager plus one worktree worker per ticket, in parallel waves. Run
  `python3 scripts/waves.py <n>` first and check `Safe to spawn: YES`
- `/gate <n>`: the milestone gate from a clean state (fresh stack, migrations, seed). The last gate
  runs from a clean clone after `M4-CLEANUP`
- `/backlog`: log something found outside the current ticket into `BL-01`

## Kiro in the loop
Each capability is specified in Kiro first (`.kiro/specs/`), and its tasks are the ticket's
implementation steps. Work that ran in Kiro is logged in `docs/kiro-usage.md`. Steering files hold
the ISO 20022 rules and the never-invent principle, so both Kiro and Claude Code read the same rules.

## Design review
Every `frontend` ticket is reviewed by the `ui-reviewer` agent (never the builder) against
`docs/design/`, with screenshots in `.review/` (gitignored).

## Prerequisites rule
A ticket whose `needs:` are missing is held by `waves.py`; `/start` checks them in Phase 1 with
`python3 scripts/check-prereqs.py --ticket <id>`. Only the owner fills `.env`.

## Hard rules
- Never read or print `.env` values. Never commit secrets or real personal data.
- Ticket IDs are permanent. One PR per ticket. No history rewrites, no force-push to main.
- Scope is never cut to pass a gate.
- `/.kiro` stays tracked at the root.
- Commits carry no Claude co-author line.

## How a cold session resumes
1. `/status`
2. Read the open milestone's tickets and `docs/kiro-usage.md`
3. `python3 scripts/waves.py <n>` → `/start-milestone <n>` or `/start <ticket>`

## Keeping the backlog small
Every ticket runs a best-effort backlog pass before merging (`/start` Phase 7b). Every passed gate
spawns a post-gate sweep (`/gate` step 8). Neither blocks progress; decisions go to the owner.
