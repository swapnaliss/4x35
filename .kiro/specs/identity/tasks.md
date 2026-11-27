# Implementation Plan: Identity

## Overview

Ticket M1-03 (ADR 0013) in TypeScript, as the design uses TypeScript. The code is built. Work ran in this order: migration 0003 and the repository layer, then passwords, sessions and CSRF, then invites and resets, then the `session` and `authorize` middleware, then routes, then the AuthZ matrix and the two property tests, then the bootstrap logic, then the usage log and a final checkpoint.

Checked state: `npx tsc -b apps/server/test packages/db/test` exits 0. `packages/db` `no-raw-tables.test.ts` passed 3 tests and `repo-scope.int.test.ts` passed 4 tests. `apps/server` `identity.int.test.ts` and `authz-matrix.int.test.ts` passed 32 tests. A task is `[x]` only when a passing test exercises it. Checks that the design lists under "Not covered by a test in this ticket" are separate open sub-tasks (3.8, 3.9, 4.3, 5.5, 6.3, 9.3) or stay open inside the task named in the note.

Migration 0003 and `packages/db/src/schema/*` are hot files. Only this ticket touches them while it runs.

Both property tests use domain arbitraries only. P1 runs `NUM_RUNS` (at least 200, the ticket's number) and P2 runs `P2_RUNS` (at least 100, the workflow minimum, as the ticket names none). Each property task records a planted bug, its counterexample and its seed.

There are no separate test files for passwords, sessions, CSRF, invites, middleware or bootstrap. Their tests live in `apps/server/test/identity.int.test.ts` and `apps/server/test/authz-matrix.int.test.ts`.

## Tasks

- [x] 1. Migration 0003 and workspace-scoped repository layer (M1-03)
  - [x] 1.1 Generate migration `drizzle/0003_password_resets.sql` for `password_resets` (M1-03)
    - Generated with `drizzle-kit generate` from the declaration in `packages/db/src/schema/identity.ts`
    - SQL matches the design: unique `token_hash`, cascades to `users` and `workspaces`, indexes on `user_id` and `workspace_id`
    - `0001` and `0002` are not edited
    - _Requirements: R7.1, R7.2_

  - [x] 1.2 Implement `forWorkspace(ctx, db)` and its repositories in `packages/db/src/repo/workspace.ts` (M1-03)
    - Direct-column repositories filter every select, update and delete by `ctx.workspaceId`, and inserts write `ctx.workspaceId` after the caller's values
    - Child repositories join to `batches` (through `records` for `proposals` and `decisions`) and filter by `batches.workspace_id`
    - A child insert whose parent (batch, record, proposal, payment batch or user) is in another workspace or does not exist throws `OutOfScopeError` and writes nothing
    - `forWorkspace` throws `OutOfScopeError("workspace")` for a malformed workspace id, and a malformed method argument matches nothing
    - No method takes a workspace id argument
    - _Requirements: R1.1_

  - [x] 1.3 Implement `identityRepository`, `systemRepository` and stop exporting the Drizzle schema (M1-03)
    - `identityRepository` in `packages/db/src/repo/identity.ts` has the design's methods: `findUserByEmail`, `getUser`, `ensureUser`, `setPasswordHash`, `membershipsOf`, `createSession`, `findLiveSession`, `touchSession`, `deleteSession`, `deleteUserSessions`, `lockUsableInvite`, `markInviteUsed`, `lockUsableReset`, `markResetUsed`, `firstWorkspace`, `createWorkspace` and `isOwner`
    - `lockUsableInvite` and `lockUsableReset` select the usable row (hash match, `used_at` null, not expired) with `SELECT ... FOR UPDATE`, and `markInviteUsed` and `markResetUsed` set `used_at = now()` in the same transaction
    - `systemRepository(db).jobTimings` has `insert` and `listByJob`, and existing job-timing callers use it
    - `getBatchProgress(tx, workspaceId, batchId)` in `apps/server/src/jobs/progress.ts` looks the batch up through `forWorkspace` and returns `undefined` for a batch outside the workspace
    - `packages/db/src/index.ts` exports `./repo/index.js` and no table, and importers use repository methods and type-only row types
    - _Requirements: R1.2_

  - [x] 1.4 Write the Table_Import_Guard test `packages/db/test/no-raw-tables.test.ts` (M1-03)
    - Three tests: the scanner finds each import form on planted violations, no file outside the explicit allow-list imports the tables, and the public API of `@4x35/db` exports no table and no `schema` name
    - Keep the allow-list from the design and apply the type-only rule to `packages/db/src/mappers/`
    - _Requirements: R1.4_

  - [x] 1.5 Write property test P1 `P-cross-workspace-denied` in `packages/db/test/repo-scope.int.test.ts` (M1-03)
    - **Property 1: Cross-workspace reads are denied (P-cross-workspace-denied)**
    - **Validates: P1**
    - Real Postgres, two workspaces with connected graphs, every `get` and `list` method called with B's ids, A's ids, random UUIDs and malformed ids
    - Domain arbitraries from `packages/db/test/arbitraries.ts` (CJK, Devanagari, Arabic, Cyrillic, Latin with diacritics, NFC and NFD, whitespace runs of 3 or more, tabs, non-breaking spaces, lengths 15/16/17, 34/35/36 and 69/70/71), and `numRuns` is `NUM_RUNS`, at least 200
    - Test name: `P1 P-cross-workspace-denied: no repository call with workspace A's context returns a row of workspace B (200 runs)`
    - Planted bug (test `P1 catches a planted bug: records.get without the workspace filter`): `records.get` without the workspace filter. Counterexample: a `records.get` call with a workspace B record id (`[["records.get","13887234-ba2d-4385-ac22-80113740f98e"]]`). Seed: 3032. The real repository is restored and the property passes at 200 runs
    - _Requirements: R1.1, R1.3_

  - [x] 1.6 Write repository scope example tests in `packages/db/test/repo-scope.int.test.ts` (M1-03)
    - `P1 P-cross-workspace-denied: every write that would attach to workspace B's rows throws OutOfScopeError and writes nothing` (50 runs), covering a child insert that names a foreign parent
    - `positive control: workspace A's own ids are found through A's context`
    - The table-free public API is covered by the Table_Import_Guard (task 1.4)
    - _Requirements: R1.2, R1.3_

- [x] 2. Checkpoint - Ensure all tests pass
  - Tasks 1.1 to 1.6 are `[x]` and their tests passed.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R1.1, R1.2, R1.3, R1.4_

- [ ] 3. Environment, passwords, sessions and CSRF (M1-03)
  - [x] 3.1 Validate identity environment values in `apps/server/src/env.ts` (M1-03)
    - `readEnv` validates `SESSION_SECRET`, `CSRF_SECRET` (each at least 32 characters), `APP_BASE_URL` and `NODE_ENV` with zod, and `authConfig(env)` requires both secrets to differ and returns `secureCookie`, false only for `NODE_ENV=development`
    - A missing, short or equal secret stops start-up and names the variable only
    - Tested: `secureCookie` under development, test and production (`the cookie drops Secure only when NODE_ENV=development`). The failure cases are open in task 3.8
    - _Requirements: R3.2, R3.4, R4.1_

  - [x] 3.2 Implement Password_Service in `apps/server/src/identity/passwords.ts` (M1-03)
    - `hashPassword` and `verifyPassword` with `@node-rs/argon2` argon2id and explicit parameters (m=19456, t=2, p=1), and `verifyPassword` returns false for a malformed hash
    - `checkPassword` rejects fewer than 12 code points and a password equal to the email (case-insensitive, after NFC)
    - `burnVerify` verifies once against a fixed argon2id hash and discards the result
    - _Requirements: R2.1, R2.2, R2.3_

  - [x] 3.3 Write password tests in `apps/server/test/identity.int.test.ts` (M1-03)
    - Test `passwords: argon2id with m=19456 KiB, t=2, p=1; at least 12 characters; never the email`: the `$argon2id$` prefix and parameters, verify true, false and malformed, lengths 11 and 12 (ASCII and CJK), equality with the email in mixed case
    - Length 13 and an NFD email are open in task 3.9
    - _Requirements: R2.1, R2.2, R2.3_

  - [x] 3.4 Implement Session_Service in `apps/server/src/identity/sessions.ts` (M1-03)
    - 32-byte random id, stored as HMAC-SHA256 under `SESSION_SECRET`
    - Cookie `__Host-4x35_session` with httpOnly, SameSite=Lax, `Path=/`, no `Domain`, and Secure unless `NODE_ENV` is `development`
    - Idle deadline of 12 hours slid on each validated request and capped at 7 days from creation, and `validateSession` also checks `createdAt + 7 days` directly, with an injected clock
    - Logout deletes the row, and login deletes the presented session before creating a new one
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8_

  - [x] 3.5 Write session tests in `apps/server/test/identity.int.test.ts` (M1-03)
    - Tests: `login sets __Host-4x35_session (HttpOnly, Secure, SameSite=Lax, Path=/), rotates a presented session, and /me returns the CSRF token`, `the cookie drops Secure only when NODE_ENV=development`, `logout deletes the session row; the old cookie is then anonymous (401)`, and `sessions expire after 12 h idle and 7 d absolute; use slides the idle deadline`
    - The stored hash is the HMAC and no raw id is stored (test `the sessions, invites and password_resets tables hold only hashes`)
    - The 12-hour idle boundary at 1 ms either side is open in task 3.9
    - _Requirements: R3.2, R3.3, R3.4, R3.5, R3.6, R3.7, R3.8_

  - [x] 3.6 Implement Csrf_Guard in `apps/server/src/identity/csrf.ts` (M1-03)
    - `csrfToken` is HMAC-SHA256 of the per-session secret under `CSRF_SECRET`
    - `csrfValid` uses `timingSafeEqual` on equal-length buffers and returns false on a length mismatch or an absent header
    - _Requirements: R4.1_

  - [x] 3.7 Write CSRF token tests in `apps/server/test/identity.int.test.ts` (M1-03)
    - `/me` returns a token that `csrfValid` accepts (in the cookie and `/me` test above)
    - A token of another session, a changed token and a truncated token (length mismatch) are rejected: covered by the P2 header arbitrary in task 7.3
    - _Requirements: R4.1_

  - [ ] 3.8 Write the start-up secret test (M1-03)
    - Add to `apps/server/test/identity.int.test.ts` a test that `readEnv` or `authConfig` throws, naming only the variable, for a missing, short and equal `SESSION_SECRET` and `CSRF_SECRET`
    - Open: no passing test exercises it
    - _Requirements: R3.2, R4.1_

  - [ ] 3.9 Write the remaining boundary tests (M1-03)
    - Add to `apps/server/test/identity.int.test.ts`: a 13-character password is accepted, an email in NFD form equals the password after NFC, and a session expires at 12 hours minus 1 ms (valid) and plus 1 ms (expired) with the injected clock
    - Open: the design lists these under "Not covered by a test in this ticket"
    - _Requirements: R2.2, R2.3, R3.5_

- [ ] 4. Invite_Service and Reset_Service (M1-03)
  - [x] 4.1 Implement `apps/server/src/identity/invites.ts` (M1-03)
    - `newToken` (32 bytes, base64url) and `hashToken` (SHA-256 hex), storing only the hash
    - `issueInvite` with a 72-hour expiry (409 `already_member` for an existing member) and `issueReset` with a 1-hour expiry, the latter only for a member of the owner's workspace
    - `acceptInvite` and `redeemReset` lock the usable token row with `SELECT ... FOR UPDATE` in one transaction, do their work, then set `used_at = now()` through `markInviteUsed` and `markResetUsed`
    - A used, expired or unknown token yields `gone`, which the route maps to 410 for invites and resets
    - A user that already has a password must give that password to accept an invite (`wrong_password` gives 401 and leaves the invite usable), and a weak password gives 422 and leaves the token usable
    - `redeemReset` sets the password and deletes every session of the user
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R7.1, R7.2, R7.3, R7.4, R7.5, R7.6_

  - [x] 4.2 Write invite and reset tests in `apps/server/test/identity.int.test.ts` (M1-03)
    - Tests: `an invite token works once; a second accept is 410; an expired invite is 410` (72-hour expiry, 422 weak password keeps the token, unknown token 410), `an invite for an existing account needs that account's password (no takeover by token)`, `a reset link works once and ends every existing session of that user`, `an expired reset link is 410; a reset link for a non-member is 404`
    - Test `the sessions, invites and password_resets tables hold only hashes` scans every public table and finds no raw token, cookie or session id
    - Concurrent accepts and rollback after the lock are open in task 4.3
    - _Requirements: R3.8, R6.2, R6.3, R6.4, R6.5, R7.2, R7.3, R7.4, R7.5, R7.6_

  - [ ] 4.3 Write the token lock tests (M1-03)
    - Add to `apps/server/test/identity.int.test.ts`: two concurrent accepts of one token produce one winner, two concurrent redeems of one reset token produce one winner, and an error thrown after the lock leaves the token usable
    - Open: no passing test exercises the row lock under a race or a rollback
    - _Requirements: R6.4, R7.5_

- [ ] 5. Session and authorization middleware (M1-03)
  - [x] 5.1 Implement `apps/server/src/middleware/problem.ts` (M1-03)
    - Single RFC 9457 constructor `problem(c, status, detail?)` with `type: "about:blank"`, a title from `PROBLEM_TITLES` and no echo of request content
    - _Requirements: R8.5_

  - [x] 5.2 Implement `session` and `requireSession` in `apps/server/src/middleware/session.ts` (M1-03)
    - `session(deps)` reads the cookie, validates and slides the session, sets `session` and `userId`, and never rejects
    - `requireSession(auth)` answers 401 when no `userId` is set, and answers 403 problem+json for a non-GET (`HEAD` and `OPTIONS` excluded) with no valid `X-CSRF-Token`, before any role or workspace check
    - Only routes classified `session`, `owner` or `reviewer` run `requireSession`, so public routes are not CSRF-checked
    - _Requirements: R3.5, R3.6, R4.3, R8.2, R8.5_

  - [x] 5.3 Implement `workspaceContext` and `requireRole` in `apps/server/src/middleware/workspace.ts` and `role.ts` (M1-03)
    - `workspaceContext` parses `/workspaces/{id}` with a UUID check, looks the session user up with `forWorkspace({ workspaceId }, db).memberships.get(userId)` and sets `workspaceId` and `role`
    - A malformed id, a non-member and an unknown workspace answer the same 404
    - `requireRole('owner')` allows owners only, and `requireRole('reviewer')` allows reviewers and owners (`roleAllows`)
    - _Requirements: R8.2, R8.3, R8.4, R8.5_

  - [x] 5.4 Implement `authorize` in `apps/server/src/authz/enforce.ts` and wire it into `createApp` (M1-03)
    - `authorize(deps, matrix = AUTHZ_MATRIX)` finds the handler route with `matchedRoutes` from `hono/route` (last non-`ALL` match), builds `routeKey(method, path)` and looks it up in the matrix
    - An unclassified route answers 404 problem+json (fail closed), a `public` route goes to the next middleware, and any other route runs `requireSession`, then `workspaceContext` when `workspace` is true, then `requireRole`
    - `createApp` installs `requestLogging`, `session`, `authorize`, the M1-04 idempotency middleware (reading `workspaceId`) and the routes, in this order, when both `db` and `auth` are passed
    - `IDENTITY_IDEMPOTENCY_OPT_OUT` lists `/api/v1/workspaces/{id}/invites` and `/api/v1/workspaces/{id}/members/{userId}/reset-link`, so a response that carries a raw token is never stored under an `Idempotency-Key`
    - Tested by the AuthZ matrix tests (task 7.2), `an authenticated POST with an Idempotency-Key is replayed (auth sets the workspace before idempotency runs)` and the invite opt-out check in `the sessions, invites and password_resets tables hold only hashes`
    - _Requirements: R8.2, R8.3, R8.4, R8.5, R11.1_

  - [ ] 5.5 Write the remaining middleware tests (M1-03)
    - Add to `apps/server/test/identity.int.test.ts` or a new `apps/server/test/middleware.test.ts`: `problemBody` is fixed per status and identical across different request content, and direct unit tests of `roleAllows` and of `workspaceContext` for a malformed id
    - Open: the matrix tests check the status and content type of each cell and the role cells, but no test compares problem bodies
    - _Requirements: R8.2, R8.3, R8.4, R8.5_

- [ ] 6. Identity routes and OpenAPI registration (M1-03)
  - [x] 6.1 Implement `apps/server/src/identity/routes.ts` with `@hono/zod-openapi` under `/api/v1` (M1-03)
    - `POST /auth/login`, `POST /auth/logout`, `GET /me`, `POST /workspaces/{id}/invites`, `POST /invites/accept`, `POST /workspaces/{id}/members/{userId}/reset-link`, `POST /password-reset` and `PATCH /workspaces/{id}/members/{userId}`
    - Login returns the same 401 status and body for an unknown email, a null password hash and a wrong password, and runs `burnVerify` for the first two
    - `GET /me` returns the user, the memberships and the CSRF token
    - Password policy failures answer 422 with a fixed detail, an invite for an existing member answers 409, and a body that fails its zod schema answers a fixed 400
    - `PATCH` refuses to demote the last owner with 409, in the same transaction as the update
    - Register every route with zod request and response schemas
    - _Requirements: R4.2, R5.1, R5.2, R5.3, R5.4, R6.1, R6.3, R6.4, R6.5, R7.1, R7.3, R7.5, R7.6, R8.1, R9.1_

  - [x] 6.2 Write identity route tests in `apps/server/test/identity.int.test.ts` (M1-03)
    - Tests: `AC 6: a wrong password and an unknown email answer the identical status and body`, the login and `/me` test, `logout deletes the session row; the old cookie is then anonymous (401)`, the invite, existing-account and reset tests of task 4.2, and `role change: an owner changes a member's role; the last owner cannot be demoted (409)`
    - _Requirements: R3.7, R4.2, R5.1, R5.2, R5.3, R5.4, R6.1, R6.3, R6.4, R6.5, R7.1, R7.3, R7.4, R7.5, R7.6, R8.1, R9.1_

  - [ ] 6.3 Write the capturing-logger test (M1-03)
    - Add to `apps/server/test/identity.int.test.ts` a test that drives login, an invite, an accept and a reset through the app with a capturing logger, and finds no password, token, cookie or email in any log line
    - Also confirm that no new field joined `LOGGED_FIELDS`
    - Open: no passing test drives the identity routes against a capturing logger
    - _Requirements: R3.8, R6.2, R7.2_

- [x] 7. AuthZ matrix and CSRF property (M1-03)
  - [x] 7.1 Implement `apps/server/src/authz/matrix.ts` (M1-03)
    - Export `AUTHZ_MATRIX` keyed by `"METHOD /api/v1/path/{param}"` with `access` and `workspace` for every identity route, classify the health routes as `public`, and export `routeKey`, `openApiPath`, `classify` and `inconsistentEntries`
    - The matrix is both the table `authorize` enforces and the specification the matrix test checks
    - _Requirements: R11.1_

  - [x] 7.2 Write the AuthZ_Matrix_Test `apps/server/test/authz-matrix.int.test.ts` (M1-03)
    - Test names start with `authz matrix`
    - `authz matrix: every served route is classified, and every entry is a served route` enumerates routes from the OpenAPI document and from Hono's `app.routes`, and `inconsistentEntries()` is empty
    - `authz matrix: an unclassified route is detected by the enumeration and refused at request time (fail closed)`
    - One test per matrix entry runs anonymous, another workspace's owner, a Reviewer and an Owner, with the cookie and a valid CSRF header where the caller has a session, and a forbidden cell must return 401, 403 or 404 with `application/problem+json`, never 200
    - Three `authz matrix · P-cross-workspace-denied` tests send Foreign_Workspace_Ids in the path, in a member id, and in the query and body arrays, and compare snapshots of the other workspace
    - _Requirements: R11.2, R11.3, R11.4, R11.5, R11.6_

  - [x] 7.3 Write property test P2 `P-csrf-required` in `apps/server/test/identity.int.test.ts` (M1-03)
    - **Property 2: CSRF token is required on every non-GET session route (P-csrf-required)**
    - **Validates: P2**
    - Routes come from `AUTHZ_MATRIX` (non-GET routes with access `session`, `owner` or `reviewer`), with a real app, a real database and a logged-in owner
    - Header arbitrary `csrfHeader`: absent, empty, another session's token, the token in upper case, the token plus `=`, the token with one character replaced, and the token with its last character removed
    - An invalid header gives 403 and the valid header gives 2xx, and `numRuns` is `P2_RUNS`, at least 100
    - Test name: `P2 P-csrf-required: every non-GET session route is 403 without a valid X-CSRF-Token and succeeds with one (100 runs)`
    - Planted bug (test `P2 P-csrf-required catches a planted bug: CSRF checked on POST only`): CSRF checked on POST only. Counterexample: the PATCH member route (`["PATCH /api/v1/workspaces/{id}/members/{userId}",0]`). Seed: 4242. The real guard is restored and the property passes at 100 runs
    - _Requirements: R4.3, R4.4_

- [ ] 8. Checkpoint - Ensure all tests pass
  - The tests that exist passed. The checkpoint stays open because tasks 3.8, 3.9, 4.3, 5.5 and 6.3 are open.
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R4.4, R5.1, R8.4, R11.6_

- [ ] 9. Bootstrap_Script (M1-03)
  - [x] 9.1 Implement the bootstrap logic `bootstrapAdmin` in `apps/server/src/identity/bootstrap.ts` (M1-03)
    - In one transaction with `pg_advisory_xact_lock(hashtext('4x35:bootstrap-admin'))`: take the oldest non-sandbox workspace or create `Main workspace`, return `owner_exists` when the owner membership exists, return `pending` when an unused, unexpired owner invite exists, otherwise create a 72-hour owner invite and return `invited` with the URL `<APP_BASE_URL>/invite#token=<token>`
    - _Requirements: R10.1, R10.2, R10.3_

  - [x] 9.2 Write bootstrap logic tests in `apps/server/test/identity.int.test.ts` (M1-03)
    - Tests: `AC 7: bootstrap:admin run twice creates one workspace and one pending owner invite` (one workspace, one invite, the URL matches `https://app.example.test/invite#token=<43 characters>` without the email, accepting the link makes the owner, a third run gives `owner_exists`) and `bootstrap:admin runs concurrently without creating two workspaces`
    - _Requirements: R10.1, R10.3_

  - [ ] 9.3 Implement the script `apps/server/scripts/bootstrap-admin.ts` and test it (M1-03)
    - The script and the `bootstrap:admin` npm script (`tsc -b && node scripts/bootstrap-admin.ts`) validate `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL` and `APP_BASE_URL` with zod and exit 1 naming the variable only
    - For these three keys only, when a key is unset or empty, take it from the repo `.env` (the main checkout's `.env` when run from a worktree)
    - Print the one-time invite URL to stdout once, print the pending and owner-exists messages, write the stderr note when `APP_BASE_URL` is unset, and write no email, token or URL to any log
    - Add `apps/server/test/bootstrap-admin.int.test.ts` that runs the script twice on a fresh database and checks stdout, stderr, exit codes and `.env` loading
    - Open: only `bootstrapAdmin` is tested, not the script (task 9.2)
    - _Requirements: R10.1, R10.2, R10.3_

- [x] 10. Record spec actions in `docs/kiro-usage.md` (M1-03)
  - Add one row per spec action for this ticket (create, refine, run tasks) with the date, ticket M1-03, surface, what ran, Kiro version and credits used, taken from `/usage` before and after
  - Do not estimate credits. Leave a value out only if `/usage` was not read, and say so in the row
  - Open: Claude Code does this task
  - _Requirements: R1.1_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Run `npm test -w packages/db`, `npm run test:integration -w packages/db` and `npm run test:integration -w apps/server -- --reporter=verbose`, and confirm the output names `P-cross-workspace-denied`, `P-csrf-required` and `authz matrix`
  - Open: only the narrow test files have run so far, and tasks 3.8, 3.9, 4.3, 5.5, 6.3, 9.3 and 10 are open
  - Ensure all tests pass, ask the user if questions arise.
  - _Requirements: R1.3, R4.4, R11.6_

## Notes

- Requirements 2, 3 and 5 to 10 are fixed constants, single scenarios or boundaries and use example tests. Only R1.3 and R4.4 carry property tests.
- Test tasks are not marked optional, because the steering requires every property to be shown against a planted bug.
- Single use of invite and reset tokens is a `SELECT ... FOR UPDATE` on the usable row in one transaction, then `used_at = now()`. It is not a conditional `UPDATE`.
- `identity.int.test.ts` holds the password, session, CSRF, invite, reset, role, bootstrap logic, idempotency and P2 tests, and `authz-matrix.int.test.ts` holds the matrix tests. The separate files named in the first plan were not created.
- Tasks 3.8, 3.9, 4.3, 5.5, 6.3 and 9.3 are the checks that the design lists as not covered by a test. They are open and keep the checkpoints 8 and 11 open.
- Migration 0003 and `packages/db/src/schema/*` are hot files. Do not start another ticket on them while this one is open.
- Task 10 changes a docs file only. It exists because the steering logs every spec action.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4", "1.5"] },
    { "id": 4, "tasks": ["1.6"] },
    { "id": 5, "tasks": ["2"] },
    { "id": 6, "tasks": ["3.1"] },
    { "id": 7, "tasks": ["3.2", "3.4", "3.6"] },
    { "id": 8, "tasks": ["3.3"] },
    { "id": 9, "tasks": ["3.5"] },
    { "id": 10, "tasks": ["3.7"] },
    { "id": 11, "tasks": ["3.8"] },
    { "id": 12, "tasks": ["3.9"] },
    { "id": 13, "tasks": ["4.1"] },
    { "id": 14, "tasks": ["4.2"] },
    { "id": 15, "tasks": ["4.3"] },
    { "id": 16, "tasks": ["5.1"] },
    { "id": 17, "tasks": ["5.2", "5.3"] },
    { "id": 18, "tasks": ["5.4"] },
    { "id": 19, "tasks": ["5.5", "6.1"] },
    { "id": 20, "tasks": ["6.2", "7.1"] },
    { "id": 21, "tasks": ["6.3", "7.2"] },
    { "id": 22, "tasks": ["7.3"] },
    { "id": 23, "tasks": ["8"] },
    { "id": 24, "tasks": ["9.1"] },
    { "id": 25, "tasks": ["9.2", "9.3", "10"] },
    { "id": 26, "tasks": ["11"] }
  ]
}
```
