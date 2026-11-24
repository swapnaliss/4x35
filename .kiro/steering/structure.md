---
inclusion: always
---

# Repository structure

4x35 is a modular monolith on npm workspaces (ADR 0001).

## Directories that exist today
- `packages/core`: pure domain, rules, structuring, provenance.
- `packages/rulepacks`: rule packs as data.
- `packages/db`: database access.
- `packages/llm`: LLM adapter.
- `apps/server`: Hono API and worker mode.
- `apps/web`: React SPA.
- `apps/mcp`: MCP server.
- `integrations/kiro-power`: Kiro power.

## Modules that do not exist yet
- `packages/formats`: pure CSV/XLSX/pain.001/MT101 readers and writers, no DB, shared by the server and the MCP server (first created by M2-01).
- `packages/synth`: the synthetic data generator, private and not shipped in the image (M2-24).
- Later tickets create them. Do not create them outside a ticket.
- The Crew app lives in its own repo (ADR 0019).

## Boundaries
- `packages/core` is pure. No I/O. No framework, SDK or DB imports.
- Vendors sit behind adapters.
- Modules talk through core interfaces and events. Never read another module's tables.
- Every query on workspace data goes through the workspace-scoped repository layer.
- GeoNames, Japan Post and chromium-i18n use a separate read-only dataset repository.

## Hot files
Coordinate. One ticket at a time.
- `packages/db/src/schema/*`
- `drizzle/` migrations
- `packages/core/src/provenance.ts`
- `packages/rulepacks/schema.ts`
- `render.yaml`
- `.github/workflows/*`
- `package-lock.json`

## Where things live
- Specs: `.kiro/specs/<capability>/`.
- Steering: `.kiro/steering/`.
- Plan tickets: `.github/plan/` (IDs are permanent).
- ADRs: `docs/adr/`.
- Design: `docs/architecture.md`, `docs/design/`.
- Kiro usage log: `docs/kiro-usage.md`.

## Kiro folder
- `/.kiro` stays at the repo root and tracked.
- Never gitignore it. That disqualifies the entry.

Sources: [ADR 0001](../../docs/adr/0001-modular-monolith.md), [CLAUDE.md](../../CLAUDE.md), [WORKFLOW.md](../../WORKFLOW.md)
