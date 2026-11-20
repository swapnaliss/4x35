# 0001. Modular monolith

- Status: accepted (2026-11-20, Approval 2)

## Context
R3 load is small and the domain needs no I/O. One deployable keeps the 13-day build and ops simple.

## Decision
npm workspaces: `packages/core` (pure domain, rules, structuring, provenance), `packages/rulepacks` (data), `packages/formats` (pure CSV/XLSX/pain.001/MT101 readers and writers, no DB, shared by the server and the MCP server), `packages/db`, `packages/llm` (adapter), `apps/server` (Hono API + worker mode), `apps/web` (React SPA), `apps/mcp` (MCP server), `integrations/kiro-power`. The Crew app lives in its own repo (ADR 0019). Modules talk through core interfaces and events; no module reads another's tables.

## Alternatives considered
Microservices (no load or team reason); Next.js full-stack (SSR adds nothing to an authenticated tool).

## Consequences
Cost to reverse: Medium: the module boundaries make a later split mechanical. See [architecture](../architecture.md).
