# 0005. REST JSON API with generated OpenAPI

- Status: accepted (2026-11-20, Approval 2)

## Context
The web app, MCP server and Crew app need one typed contract; the Crew app needs plain HTTP.

## Decision
Hono + `@hono/zod-openapi`; zod schemas shared with the web app; `Idempotency-Key` on POSTs (stored 24 h); cursor pagination; RFC 9457 problem+json errors; rate limits per user and per token.

## Alternatives considered
GraphQL (no need for client-shaped queries); tRPC (no OpenAPI for the Crew app and external callers).

## Consequences
Cost to reverse: Medium. See [architecture](../architecture.md).
