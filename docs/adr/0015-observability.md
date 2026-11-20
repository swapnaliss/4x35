# 0015. Logs and job timings, no tracing stack yet

- Status: accepted (2026-11-20, Approval 2)

## Context
One service; nothing would read traces.

## Decision
pino JSON logs with request and job correlation IDs and no file content; per-job timings and outcomes in `job_timings`; dead-letter view in admin; Render health check; a daily synthetic run of the core flow.

## Alternatives considered
OpenTelemetry SDK and a RED metrics endpoint (added when there is a second service or an external APM); a SaaS APM (cost).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
