// The authZ matrix (ADR 0013, M1-03): every route the app serves, classified. It is both the
// specification the matrix test (`test/authz-matrix.int.test.ts`) checks every route against and the
// table `authorize` enforces at request time. A route that is not listed here is refused (404) and
// fails the test: every later ticket registers its routes here.
//
//   public    anyone, no session
//   session   any signed-in user (CSRF on non-GET)
//   reviewer  a reviewer or owner of the workspace in the path
//   owner     an owner of the workspace in the path
// `workspace: true` routes take the workspace from `/workspaces/{id}` and answer 404 to non-members.
import type { MembershipRole } from "@4x35/core";

export type Access = "public" | "session" | MembershipRole;

export interface RouteClass {
  readonly access: Access;
  readonly workspace: boolean;
}

/** Key: `METHOD /path/{param}` exactly as the OpenAPI document lists it. */
export const AUTHZ_MATRIX: Readonly<Record<string, RouteClass>> = {
  // Liveness and readiness (M1-05): probes from Render and Docker, no session.
  "GET /healthz": { access: "public", workspace: false },
  "GET /readyz": { access: "public", workspace: false },

  // Identity (M1-03).
  "POST /api/v1/auth/login": { access: "public", workspace: false },
  "POST /api/v1/auth/logout": { access: "session", workspace: false },
  "GET /api/v1/me": { access: "session", workspace: false },
  "POST /api/v1/invites/accept": { access: "public", workspace: false },
  "POST /api/v1/password-reset": { access: "public", workspace: false },
  "POST /api/v1/workspaces/{id}/invites": { access: "owner", workspace: true },
  "POST /api/v1/workspaces/{id}/members/{userId}/reset-link": { access: "owner", workspace: true },
  "PATCH /api/v1/workspaces/{id}/members/{userId}": { access: "owner", workspace: true },
};

/** `/a/:id/b` (Hono) → `/a/{id}/b` (OpenAPI). */
export function openApiPath(honoPath: string): string {
  return honoPath.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
}

export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${openApiPath(path)}`;
}

/** The class of a route, or undefined when it is not in the matrix. */
export function classify(method: string, path: string): RouteClass | undefined {
  return AUTHZ_MATRIX[routeKey(method, path)];
}

/** Matrix entries that contradict themselves: a role route must name a workspace. */
export function inconsistentEntries(): string[] {
  return Object.entries(AUTHZ_MATRIX)
    .filter(
      ([key, cls]) =>
        ((cls.access === "owner" || cls.access === "reviewer") && !cls.workspace) ||
        (cls.workspace && !key.includes("/workspaces/{id}")),
    )
    .map(([key]) => key);
}
