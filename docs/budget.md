# Budget

Owner: M0-00. Updated by M0-07 (provisioned actuals) and at each gate. Every figure is in USD, from
list prices on 20 Nov 2026. Actual spend gets logged at call time by the ticket that spends it, and the
manager reconciles at batch close.

**Status: proposed, waiting for owner approval (prerequisite P-04).** Until the owner approves,
nothing here may be bought or spent.

## Cost table

| Service | What we use | Unit price | Development (21 Nov to 4 Dec, 14 days) | Judging window (5 Dec 2026 to 29 Jan 2027, 56 days) | Notes |
|---|---|---|---|---|---|
| Render web service | 1 instance, Standard (1 CPU / 2 GB), Frankfurt, Docker | $25/month | $11.51 | $46.03 | ADR 0017: 2 GB chosen over 512 MB on the M0-09 memory risk |
| Render Postgres | Basic-256mb, PostgreSQL 17, Frankfurt | $6/month | $2.76 | $11.05 | daily backups included; storage projected by M0-08 |
| Render Postgres storage | about 3 GB (datasets + uploads) | about $1/month | $0.46 | $1.84 | M0-08 states the real projection; update here |
| **Render subtotal** | | **$32/month (≈ $1.05/day)** | **$14.73** | **$58.92** | **$73.65 total**, inside the $78 approved at Approval 2 |
| Anthropic API | `claude-haiku-5-5`, opt-in per workspace, prepaid credits | token-priced; hard cap $10/month | ≤ $5 expected (M0-03, M2-14, M3-11 at ≤ $1 each, plus ≤ $1 per other ticket that proves an AC live) | $0 expected (LLM off in judge sandboxes, M3-09) | one prepaid credit purchase of $10 (P-38) covers the expected spend |
| AWS Bedrock (optional) | same 12 probe cases in eu-central-1 | token-priced | inside the same ≤ $1 of M0-03 / M3-11 | $0 | only if the owner chooses to run it (P-08) |
| Kiro | free tier (50 credits) + hackathon free credits | $0 | $0 | $0 | Kiro Pro $20 for one month **only if** the trigger below fires |
| GitHub | private repo on GitHub Free, Actions | 2,000 Actions min/month free on private repos | $0 (spending limit $0: Actions stop rather than charge) | $0 (repo public from M4-SUBMIT: standard runners free) | watch minutes: ~70 PRs × ≤ 5 min CI (R10) plus gate runs |
| YouTube, Devpost, blog, social | accounts only | $0 | $0 | $0 | |
| Domain, object storage, Redis, APM, Vercel, Neon | **not bought** | | $0 | $0 | owner rule and ADR 0017 triggers not met |

### Assumptions

- Render bills per second, prorated per month. The service is provisioned by M0-07 on 21 Nov 2026
  and stays up without a break until 29 Jan 2027 (70 days × $32 × 12 / 365 = $73.65).
- No second instance, no autoscaling, no separate worker service (ADR 0017). `render.yaml` pins
  the plans, so the hosting cost cannot drift unless someone changes the blueprint.
- Bandwidth stays inside the workspace's included allowance (judges plus a nightly synthetic check).
- LLM: tests and CI replay recorded responses (`PROJECT.md` §9.1), so CI spends $0. Real tokens are
  spent only to prove an AC, ≤ $1 per ticket. The $10/month console limit is the hard stop.
- Kiro credit costs per action are measured by M0-02. The free 50 credits cover M0-02 and M0-10.

## Totals

| Window | Expected | Worst case inside the caps |
|---|---|---|
| Development (21 Nov to 4 Dec 2026) | $14.73 Render + ≤ $5 LLM (+ $10 prepaid outlay) + $0 Kiro = **≈ $20 spent, ≈ $25 cash out** | $14.73 + $10 (Nov cap) + $10 (Dec cap) + $20 Kiro Pro = **$54.73** |
| Judging (5 Dec 2026 to 29 Jan 2027) | $58.92 Render + $0 LLM = **≈ $59** | $58.92 + $10 (Jan cap) = **$68.92** |
| **Whole project** | **≈ $79 spent (≈ $84 cash out with the $10 prepaid credits)** | **$123.65** |

## Purchases

