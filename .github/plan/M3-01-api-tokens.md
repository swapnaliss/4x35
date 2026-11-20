---
title: "M3-01 · API tokens + published OpenAPI contract"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["backend", "security", "frontend"]
blocked_by: ["M2-GATE"]
estimate: "4h"
resources: ["SCHEMA"]
needs: ["P-03", "P-11", "P-12", "P-28", "P-30"]
---

## Context
The Crew app (M3-04) and any external caller reach 4x35 over plain HTTP with a scoped workspace
token, not a browser session (ADR 0005, ADR 0013, ADR 0019). Tokens are part of the Identity module
(architecture §2: ApiToken hashed, prefix `4x35_`, scopes, expiry, revocation) and of the STRIDE
controls (spoofing, elevation of privilege, secrets: architecture §8). The OpenAPI document generated
by `@hono/zod-openapi` is the one typed contract for the web app, the MCP server (M3-02) and the Crew
app. Rubric: Technological Implementation (developer surfaces, P6); requirement R8.

## Scope
1. Write or update the Kiro spec `.kiro/specs/api-tokens/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro and log the session in `docs/kiro-usage.md`. Name these properties in the spec:
   **P-TOK-1** the plaintext token is never stored or logged (only its hash and 8-character prefix);
   **P-TOK-2** for every endpoint and every scope set, a request is allowed only if the endpoint's
   required scope is in the token's scopes; **P-TOK-3** any field value written through a token
   carries provenance `external` and is never auto-approvable.
2. Token issue, list and revoke for workspace owners: `POST/GET/DELETE /api/v1/workspaces/{id}/tokens`
   in `apps/server/src/identity/tokens.ts`. Format `4x35_` + 32 bytes base62; stored as SHA-256 hash
   in `api_tokens`; shown once at creation. Scopes (closed list, zod enum in `packages/core`):
   `batches:upload`, `batches:read_summary`, `records:read`, `records:edit`. Expiry required
   (max 90 days, default 30); revocation immediate.
3. Bearer-token authentication middleware (`Authorization: Bearer 4x35_…`) beside session auth, with
   `actor_kind = token` on audit events and decisions; per-token rate limit (ADR 0005); token
   requests skip CSRF (no cookie) and are rejected if they also carry a session cookie.
4. Extend the authZ matrix test (from M1-03) with a token column: every endpoint × every scope set,
   including bulk ID arrays from another workspace.
5. Serve the generated OpenAPI 3.1 document at `GET /api/v1/openapi.json` and commit a snapshot
   `apps/server/openapi.snapshot.json`; a contract test fails when the live document drifts from the
   snapshot without the snapshot being updated.
6. A minimal **API tokens** settings screen in `apps/web/src/routes/settings/tokens.tsx`
   (create with scopes and expiry, copy-once dialog, list, revoke), built to `docs/design/`.
7. Migration only if `api_tokens` from M1-02 lacks a column this ticket needs (for example
   `last_used_at`). SCHEMA is claimed because such a migration changes the migration sequence.

## Out of scope
- OAuth, token exchange, per-user personal tokens (tokens belong to a workspace)
- Approving records through a token: `records:edit` writes `external` values that a UI reviewer must
  approve (ADR 0008); there is no `records:approve` scope
- The Crew app itself (M3-04) and the MCP server (M3-02)

## Acceptance Criteria
1. Creating a token returns the plaintext once; the `api_tokens` row holds only the hash and prefix,
   and a grep of test logs for the plaintext finds nothing (P-TOK-1 property test passes).
2. P-TOK-2 property test (fast-check over endpoints × scope subsets) passes; the authZ matrix test
   covers every route in the OpenAPI document with a token column, and fails if a route is missing.
3. An expired or revoked token gets 401 problem+json within one request of revocation (integration
   test on real Postgres).
4. A `records:edit` write through a token produces a field with provenance `external`; the record goes
   to `needs_review`, never `auto_approvable` (P-TOK-3 test).
5. `GET /api/v1/openapi.json` declares `openapi: 3.1.x`, every operation has an operationId and a
   problem+json error response, and it matches `apps/server/openapi.snapshot.json`;
   the contract test fails on an intentional drift (shown in the PR by a reverted commit or test case).
6. Token creation, use (first use per day) and revocation write audit events with `actor_kind`.
7. A request with a token string in a query parameter or body is rejected and the value is not logged.
8. The settings screen has empty (no tokens), loading and error states; every string is an i18n key;
   create/copy/revoke work by keyboard alone; axe reports no WCAG 2.2 AA violations; `ui-reviewer`
   returns PASS.
9. A `4x35_` token pattern is added to `scripts/check-no-secrets.sh` and to the gitleaks config, and
   gitleaks flags a planted token in a temp file outside the repo (the prefix is scanner detectable).

## Deliverables
- `.kiro/specs/api-tokens/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `apps/server/src/identity/tokens.ts`, `apps/server/src/identity/token-auth.ts`
- `packages/core/src/identity/scopes.ts`
- `apps/server/openapi.snapshot.json`, `apps/server/test/openapi.contract.test.ts`
- `apps/server/test/tokens.int.test.ts`, `apps/server/test/tokens.property.test.ts`, authZ matrix update
- `apps/web/src/routes/settings/tokens.tsx` + i18n keys in `apps/web/src/i18n/en.json`
- `scripts/check-no-secrets.sh` and `.gitleaks.toml`: the `4x35_[A-Za-z0-9]{32}` pattern
- `drizzle/<n>_api_tokens_*.sql` only if a column was missing

## Validation Gate
```bash
set -euo pipefail
npm run typecheck && npm run lint
npm run test -w packages/core -- scopes
npm run test -w apps/server -- tokens openapi authz
npm run test:integration -- tokens
# needs the local stack (make up) and the server running (npm run dev -w apps/server)
curl -fsS "http://localhost:${PORT:-3000}/api/v1/openapi.json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const d=JSON.parse(s);if(!String(d.openapi).startsWith("3.1"))process.exit(1);console.log(Object.keys(d.paths).length,"paths")})'
mkdir -p "$TMPDIR/planted" && printf 'x=4x35_%s\n' "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)" > "$TMPDIR/planted/t.txt"
if gitleaks detect --no-git --source "$TMPDIR/planted" --config .gitleaks.toml --no-banner; then echo "gitleaks missed the token"; exit 1; fi
rm -rf "$TMPDIR/planted"
./scripts/landing-checks.sh
```

## Handoff
- **M3-02 (MCP server)**: reuses the zod schemas behind `openapi.snapshot.json` for tool input/output
  types; record the schema module paths.
- **M3-04 (Crew app)**: needs the base path, the bearer format, the scopes it must request
  (`batches:upload`, `batches:read_summary`), the upload and summary endpoint shapes, and rate limits.
- **M3-08 (load test)** and **M3-GATE**: the authZ matrix command and the token creation steps.
