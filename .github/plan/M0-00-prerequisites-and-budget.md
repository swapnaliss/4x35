---
title: "M0-00 · Prerequisites and budget: every service, key, registration, tool and cost, before any build"
milestone: "M0 · Recon & Bootstrap"
labels: ["owner", "meta", "recon", "blocker-risk", "critical"]
blocked_by: []
estimate: "2h"
resources: []
needs: ["P-29"]
---

## Context

`/start-milestone` runs for hours without the owner. It fails when a worker reaches a step that
needs something only the owner can provide (an API key in `.env`, a console toggle, an OAuth scope,
a Kiro login, a paid plan) and waits there unseen. This ticket finds **every** such dependency up
front, so the owner can provide them in one sitting and every later ticket checks its own
prerequisites in its first minute (`/start` Phase 1, `scripts/waves.py` holds).

It also protects two disqualification risks from `PROJECT.md` §1 and §10: "insufficient Kiro use"
(Kiro IDE not installed, free credits pending) and the budget the owner approved at Approval 2
(R9: hosting about $32/month, LLM ≤ $10/month).

This ticket **gathers and decides**. It installs, enables, registers and buys nothing.

## Scope

Read **every ticket in `.github/plan/`** plus `PROJECT.md` (§4 stack, §5 services and spend, §10
risks), `docs/architecture.md`, `.env.example` and `.dev-refs.md`, and inventory:

1. **Cloud services and APIs** per ticket, with region or plan constraints (Render Frankfurt web
   1 CPU / 2 GB + Postgres 17 basic; Anthropic API `claude-haiku-5-5`; AWS Bedrock eu-central-1 for
   the M0-03 probe; GitHub Actions)
2. **Accounts and registrations** and their lead times: Kiro account and free-credit request (ID
   check pending; credits must be requested by 1 Dec 2026 12:00 PT and redeemed by 4 Dec), Devpost
   draft, Render, Anthropic console, AWS account (Bedrock model access in eu-central-1), the public
   Crew app repo `swapnaliss/4x35-crew` (M3-04), YouTube (M4-03), blog and social accounts (M4-04)
3. **Credentials and where each lives**, by `.env.example` key name or keyring, who creates it and
   how. **Never record a value.** Includes `ANTHROPIC_API_KEY`, `RENDER_API_KEY`,
   `BOOTSTRAP_ADMIN_EMAIL`, the AWS credentials for Bedrock (how they are supplied is decided here:
   standard AWS SDK credential chain, location recorded in `.dev-refs.md`), the Kiro IDE and CLI
   login, the `gh` scopes (`repo`, `workflow`), and Render's GitHub connection for auto-deploy
4. **Console-only steps** no CLI can do, with the exact console path (Render: connect the GitHub
   repo; Anthropic console: create a key and set a monthly spend limit of $10; AWS console: request
   Bedrock model access in eu-central-1; Kiro: credit redemption; GitHub: About shows Apache-2.0)
5. **Local tools** with minimum versions: Node 24, npm 11, Docker daemon, `gh`, `gitleaks`, Render
   CLI, Kiro IDE and Kiro CLI, KiroCrew requirements (Node 22+, Python 3.12+, and whatever package
   installer it needs, since `pip3`/`uv` are missing), AWS CLI only if M0-03 needs it, `ffmpeg` and
   Chrome for M4-03 and design review, `jq`
6. **Purchases and subscriptions**: buy / don't buy, and why (Kiro Pro $20: owner chose to wait for
   free credits on 20 Nov, re-asked here with the trigger date; Render plans; no Redis, object
   storage, APM, Vercel or Neon)
7. **Running costs**: per service for development **and** for the judging window to 29 Jan 2027
8. **Owner decisions** needed before the build: the budget ceiling, the Kiro Pro trigger, the
   always-on choice for judging
9. **Standing approvals**: the owner confirms or declines each class once. Approved classes become
   allow rules in `.claude/settings.json` and replace the placeholder under "Standing approvals" in
   `CLAUDE.md`. Classes to confirm: **merge green PRs**; **deploy main to Render and reset judge
   sandboxes**; **real LLM spend ≤ $1 per ticket within the $10/month cap**

### Known so far (from `.kickoff-state.md` §A3 and Approvals; verify, do not assume)

