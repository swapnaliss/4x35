# 0003. PostgreSQL with Drizzle; uploads in the database

- Status: accepted (2026-11-20, Approval 2)

## Context
R1 caps files at 10 MB; R5/R6 need transactions; one store keeps backups and purge in one place.

## Decision
Managed Postgres 17 on Render. Drizzle ORM with drizzle-kit migrations run on deploy. Original uploads and export artefacts stored as `bytea`. GeoNames and Japan Post data loaded by an idempotent seed (only needed columns, index (country, postcode)). No Neon (owner rule).

## Alternatives considered
Object storage (S3/R2): added when files exceed 10 MB or 1 GB total; SQLite (no concurrent workers); Neon (owner rule).

## Consequences
Cost to reverse: Medium: an artefact store adapter isolates `bytea` access. See [architecture](../architecture.md).
