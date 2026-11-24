# LLM providers: data handling and sub-processors

Captured by M0-03 on 2026-11-24 for M3-12's privacy notice and the in-app LLM opt-in text (ADR 0014).
Each page was fetched with `curl -sSL` on the retrieval date. The downloads are not committed; the
SHA-256 identifies the exact bytes read. Only facts quoted below were checked against the page text;
M3-12 re-reads the pages before publishing the notice.

## Anthropic (the provider used: `claude-haiku-5-5` on the Anthropic API)

| Page | URL (after redirects) | Retrieved | HTTP | SHA-256 |
|---|---|---|---|---|
| Privacy Policy | https://www.anthropic.com/legal/privacy | 2026-11-24 | 200 | `5c1c5f81deffd2131e84c4ce07cc723f28bc99bf45aabe52b85e2000032c4939` |
| Commercial Terms of Service | https://www.anthropic.com/legal/commercial-terms | 2026-11-24 | 200 | `cb88eb352ff2718de570571ecb71d4ebd5c811ecdaa928914b955d81733422b6` |
| Data Processing Addendum | https://www.anthropic.com/legal/data-processing-addendum | 2026-11-24 | 200 | `f75b2d7a4778cd439f390b21bcd257bc8bc0bb62991f3b79f8438c46086921b0` |
| Sub-processors (Trust Center) | https://trust.anthropic.com/subprocessors | 2026-11-24 | 200 | `1f9ef05ea5162d37fe463ea463ba59c56fb63a902bced30ddf6b01ceef17ca07` |
| API and data retention | https://platform.claude.com/docs/en/manage-claude/api-and-data-retention | 2026-11-24 | 200 | `df20a25448f7046afbc55182da5cdfbc00b1d828a13ad2de20c5b352a14a6d68` |
| How long do you store my organization's data? | https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data | 2026-11-24 | 200 | `eb0b002f14567344892e1acd983a6e5424fa1580745ed704998c90f8ab6375e5` |
| Data residency | https://platform.claude.com/docs/en/manage-claude/data-residency | 2026-11-24 | 200 | `b82cf405981f482207514c8c9c01643571c2d5c5b1333ce59c9c79e597a15dbe` |
| Pricing | https://platform.claude.com/docs/en/about-claude/pricing | 2026-11-24 | 200 | `03762f04d606946735ab512c7cdd6726a913298b1d65548976fd32b103deed5f` |

The sub-processors page is a client-rendered Trust Center: the fetched HTML is the same app shell
as https://trust.anthropic.com/ (same hash), so the list itself must be read in a browser.
`https://www.anthropic.com/subprocessors` redirects to it; `/legal/subprocessors` and `/legal/dpa`
return 404.

Facts checked against the page text on 2026-11-24:
- Retention: "For Anthropic API users, we automatically delete inputs and outputs on our backend
  within 30 days of receipt or generation", with listed exceptions (privacy.claude.com article).
- Zero data retention exists as an arrangement: "Anthropic does not store customer prompts or
  responses at rest after the API response is returned" (API and data retention page).
- Inference geography: the `inference_geo` request parameter takes `"global"` (default: "may run in
  any available geography") or `"us"`. No EU value is listed. Every M0-03 fixture reports
  `usage.inference_geo: "global"`.
- Price for `claude-haiku-5-5`: $0.10 per million input tokens for prompts up to 100,000 tokens,
  $0.50 per million output tokens (Pricing page). M0-03's cost figures use these.

## AWS (Amazon Bedrock; not used, P-08 = skip)

Recorded so M3-11 and M3-12 have the comparison if the Bedrock route is reopened.

| Page | URL | Retrieved | HTTP | SHA-256 |
|---|---|---|---|---|
| Amazon Bedrock: Data protection | https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html | 2026-11-24 | 200 | `7bdec30ce80af29fe6cc47f0ebef009ef696b992e4de6ddead39609285b57b39` |
| AWS Sub-processors | https://aws.amazon.com/compliance/sub-processors/ | 2026-11-24 | 200 | `f01b89dc20846e031337cba7ad0ae3ba2f23f9fdb6c29732bf7a1e4bd05165dd` |
| AWS Privacy Notice | https://aws.amazon.com/privacy/ | 2026-11-24 | 200 | `49b35f4bb5130f0b1bace440d0e5ce471f57731b28c224f19252879bbaa591c6` |
| AWS Data Privacy FAQ | https://aws.amazon.com/compliance/data-privacy-faq/ | 2026-11-24 | 200 | `63ac6438c8050eab1e47770776123aa378314f81dbe876d68d6860e346e2276f` |

Fact checked against the page text on 2026-11-24: "Because the model providers don't have access
to those accounts, they don't have access to Amazon Bedrock logs or to customer prompts and
completions" (Bedrock data protection page).
