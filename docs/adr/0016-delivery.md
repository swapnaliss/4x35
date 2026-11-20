# 0016. Container, Render blueprint and GitHub Actions

- Status: accepted (2026-11-20, Approval 2)

## Context
Hackathon rule: testable until 29 Jan 2027; R10 feedback loops.

## Decision
Multi-stage Docker image; `render.yaml` blueprint (one service `MODE=all` + Postgres); migrations on deploy; one idempotent `scripts/setup.sh`; `make up/down` with docker compose (`postgres:17-alpine`). GitHub Actions: biome, tsc, vitest (unit, property, eval on fixtures), integration tests on a Postgres service container, Playwright e2e on the core flow (main), gitleaks, npm cache. Deploy from main.

## Alternatives considered
Terraform or Pulumi (one service and one database).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