| Item | State on 20 Nov 2026 | Owner action |
|---|---|---|
| Kiro account | created 16 Nov | none |
| Kiro free credits | requested; ID check and code pending (owner chose to wait rather than buy Pro, 20 Nov) | track daily; redeem when the code arrives; decide a date after which Pro is bought |
| Kiro IDE / CLI | **not installed** (no `kiro`/`kiro-cli` on PATH, no `~/.kiro`) | install and log in before M0-02 |
| Anthropic API key | **not yet** | create the key, set the $10/month limit, add `ANTHROPIC_API_KEY` to `.env` |
| AWS / Bedrock | AWS CLI missing; no credentials known | decide whether to run the Bedrock probe in M0-03 (optional) |
| Render CLI | logged in (owner account) | connect GitHub repo in the console before M0-07 |
| `gh` | logged in as swapnaliss, scopes `repo`, `workflow` | none |
| gitleaks | installed | none |
| Docker | daemon running (29.1.3) | none |
| ffmpeg, Chrome | installed (8.0.1, 156) | none |
| Budget | approved at Approval 2: Render ≈ $32/month ≈ $78 to 29 Jan 2027; LLM cap $10/month | confirm the ceiling in `docs/budget.md` |
| Standing approvals | proposed, not confirmed | confirm or decline each class |

Make it enforceable:

- Replace the example entries in `.github/plan/prereqs.json` with the real inventory (shape in
  `scripts/check-prereqs.py`), each item with a `verify` command that proves presence **without
  printing a value** (for example `[ -n "${ANTHROPIC_API_KEY:+set}" ]`, `command -v kiro-cli`,
  `render whoami >/dev/null`)
- `docs/PREREQS.md` rendered from it: `python3 scripts/check-prereqs.py --render`
- `docs/budget.md`: cost table, assumptions, development total, judging-window total, the ceiling
  the owner approves, and the alerts that enforce it (Anthropic console spend limit,
  `LLM_DAILY_SPEND_CAP_USD`, Render billing alert)
- `needs: [P-..]` frontmatter on **every** ticket (empty list allowed), then re-sync issues with
  `python3 scripts/bootstrap_github.py`
- An **owner checklist** comment on this issue: everything only the owner can do, in dependency
  order, groupable into one sitting

## Out of scope

- Doing any of the owner's actions, installing tools, enabling services, buying anything
- Changing any ticket's scope (only add `needs:`); a ticket that looks wrong goes to BL-01

## Acceptance Criteria

1. Every ticket file in `.github/plan/` read; each prerequisite in `prereqs.json` lists the tickets
   that need it in `needed_by`, and every ticket that needs it lists its id in `needs:`.
2. Every credential entry says where it lives (`.env` key name from `.env.example`, keyring, or
   console) and the repo contains **no value** (`./scripts/check-no-secrets.sh` passes).
3. Every console-only step has an exact console path in its `how` field.
4. `docs/budget.md` has a cost table, development and judging-window totals with assumptions, the
   purchases decision (including the Kiro Pro trigger date), and the approved ceiling.
5. `check-prereqs.py` runs every item, exits non-zero while a required item is missing, and prints
   no secret (run with a canary value set and grep the output for it: 0 matches).
6. Every ticket has a `needs:` field; issues re-synced (`bootstrap_github.py` reports no drift).
7. Owner checklist comment posted on this issue.
8. Standing approvals decided by the owner, recorded on this issue, the approved classes present as
   allow rules in `.claude/settings.json`, and the `CLAUDE.md` "Standing approvals" placeholder
   replaced with the decided list.

## Deliverables

- `.github/plan/prereqs.json`, `docs/PREREQS.md`, `docs/budget.md`
- `needs:` frontmatter on every `.github/plan/*.md`
- `.claude/settings.json` (allow rules), `CLAUDE.md` (Standing approvals section)

## Validation Gate

```bash
python3 scripts/check-prereqs.py --render; echo "exit $?"   # non-zero until the owner finishes
python3 scripts/check-prereqs.py --json | jq 'length'
python3 -c "import json;d=json.load(open('.github/plan/prereqs.json'));bad=[e['id'] for e in d if 'verify' not in e and e.get('kind')!='decision' and e.get('kind')!='purchase'];print('no verify:',bad);assert not bad"
grep -L '^needs:' .github/plan/*.md | wc -l                  # expect 0
CANARY_SECRET=canary-value-123 python3 scripts/check-prereqs.py 2>&1 | grep -c canary-value-123   # expect 0
python3 scripts/check-plan.py
python3 scripts/bootstrap_github.py --dry-run
./scripts/check-no-secrets.sh
```

## Handoff

- **Every ticket with a non-empty `needs:`**: the `P-` ids it needs and who provides each.
- **M0-02**: Kiro IDE and CLI installed and logged in; credit status; KiroCrew install requirements.
- **M0-03**: whether `ANTHROPIC_API_KEY` is present and whether the Bedrock probe runs (and how AWS
  credentials are supplied); the per-ticket LLM ceiling ($1).
- **M0-07**: Render GitHub connection done; plan names and costs approved.
- **M0-GATE**: its validation must include `python3 scripts/check-prereqs.py`; post that on the gate.
- Comment on this issue: the owner checklist, the approved budget ceiling, and the standing
  approvals as decided.
