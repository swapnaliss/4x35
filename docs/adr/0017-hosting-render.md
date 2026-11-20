# 0017. Render, Frankfurt

- Status: accepted (2026-11-20, Approval 2)

## Context
R4, R9; EU residency for GDPR; the Render CLI is already logged in.

## Decision
Render Frankfurt: web 1 CPU / 2 GB ($25/mo) + Postgres basic ($6/mo) + storage ≈ $32/mo, ≈ $78 to 29 Jan 2027 (approved). The container is platform-neutral, so Railway or AWS remain options. The 20,000-row target is load-tested in M0-09 and M3-08.

## Alternatives considered
512 MB instance ($7; fails the 20k-row target risk); Fly (Postgres $38); Lightsail self-managed; Vercel/Neon (owner rule).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
