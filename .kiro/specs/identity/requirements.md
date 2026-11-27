# Requirements Document

## Introduction

Ticket M1-03 (ADR 0013) gives 4x35 its identity layer. Addresses are personal data, so accounts are invite-only, passwords are hashed with argon2id, sessions live on the server, mutations carry a CSRF token, roles are enforced on the server and every query on workspace data is scoped to a workspace. An authZ matrix test over every route is the control against information disclosure. Later tickets extend the matrix.

Out of scope: API tokens and token scopes (M3-01), four-eyes enforcement (M2-17), login rate limits (M1-08), audit events for identity actions (M1-08), sign-in and accept-invite screens (M1-07), and email delivery of any kind.

## Glossary

- **Identity_Module**: the M1-03 deliverables as a whole: Scoped_Repository_Layer, Password_Service, Session_Service, Csrf_Guard, Invite_Service, Reset_Service, Identity_Routes, Auth_Middleware, AuthZ_Matrix and Bootstrap_Script.
- **Scoped_Repository_Layer**: the code in `packages/db/src/repo/`, whose `forWorkspace(ctx)` returns repositories filtered by `ctx.workspaceId`.
- **Workspace_Context**: the object `ctx` that carries the `workspaceId` passed to `forWorkspace`.
- **Identity_Lookups**: the only unscoped repository functions, for `users`, `sessions` and `invites` by token hash, needed by login.
- **Table_Import_Guard**: the test that fails when a file outside `packages/db/src/repo/` imports the Drizzle tables.
- **Password_Service**: the code in `apps/server/src/identity/passwords.ts` that hashes and verifies passwords with `@node-rs/argon2`.
- **Session_Service**: the code in `apps/server/src/identity/sessions.ts` that creates, validates and deletes sessions.
- **Session_Cookie**: the cookie `__Host-4x35_session`.
- **Session_Secret**: the environment value `SESSION_SECRET`.
- **Csrf_Guard**: the code in `apps/server/src/identity/csrf.ts` that issues and checks CSRF tokens.
- **Csrf_Secret**: the environment value `CSRF_SECRET`.
- **Csrf_Token**: HMAC of the per-session secret under the Csrf_Secret, carried in the `X-CSRF-Token` header.
- **Invite_Service**: the code in `apps/server/src/identity/invites.ts` that issues and accepts invites.
- **Reset_Service**: the code in `apps/server/src/identity/invites.ts` that issues and redeems reset links.
- **Identity_Routes**: the routes under `/api/v1` registered with `@hono/zod-openapi`: `POST /auth/login`, `POST /auth/logout`, `GET /me`, `POST /workspaces/{id}/invites`, `POST /invites/accept`, `POST /workspaces/{id}/members/{userId}/reset-link`, `POST /password-reset` and `PATCH /workspaces/{id}/members/{userId}`.
- **Auth_Middleware**: the middleware `requireSession`, `requireRole('owner'|'reviewer')` and `workspaceContext` in `apps/server/src/middleware/`.
- **Problem_Response**: an RFC 9457 `application/problem+json` response.
- **Owner**: a member whose membership role is `owner`.
- **Reviewer**: a member whose membership role is `reviewer`.
- **AuthZ_Matrix**: the classification in `apps/server/src/authz/matrix.ts` of each route as `public`, `session`, `owner` or `reviewer`, and as workspace-scoped or not.
- **AuthZ_Matrix_Test**: the test `apps/server/test/authz-matrix.int.test.ts`.
- **Bootstrap_Script**: the command `npm run bootstrap:admin -w apps/server`.
- **Bootstrap_Admin_Email**: the environment value `BOOTSTRAP_ADMIN_EMAIL`.
- **Foreign_Workspace_Id**: an ID that belongs to a workspace other than the one the caller is acting in.

## Requirements

### Requirement 1: Workspace-scoped repositories

**User Story:** As a security reviewer, I want every query on workspace data filtered by the caller's workspace, so that one workspace can never read another workspace's rows.