| Item | Decision (proposed) | Why |
|---|---|---|
| Render web Standard + Postgres Basic-256mb, Frankfurt (P-20) | **Buy** at M0-07 | Approved at Approval 2. EU residency (GDPR, R5). 2 GB holds the 20k-row XLSX parse (M0-09 confirms). |
| Anthropic API prepaid credits $10 (P-38) | **Buy** before M0-03 | The API is prepaid. $10 = one month's cap. Auto-reload off. |
| Kiro Pro, $20/month (P-12) | **Don't buy yet. Trigger: buy on Mon 23 Nov 2026 18:00 IST if the free-credit code has not been redeemed by then** | Owner chose to wait for free credits (20 Nov). M1 capability tickets write their specs in Kiro from 23 Nov (M1 due 24 Nov). Without credits, "insufficient Kiro use" is a disqualifier (`PROJECT.md` §1, §10). The request deadline (1 Dec 12:00 PT) is already met; the redeem-by date (4 Dec) is too late for M1 and M2. |
| AWS Bedrock probe (P-08) | **Owner decides. Recommendation: skip** | Optional. It needs an AWS CLI install, credentials and a model-access request, and its only value is an EU-resident inference option to mention in the privacy notice. The cost is inside M0-03's $1. |
| Object storage, Redis, APM, custom domain, Vercel, Neon | **Don't buy** | Uploads are `bytea` in Postgres (ADR 0003), jobs use pg-boss (no Redis), logs go to Render. Vercel and Neon are excluded by owner rule. |

## Judging window: always-on (P-07)

Recommendation: **keep the Standard web instance and the Basic Postgres always-on until 29 Jan 2027**.
Don't downgrade after submission. The rules require the app to stay testable until 29 Jan 2027
(`PROJECT.md` §1). A free or 512 MB instance spins down or fails the 20k-row case. A free Postgres
instance expires after 30 days. The saving from downgrading (about $40) does not justify a judge
meeting a cold start or an out-of-memory error. Production keeps serving a build at or after the
`submission` tag (M4-SUBMIT).

## Approved ceiling

Proposed for the owner to approve (P-04):

| Line | Ceiling |
|---|---|
| Hosting (Render), 21 Nov 2026 to 29 Jan 2027 | **$78** (approved at Approval 2; expected $73.65) |
| LLM (Anthropic, plus optional Bedrock) | **$10 per calendar month**, ≤ $1 per ticket, Anthropic console hard limit |
| Kiro Pro | **$20**, one month, only if the 23 Nov trigger fires |
| GitHub, YouTube, Devpost, blog, social | **$0** |
| **Total ceiling** | **$128** (hosting $78 + LLM 3 × $10 + Kiro $20) |

Approved by owner: _pending_ (date, comment link on issue #2).

## Alerts that enforce it

| Guard | Where | Set by | Effect |
|---|---|---|---|
| Anthropic monthly spend limit $10 | Anthropic console → Settings → Limits (P-15) | owner | API calls fail once the month's spend reaches $10 |
| Prepaid credit balance $10, auto-reload off | Anthropic console → Settings → Billing (P-38) | owner | nothing can be spent beyond the credits bought |
| `LLM_DAILY_SPEND_CAP_USD` | `.env` locally (P-37) and the Render service env (P-22) | owner sets value; M2-14 enforces from `llm_usage` | the labeller stops for the day and records go to review |
| `LLM_BATCH_TOKEN_CAP` | same | same | one batch cannot exceed its token budget |
| Per-ticket $1 | `resources.json` `LLM` budget; worker scripts compute tokens × price at call time | workers / manager | a live run stops before $1 (M3-11 P-LLM-2) |
| Render cost | plans pinned in `render.yaml`; Workspace Settings → Billing checked weekly (P-21). A Render billing alert has not been confirmed to exist; M0-07 records what the workspace offers | owner / M0-07 | fixed monthly cost, so a change in the invoice shows up within a week |
| GitHub Actions | github.com/settings/billing: Actions spending limit stays $0 | owner (default) | Actions stop at 2,000 min instead of charging |

## Actuals

| Date | Ticket | Service | Units | Cost |
|---|---|---|---|---|
| 2026-11-20 | M0-00 | none | none | $0.00 |
