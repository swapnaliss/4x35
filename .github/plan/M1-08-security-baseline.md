---
title: "M1-08 · Security baseline: upload hardening, rate limits, audit log, formula escaping"
milestone: "M1 · Walking Skeleton"
labels: ["backend", "security"]
blocked_by: ["M1-07"]
estimate: "6h"
resources: ["SCHEMA"]
needs: []
---

## Context
R8 and `docs/architecture.md` §8 (STRIDE): denial of service (size and row limits, zip checks,
parsing in worker threads with `resourceLimits` and a timeout, rate limits, per-workspace quotas),
file attacks (`<!DOCTYPE` rejection, XLSX book type only, formula escaping of new values),
repudiation (append-only audit events with actor and actor kind). The thin slice (M1-07) is the
first public attack surface on production; this ticket closes it before M2 adds more formats.

## Scope
1. Write the Kiro spec `.kiro/specs/security-baseline/{requirements.md,design.md,tasks.md}` in Kiro
   with EARS requirements and named properties `P-escape-cell-safe`, `P-audit-hash-stable`,
   `P-rate-limit-bound`. Log it in `docs/kiro-usage.md`.
2. Upload guard `packages/core/src/ingest/guard.ts` (pure, on bytes) used by every upload route:
   size ≤ 10 MB (413 before the body is fully read, via a streaming limit in the route); format
   sniffed from content, not the file name (CSV/UTF-8 text, ZIP magic for XLSX, `<?xml`/`<Document`
   for pain.001, `{1:` for MT101) and must match the declared kind; any `<!DOCTYPE` or `<!ENTITY`
   in an XML upload is rejected; for ZIP: central directory entry count ≤ 1,000, total uncompressed
   ≤ 100 MB, ratio ≤ 100:1, no entry path with `..` or absolute paths. Formats M2 has not built yet
   are rejected with a clear "not supported yet" problem, but their guard checks exist and are tested.
3. Row limit: more than 20,000 data rows fails the batch with a reason.
4. Parsing moves into `worker_threads` with `resourceLimits` (max old generation 512 MB) and a 60 s
   timeout (values from the M0-09 spike); a timed-out or crashed parse fails the batch with a
   reason and does not crash the process.
5. Rate limits backed by Postgres (works with more than one web instance): a new table
   `rate_limit_buckets (key, window_start, count)` as the next migration (SCHEMA: this ticket adds a
   migration). Limits: login 5/min per (IP, email) and 20/h per IP; upload 10/min per user;
   authenticated API 300/min per user. Exceeding returns 429 problem+json with `Retry-After`.
   Per-workspace quota: rows uploaded per day from `workspaces.settings.quotas` (default 100,000).
6. Audit: `recordAudit(tx, {actor, actorKind, action, subject, data})` in the same transaction as the
   action, storing `data_hash` = SHA-256 of canonical JSON (keys sorted), never the data itself.
   Wired into login (success and failure, email hashed), logout, invite create/accept, reset-link
   issue/use, role change, upload, export create and download.
7. Owner-only route `GET /api/v1/workspaces/{id}/admin/dead-letters` over `listDeadLetters` (M1-05),
   scoped to the workspace's batches, in the authZ matrix.
8. Formula escaping: `escapeCell` (M1-07) becomes the single function every CSV/XLSX writer uses
   for new values; a lint-style test fails if an export writer builds a cell without it.
9. Security headers on every response: `Content-Security-Policy` (self only, no inline script),
   `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Strict-Transport-Security`
   in production, `Content-Disposition: attachment` on downloads.

## Out of scope
- XLSX, pain.001 and MT101 parsing themselves (M2-02, M2-03, M2-04); XSD validation (M2-03).
- API token rate limits and scopes (M3-01). Privacy notice (M3-12). Retention purge (M2-23).

## Acceptance Criteria
1. `npm run test -w packages/core -- guard escape` passes, including crafted fixtures generated in
   the test: an 11 MB file (rejected), a ZIP bomb (ratio > 100:1, rejected), a ZIP with 1,001
   entries (rejected), a ZIP entry `../x` (rejected), XML with `<!DOCTYPE` and with `<!ENTITY`
   (rejected), a `.csv` name with XLSX bytes (rejected).
2. `P-escape-cell-safe` (fast-check, ≥ 1,000 runs): no escaped cell begins with `=`, `+`, `-`, `@`,
   tab or CR, and unescaping returns the original value.
3. Integration: a 20,001-row CSV fails the batch with reason `rows.limit`; a parse that exceeds the
   worker timeout fails the batch and the server keeps answering `/healthz`.
4. `P-rate-limit-bound`: for random request sequences, no (key, window) admits more than its limit;
   the sixth login attempt in a minute returns 429 with `Retry-After`.
5. Each audited action writes exactly one `audit_events` row in its transaction (a rolled-back
   action writes none); `P-audit-hash-stable`: the same data with keys in any order hashes the same;
   no audit row contains an address, file name or email in clear text.
6. `GET .../admin/dead-letters` returns 200 for an owner, 403 for a reviewer, 404 for another
   workspace; the authZ matrix test passes.
7. Response headers above are present on `/`, an API route and a download (integration test).
8. The migration applies cleanly after M1-02's chain and `drizzle-kit check` shows no drift.
9. `.kiro/specs/security-baseline/` exists and `docs/kiro-usage.md` has an entry.

## Deliverables
- `.kiro/specs/security-baseline/{requirements,design,tasks}.md`; `docs/kiro-usage.md` entry
- `packages/core/src/ingest/guard.ts`, `packages/core/test/guard.test.ts`, `packages/core/test/escape-cell.property.test.ts`
- `apps/server/src/ingest/parse-worker.ts`, `apps/server/src/security/{rate-limit,headers,quota}.ts`,
  `apps/server/src/audit/record.ts`, `apps/server/src/admin/dead-letters.routes.ts`
- `packages/db/src/schema/ops.ts` (rate-limit table), `packages/db/drizzle/0001_*.sql`
- `apps/server/test/{limits,rate-limit,audit,headers}.int.test.ts`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
make down && make up && npm run db:migrate && npm run db:seed
npx drizzle-kit check --config packages/db/drizzle.config.ts
npm run test -w packages/core -- --reporter=verbose guard escape | tee "$TMPDIR/m1-08-unit.log"
npm run test:integration -w apps/server -- --reporter=verbose limits rate-limit audit headers authz | tee "$TMPDIR/m1-08-int.log"
for p in P-escape-cell-safe P-audit-hash-stable P-rate-limit-bound; do
  cat "$TMPDIR/m1-08-unit.log" "$TMPDIR/m1-08-int.log" | grep -q "$p" || { echo "missing $p"; exit 1; }
done
npx playwright test -c apps/web/playwright.config.ts thin-slice --output "$TMPDIR/m1-08-slice"
test -f .kiro/specs/security-baseline/requirements.md && grep -q "M1-08" docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff
- M2-01 to M2-04 call `guard.ts` first and parse inside `parse-worker.ts`; they add format parsing,
  not new limits.
- Every later mutating action calls `recordAudit` in its transaction (decisions, links, pre-flight,
  token use); every writer of new cells uses `escapeCell`.
- M3-01 adds per-token limits on the same `rate_limit_buckets` table.