#### Acceptance Criteria

1. WHEN `forWorkspace(ctx)` is called, THE Scoped_Repository_Layer SHALL return repositories whose every query filters by `ctx.workspaceId`.
2. THE Scoped_Repository_Layer SHALL export no unscoped repository other than the Identity_Lookups.
3. FOR ALL pairs of workspaces A and B and all resource IDs, THE Scoped_Repository_Layer SHALL return no row of workspace B from any repository call made with the Workspace_Context of workspace A (`P-cross-workspace-denied`).
4. IF a file outside `packages/db/src/repo/` imports the Drizzle tables, THEN THE Table_Import_Guard SHALL fail.

### Requirement 2: Password rules

**User Story:** As an account holder, I want my password hashed and checked against basic rules, so that a database leak does not expose it.

#### Acceptance Criteria

1. THE Password_Service SHALL hash passwords with argon2id using `@node-rs/argon2` with library defaults or stronger parameters.
2. IF a password is shorter than 12 characters, THEN THE Password_Service SHALL reject the password.
3. IF a password equals the account email, THEN THE Password_Service SHALL reject the password.

### Requirement 3: Server-side sessions

**User Story:** As an account holder, I want sessions that expire and can be ended, so that a stolen or abandoned session stops working.

#### Acceptance Criteria

1. WHEN a session is created, THE Session_Service SHALL generate a random session ID of 32 bytes.
2. THE Session_Service SHALL store only the SHA-256 of the session ID, keyed with the Session_Secret.
3. THE Session_Service SHALL set the Session_Cookie with the attributes httpOnly and SameSite=Lax.
4. WHILE `NODE_ENV` is not `development`, THE Session_Service SHALL set the Secure attribute on the Session_Cookie.
5. IF a session has been idle for more than 12 hours, THEN THE Session_Service SHALL treat the session as expired.
6. IF a session is more than 7 days old, THEN THE Session_Service SHALL treat the session as expired.
7. WHEN a user logs out, THE Session_Service SHALL delete the session row.
8. THE Identity_Module SHALL store no raw Session_Cookie value and no raw invite token in the `sessions` table or the `invites` table.

### Requirement 4: CSRF protection

**User Story:** As an account holder, I want state-changing requests to require a CSRF token, so that another site cannot act with my session.

#### Acceptance Criteria

1. THE Csrf_Guard SHALL derive the Csrf_Token as HMAC of the per-session secret under the Csrf_Secret.
2. WHEN `GET /api/v1/me` is requested with a valid session, THE Identity_Routes SHALL return the Csrf_Token of that session.
3. IF a non-GET request authenticated by session carries no valid `X-CSRF-Token` header, THEN THE Csrf_Guard SHALL respond with status 403.
4. FOR ALL non-GET session routes, THE Csrf_Guard SHALL respond with status 403 without a valid `X-CSRF-Token` and SHALL allow the request with one (`P-csrf-required`).

### Requirement 5: Login and logout

**User Story:** As an invited user, I want to sign in and out, so that I can reach my workspace and end my session.

#### Acceptance Criteria

1. WHEN valid credentials are posted to `POST /api/v1/auth/login`, THE Identity_Routes SHALL create a session and set the Session_Cookie.
2. IF the email is unknown or the password is wrong, THEN THE Identity_Routes SHALL respond with the same status and the same body for both cases.
3. WHEN `POST /api/v1/auth/logout` is called with a valid session, THE Identity_Routes SHALL delete the session row.
4. WHEN `GET /api/v1/me` is requested with a valid session, THE Identity_Routes SHALL return the user, the memberships and the Csrf_Token.

### Requirement 6: Invite-only accounts

**User Story:** As a workspace owner, I want to invite people by one-time link, so that only people I choose can join.

#### Acceptance Criteria

