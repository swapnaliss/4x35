---
inclusion: always
---

# Never invent

Every value 4x35 proposes must be traceable to the input. No provenance means the field stays empty and goes to review.

## Provenance kinds (ADR 0008)
- `span`: the value is a substring of the input.
- `transform`: the value comes from the input through a transform in the closed table.
- `dataset`: the value comes from a reference dataset.
- `inferred`: the value was inferred.
- `human`: a person entered or approved it.
- `external`: the value comes from an external source.

The Proposal constructor rejects any value without valid provenance.

## Rules
- No provenance: the field stays empty and goes to review.
- `dataset`, `inferred` and `external` are never auto-approvable.
- Transforms come only from the closed, versioned table. Anything else leaves the field empty for review.
- Never truncate. Over-length is a finding.
- Property tests prove these invariants.

## Closed transform table (ADR 0008)
- NFC
- case
- whitespace
- postcode format
- ISO 9 Cyrillic
- Latin-ASCII folding, where the pack charset requires it
- `country-alias`: ISO 3166 alpha-2/alpha-3 codes and a closed, committed list of country-name aliases such as "UK" or "P.R. CHINA" to ISO code

## Datasets (ADR 0007)
- Use a dataset value only on a unique match corroborated by an input span.
- Datasets are GeoNames postal codes and Japan Post data.
- Pipeline order: country detection, chromium-i18n country formats, per-country line parsers, dataset lookups, PMPG lint rules, optional LLM labelling (only for records the deterministic path cannot finish), provenance check, confidence.

## LLM (ADR 0014)
- The LLM returns labels and substrings only, never values.
- Code locates each substring in the NFC input.
- Substring not found, or found more than once: the record goes to review.
- The LLM step is opt-in per workspace and off by default.

## Data
- Use synthetic data only for every supplier, employee and payment record in tests, demo and sandboxes.
- No mocks or demo mode in the product path.
- Tests replay recorded real responses.

Sources: [ADR 0008](../../docs/adr/0008-provenance.md), [ADR 0007](../../docs/adr/0007-deterministic-structuring.md), [ADR 0014](../../docs/adr/0014-llm-span-labeller.md), [PROJECT.md](../../PROJECT.md)
