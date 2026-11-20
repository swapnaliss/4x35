# 0023. 30-day retention and purge

- Status: accepted (2026-11-20, Approval 2)

## Context
R5 data minimisation.

## Decision
A daily job purges uploads and derived records 30 days after upload, cascading to proposals, decisions, links, pre-flight runs and exports; audit events keep only hashes. Locked batches and judge sandboxes (until 29 Jan 2027) are skipped. Backups are mentioned in the privacy notice.

## Alternatives considered
Keeping data indefinitely; deleting audit events (breaks accountability).

## Consequences
Cost to reverse: Low. See [architecture](../architecture.md).