1. WHEN an Owner posts to `POST /api/v1/workspaces/{id}/invites`, THE Invite_Service SHALL create an invite with a 72-hour expiry and return the one-time token.
2. THE Invite_Service SHALL store only a hash of each invite token.
3. WHEN a valid invite token and a password are posted to `POST /api/v1/invites/accept`, THE Invite_Service SHALL create the membership and mark the invite used.
4. IF an invite token has already been used, THEN THE Invite_Service SHALL respond with status 410.
5. IF an invite token has expired, THEN THE Invite_Service SHALL respond with status 410.

### Requirement 7: Password reset by one-time link

**User Story:** As a workspace owner, I want to issue a reset link for a member, so that the member can recover access without an email provider.

#### Acceptance Criteria

1. WHEN an Owner posts to `POST /api/v1/workspaces/{id}/members/{userId}/reset-link`, THE Reset_Service SHALL create a one-time reset link with a 1-hour expiry.
2. THE Reset_Service SHALL store only a hash of each reset token.
3. WHEN a valid reset token and a new password are posted to `POST /api/v1/password-reset`, THE Reset_Service SHALL set the new password and mark the reset link used.
4. WHEN a reset link is redeemed, THE Reset_Service SHALL invalidate all existing sessions of that user.
5. IF a reset token has already been used, THEN THE Reset_Service SHALL reject the request.
6. IF a reset token has expired, THEN THE Reset_Service SHALL reject the request.

### Requirement 8: Roles and workspace membership

**User Story:** As a workspace owner, I want roles enforced on the server, so that reviewers cannot do owner actions.

#### Acceptance Criteria

1. WHEN an Owner sends `PATCH /api/v1/workspaces/{id}/members/{userId}`, THE Identity_Routes SHALL change the role of that member.
2. THE Auth_Middleware SHALL provide `requireSession`, `requireRole('owner'|'reviewer')` and `workspaceContext`.
3. WHEN a request path names a workspace, THE Auth_Middleware SHALL check the workspace against the memberships of the session user.
4. IF the session user is not a member of the workspace named in the path, THEN THE Auth_Middleware SHALL respond with status 404.
5. IF a request fails authentication or authorization, THEN THE Auth_Middleware SHALL respond with a Problem_Response.

### Requirement 9: OpenAPI-registered routes

**User Story:** As an API consumer, I want the identity endpoints described in OpenAPI, so that the contract is machine-readable and the matrix test can enumerate routes.

#### Acceptance Criteria

1. THE Identity_Routes SHALL register every route with `@hono/zod-openapi` under `/api/v1`.

### Requirement 10: Bootstrap of the first owner

**User Story:** As an operator, I want to create the first workspace and an owner invite from the command line, so that a fresh deployment has a first account.

#### Acceptance Criteria

1. WHEN the Bootstrap_Script runs, THE Bootstrap_Script SHALL create the first workspace and an owner invite for the Bootstrap_Admin_Email.
2. WHEN the Bootstrap_Script creates an invite, THE Bootstrap_Script SHALL print the one-time invite URL to standard output once and write it to no log.
3. WHEN the Bootstrap_Script runs twice, THE Bootstrap_Script SHALL leave one workspace and one pending invite.

### Requirement 11: AuthZ matrix test

**User Story:** As a security reviewer, I want every route classified and tested against each kind of caller, so that no route is exposed by accident.

#### Acceptance Criteria

1. THE AuthZ_Matrix SHALL classify each route as `public`, `session`, `owner` or `reviewer`, and as workspace-scoped or not.
2. THE AuthZ_Matrix_Test SHALL enumerate every route from the OpenAPI registry.
3. IF a route is not classified in the AuthZ_Matrix, THEN THE AuthZ_Matrix_Test SHALL fail.
4. THE AuthZ_Matrix_Test SHALL run each route as an anonymous caller, as a member of another workspace, as a Reviewer and as an Owner.
5. WHERE a route is workspace-scoped, THE AuthZ_Matrix_Test SHALL also send Foreign_Workspace_Ids in the path, in the query and in body arrays.
6. WHEN a caller is not permitted by the AuthZ_Matrix, THE AuthZ_Matrix_Test SHALL require status 401, 403 or 404 and never 200.
