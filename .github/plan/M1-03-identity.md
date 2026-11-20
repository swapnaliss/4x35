---
title: "M1-03 · Identity: invite-only, argon2, sessions, CSRF, roles, workspace-scoped repos, authZ matrix test"
milestone: "M1 · Walking Skeleton"
labels: ["backend", "security", "critical"]
blocked_by: ["M1-02"]
estimate: "8h"
resources: ["LOCK"]
needs: []
---

## Context
R8 and ADR 0013: addresses are personal data, so accounts are invite-only, passwords are argon2id,
sessions are server-side with CSRF on mutations, roles are enforced on the server and every query
is scoped to a workspace. The architecture's information-disclosure control is the authZ matrix
test on every endpoint, which later tickets extend. Judges reach the app through this (sandbox
workspaces in M3-09).

## Scope
1. Write the Kiro spec `.kiro/specs/identity/{requirements.md,design.md,tasks.md}` in Kiro with EARS
   requirements for invite, login, logout, session expiry, CSRF, roles and workspace scoping, and
   named properties `P-cross-workspace-denied` and `P-csrf-required`. Log it in `docs/kiro-usage.md`.
2. Workspace-scoped repository layer `packages/db/src/repo/`: `forWorkspace(ctx)` returns
   repositories whose every query filters by `ctx.workspaceId`; there is no unscoped export except
   the identity lookups login needs (`users`, `sessions`, `invites` by token hash). A test fails if
   any file outside `packages/db/src/repo/` imports the Drizzle tables.
3. Passwords with `@node-rs/argon2` (argon2id, library defaults or stronger), minimum length 12,
   rejected if it equals the email. LOCK: this ticket adds `@node-rs/argon2` and the Hono packages
   to `apps/server`.
4. Sessions: random 32-byte id, only its SHA-256 (keyed with `SESSION_SECRET`) stored; cookie
   `__Host-4x35_session`, httpOnly, Secure (except `NODE_ENV=development`), SameSite=Lax, 12 h idle
   expiry, 7 d absolute; logout deletes the row.
5. CSRF: per-session secret; token = HMAC(`CSRF_SECRET`, session secret); required in
   `X-CSRF-Token` on every non-GET request authenticated by session; served by `GET /api/v1/me`.
6. Endpoints with `@hono/zod-openapi` under `/api/v1`: `POST /auth/login`, `POST /auth/logout`,
   `GET /me` (user, memberships, CSRF token), `POST /workspaces/{id}/invites` (owner),
   `POST /invites/accept` (token + password), `POST /workspaces/{id}/members/{userId}/reset-link`
   (owner; one-time link, 1 h expiry), `POST /password-reset` (token + new password),
   `PATCH /workspaces/{id}/members/{userId}` (owner; role). Invite and reset tokens are stored hashed,
   single use, 72 h / 1 h expiry. Login returns the same error for unknown email and wrong password.
7. Middleware: `requireSession`, `requireRole('owner'|'reviewer')`, `workspaceContext` (from the
   path, checked against memberships; a workspace the user is not a member of returns 404).
   RFC 9457 problem+json for every auth error.
8. `npm run bootstrap:admin -w apps/server`: idempotently creates the first workspace and an owner
   invite for `BOOTSTRAP_ADMIN_EMAIL`, printing the one-time invite URL to stdout once (never to logs).
9. AuthZ matrix test `apps/server/test/authz-matrix.int.test.ts`: enumerates every route from the
   OpenAPI registry; each route must be classified in `apps/server/src/authz/matrix.ts`
   (`public | session | owner | reviewer`, workspace-scoped or not). For each route it runs:
   anonymous, member of another workspace, reviewer, owner; and for workspace routes, IDs belonging
   to another workspace in path, query and body arrays. An unclassified route fails the test.

## Out of scope
- API tokens and token scopes (M3-01). Four-eyes enforcement (M2-17). Rate limits on login (M1-08).
- Audit events for identity actions (M1-08 adds them). Sign-in and accept-invite screens (M1-07).
- Email delivery of any kind (no provider; links are handed over by the owner).

## Acceptance Criteria
1. `npm run test:integration -w apps/server` passes, including the authZ matrix test with every
   registered route classified and every forbidden cell returning 401, 403 or 404 (never 200).
2. `P-cross-workspace-denied`: a fast-check property creates two workspaces and random resource IDs
   and shows no repository call made with workspace A's context ever returns a row of workspace B.
3. `P-csrf-required`: every non-GET session route returns 403 without a valid `X-CSRF-Token` and
   succeeds with one.
4. An invite token works once; a second accept returns 410; an expired invite returns 410. A reset
   link works once and invalidates all existing sessions of that user.
5. The `sessions` and `invites` tables hold only hashes: an integration test asserts the raw cookie
   value and raw invite token appear nowhere in the database.
6. Login with a wrong password and with an unknown email return identical status and body.
7. `npm run bootstrap:admin` run twice creates one workspace and one pending invite.
8. The test that bans Drizzle table imports outside `packages/db/src/repo/` passes.
9. `.kiro/specs/identity/` exists and `docs/kiro-usage.md` has an entry for this ticket.

## Deliverables
- `.kiro/specs/identity/requirements.md`, `design.md`, `tasks.md`
- `packages/db/src/repo/*.ts`, `packages/db/test/repo-scope.int.test.ts`, `packages/db/test/no-raw-tables.test.ts`
- `apps/server/src/identity/{passwords,sessions,csrf,invites,routes}.ts`
- `apps/server/src/middleware/{session,role,workspace,problem}.ts`
- `apps/server/src/authz/matrix.ts`, `apps/server/test/authz-matrix.int.test.ts`,
  `apps/server/test/identity.int.test.ts`
- `apps/server/scripts/bootstrap-admin.ts`; `docs/kiro-usage.md` entry

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
make down && make up && npm run db:migrate
npm run test:integration -w packages/db
npm run test:integration -w apps/server -- --reporter=verbose | tee "$TMPDIR/m1-03-int.log"
grep -q "P-cross-workspace-denied" "$TMPDIR/m1-03-int.log"
grep -q "P-csrf-required" "$TMPDIR/m1-03-int.log"
grep -q "authz matrix" "$TMPDIR/m1-03-int.log"
npm run bootstrap:admin -w apps/server > "$TMPDIR/m1-03-boot1.txt"
npm run bootstrap:admin -w apps/server > "$TMPDIR/m1-03-boot2.txt"
test -f .kiro/specs/identity/requirements.md && grep -q "M1-03" docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff
- Every later route registers in `apps/server/src/authz/matrix.ts`; the matrix test fails otherwise.
- M1-07 builds the sign-in and accept-invite screens on these endpoints and uses `forWorkspace`.
- M1-08 adds login rate limits and audit events for login, logout, invite, reset and role change.
- M3-01 adds API tokens as a second actor kind through the same middleware; M3-09 uses
  `bootstrap:admin` patterns for judge sandboxes.
