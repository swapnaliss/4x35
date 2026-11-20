# 0007. Deterministic-first structuring

- Status: accepted (2026-11-20, Approval 2)

## Context
R6 never-invent; R9 cost; libpostal and deepparse are weak for Japan and India.

## Decision
Pipeline: country detection (names, ISO codes, postcode shapes) → chromium-i18n country formats → per-country line parsers (JP, IN, CN, SG, HK, AE, BR, DE, GB, US, FR, NL, ES, IT first) → dataset lookups (GeoNames postal, Japan Post) used only on a **unique** match corroborated by an input span → PMPG lint rules → optional LLM labelling (ADR 0014) only for records the deterministic path cannot finish → provenance check (ADR 0008) → confidence.

## Alternatives considered
libpostal sidecar (4 GB RAM, ≈ $220 hosting to 29 Jan, known JP/IN failures); deepparse (torch, heavy); Swift's address model (non-OSI licence, town and country only, unmaintained); an LLM generating values (provenance cannot be proven).

## Consequences
Cost to reverse: Medium: the parser stage is an interface; libpostal can be added if the eval shows a gap. See [architecture](../architecture.md).
