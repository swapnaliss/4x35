# 0002. Node 24 and TypeScript 6.0.3

- Status: accepted (2026-11-20, Approval 2)

## Context
One runtime for API, worker, web build, MCP server and Kiro power.

## Decision
Node 24 LTS, TypeScript 6.0.3, ESM only, `strict`. TypeScript 7.x is rejected because drizzle-kit 0.31.11 declares a peer range `<6.1.0`.

## Alternatives considered
TypeScript 7.0.2 (breaks drizzle-kit); a Python service (second runtime, no library needs it since libpostal was rejected in ADR 0007).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
