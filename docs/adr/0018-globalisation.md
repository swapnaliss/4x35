# 0018. Unicode, i18n and transliteration

- Status: accepted (2026-11-20, Approval 2)

## Context
R7; addresses arrive in many scripts while CBPR+ allows a restricted Latin set.

## Decision
UTF-8 end to end; i18n keys from day one; ISO-8601 UTC in data, local time in the UI. Transliteration only through the transform table (ADR 0008): ISO 9 for Cyrillic, ICU-style Latin-ASCII folding; Japanese romanisation only via a Japan Post record matched by postcode (`dataset` provenance). Scripts without a deterministic transform leave the field for review.

## Alternatives considered
Ad-hoc or LLM transliteration (not deterministic, not provable).

## Consequences
Cost to reverse: Medium. See [architecture](../architecture.md).
