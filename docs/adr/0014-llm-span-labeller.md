# 0014. Optional LLM span labeller

- Status: accepted (2026-11-20, Approval 2)

## Context
Some records defeat the deterministic parsers; R6 forbids generated values; R9 caps spend.

## Decision
`claude-haiku-5-5` through `packages/llm` (an adapter, so Bedrock eu-central-1 can be swapped in if M0-03 confirms it). Opt-in per workspace, off by default. Input: address lines only. Output: structured JSON `{label, substring}`; code locates each substring in the NFC input; not found or found more than once → review. Responses cached by (record hash, prompt version, model). Caps: per-batch tokens, daily spend (env), 20 s timeout, 2 retries; on failure the record goes to review with the deterministic partial. Prompts versioned in the repo. Every call recorded in `llm_usage`. No Batch API at launch.

## Alternatives considered
LLM writing values (unprovable); an agent with tools (nothing to act on); multi-agent (no requirement).

## Consequences
Cost to reverse: Low: the step is optional and isolated. See [architecture](../architecture.md).
