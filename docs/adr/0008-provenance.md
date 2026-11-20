# 0008. Provenance model and transforms

- Status: accepted (2026-11-20, Approval 2)

## Context
R6 is the product's promise; it has to be enforced in code, not by convention.

## Decision
Every proposed value has a provenance kind: `span`, `transform`, `dataset`, `inferred`, `human` or `external`. A Proposal constructor rejects any value without valid provenance. Transforms come from a closed, versioned table (NFC, case, whitespace, postcode format, ISO 9 Cyrillic, Latin-ASCII folding where the pack charset requires it, `country-alias`: ISO 3166 alpha-2/alpha-3 codes and a closed, committed list of country-name aliases such as "UK" or "P.R. CHINA" → ISO code); anything else leaves the field empty for review. `dataset`, `inferred` and `external` values are never auto-approvable. Values are never truncated; over-length is a finding. Property tests prove these invariants.

## Alternatives considered
Free-form LLM output (cannot prove provenance); silent truncation (invents a different value).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
