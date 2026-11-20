# 0009. Rule packs as versioned data

- Status: accepted (2026-11-20, Approval 2)

## Context
Banks differ in detail; the rule logic must exist once (DRY).

## Decision
Packs are JSON validated by a zod schema in `packages/rulepacks`: id, version, source URL, retrieved date, `effective_from` (date or `not_set`), message versions and allowed forms per version, party scope, rules referencing a fixed vocabulary implemented once in core, severity `reject | strip | warn`. A per-message-version element map (.03 PostalAddress6, .09 PostalAddress24, .12 PostalAddress27) decides where a value can go; a missing element goes to AdrLine in hybrid form if the pack allows, else becomes a finding. Launch packs: CBPR+ generic (public PMPG/FAQ material only), Nordea, Danske, Handelsbanken, SEB, Deutsche Bank, BNP Paribas, ING, ZKB. Guide text is never copied; results say "checked against <pack>@<version>".

## Alternatives considered
Per-bank code; a rules engine such as OPA (a second language for a small vocabulary).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
