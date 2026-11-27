/**
 * The authz matrix test (M1-03 AC 1), against a real Postgres 17 through the HTTP app.
 *   1. Every route (the OpenAPI document plus Hono's own route table) is classified in
 *      `src/authz/matrix.ts`, and every matrix entry is a real route. An unclassified route fails.
 *   2. Each route runs as: anonymous, an owner of another workspace, a reviewer, an owner. A permitted
 *      cell answers 2xx; a forbidden cell answers 401, 403 or 404, never 200.
 *   3. P-cross-workspace-denied at the API: workspace routes called by workspace A's owner with
 *      workspace B's ids in the path, the query and body arrays never touch or return B's rows.
 * Later tickets add their routes to the matrix; this test then covers them.
 */
import { randomUUID } from "node:crypto";
import { forWorkspace } from "@4x35/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import type { App } from "../src/app.js";
import {
  AUTHZ_MATRIX,
  inconsistentEntries,
  type RouteClass,
  routeKey,
} from "../src/authz/matrix.js";
import { issueInvite, issueReset } from "../src/identity/invites.js";
import {
  addMember,
  call,
  email,
  PASSWORD,
  type SeededWorkspace,
  seedWorkspace,
  sessionFor,
  type TestSession,
  testApp,
} from "./identity-support.js";

type Caller = "anonymous" | "other workspace owner" | "reviewer" | "owner";
const CALLERS: readonly Caller[] = ["anonymous", "other workspace owner", "reviewer", "owner"];

/** Every route the app serves: the OpenAPI document and Hono's route table (plain app.get too). */
function servedRoutes(app: App): string[] {
  const doc = app.getOpenAPI31Document({
    openapi: "3.1.0",
    info: { title: "4x35", version: "test" },
  });
  const keys = new Set<string>();
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    for (const method of Object.keys(item ?? {})) {
      if (["get", "post", "put", "patch", "delete"].includes(method))
        keys.add(routeKey(method, path));
    }
  }
  for (const r of app.routes) if (r.method !== "ALL") keys.add(routeKey(r.method, r.path));
  return [...keys].sort();
}

function permitted(cls: RouteClass, caller: Caller): boolean {
  switch (cls.access) {
    case "public":
      return true;
    case "session":
      return caller !== "anonymous";
    case "reviewer":
      return caller === "reviewer" || caller === "owner";
    case "owner":
      return caller === "owner";
  }
}

describe.skipIf(!hasDatabase)("authz matrix (M1-03, real Postgres)", () => {
  let t: TestDb;
  let app: App;
  let a: SeededWorkspace;
  let b: SeededWorkspace;

  beforeAll(async () => {
    t = await createTestDatabase("authz-matrix", { migrate: true });
    app = testApp(t.db, t.pool);
    a = await seedWorkspace(t.db, "a");
    b = await seedWorkspace(t.db, "b");
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });

  /** A request the route accepts when the caller is allowed: fresh targets in workspace `w`. */
  async function requestFor(key: string, w: SeededWorkspace) {
    const [method = "", template = ""] = key.split(" ");
    let path = template.replace("{id}", w.id);
    let body: Record<string, unknown> | undefined;
    if (template.includes("{userId}")) {
      const target = await addMember(t.db, w.id, "matrix-target", "reviewer");
      path = path.replace("{userId}", target.id);
    }
    switch (key) {
      case "POST /api/v1/auth/login":
        body = { email: w.owner.email, password: PASSWORD };
        break;
      case "POST /api/v1/invites/accept": {
        const inv = await issueInvite(t.db, w.id, email("matrix-invitee"), "reviewer");
        if (inv.kind !== "issued") throw new Error("invite");
        body = { token: inv.token, password: PASSWORD };
        break;
      }
      case "POST /api/v1/password-reset": {
        const m = await addMember(t.db, w.id, "matrix-reset", "reviewer");
        const r = await issueReset(t.db, w.id, m.id);
        if (r.kind !== "issued") throw new Error("reset");
        body = { token: r.token, password: "matrix new password 1" };
        break;
      }
      case "POST /api/v1/workspaces/{id}/invites":
        body = { email: email("matrix-new"), role: "reviewer" };
        break;
      case "PATCH /api/v1/workspaces/{id}/members/{userId}":
        body = { role: "reviewer" };
        break;
    }
    return { method, path, body };
  }

  async function sessionOf(caller: Caller): Promise<TestSession | undefined> {
    switch (caller) {
      case "anonymous":
        return undefined;
      case "other workspace owner":
        return sessionFor(t.db, b.owner.id);
      case "reviewer":
        return sessionFor(t.db, a.reviewer.id);
      case "owner":
        return sessionFor(t.db, a.owner.id);
    }
  }

  /** Everything of workspace B a cross-workspace call could change, as one comparable string. */
  async function snapshotB(): Promise<string> {
    const q = async (text: string) => (await t.pool.query(text, [b.id])).rows;
    return JSON.stringify({
      ws: await q("select id, name, settings from workspaces where id = $1"),
      members: await q(
        "select user_id, role from memberships where workspace_id = $1 order by user_id",
      ),
      invites: await q("select id, used_at from invites where workspace_id = $1 order by id"),
      resets: await q(
        "select id, used_at from password_resets where workspace_id = $1 order by id",
      ),
      users: await q(
        "select u.id, u.password_hash from users u join memberships m on m.user_id = u.id where m.workspace_id = $1 order by u.id",
      ),
      sessions: await q(
        "select count(*)::int as n from sessions s join memberships m on m.user_id = s.user_id where m.workspace_id = $1",
      ),
    });
  }

  it("authz matrix: every served route is classified, and every entry is a served route", () => {
    const served = servedRoutes(app);
    expect(served.filter((k) => AUTHZ_MATRIX[k] === undefined)).toEqual([]);
    expect(Object.keys(AUTHZ_MATRIX).filter((k) => !served.includes(k))).toEqual([]);
    expect(inconsistentEntries()).toEqual([]);
    expect(AUTHZ_MATRIX["GET /healthz"]).toEqual({ access: "public", workspace: false });
    expect(AUTHZ_MATRIX["GET /readyz"]).toEqual({ access: "public", workspace: false });
  });

  it("authz matrix: an unclassified route is detected by the enumeration and refused at request time (fail closed)", async () => {
    const extra = testApp(t.db, t.pool);
    extra.get("/api/v1/unclassified", (c) => c.json({ leaked: true }, 200));
    expect(servedRoutes(extra).filter((k) => AUTHZ_MATRIX[k] === undefined)).toEqual([
      "GET /api/v1/unclassified",
    ]);
    const owner = await sessionFor(t.db, a.owner.id);
    const res = await call(extra, "/api/v1/unclassified", { session: owner });
    expect(res.status).toBe(404);
  });

  for (const [key, cls] of Object.entries(AUTHZ_MATRIX)) {
    it(`authz matrix: ${key} (${cls.access}${cls.workspace ? ", workspace" : ""}) for anonymous, another workspace's owner, reviewer and owner`, async () => {
      const cells: string[] = [];
      for (const caller of CALLERS) {
        const r = await requestFor(key, a);
        const s = await sessionOf(caller);
        const res = await call(app, r.path, {
          method: r.method,
          ...(s ? { session: s } : {}),
          ...(r.body === undefined ? {} : { body: r.body }),
        });
        const allow = permitted(cls, caller);
        cells.push(`${caller}: ${res.status}`);
        if (allow) {
          expect(res.status, `${key} as ${caller} (permitted)`).toBeGreaterThanOrEqual(200);
          expect(res.status, `${key} as ${caller} (permitted)`).toBeLessThan(300);
        } else {
          expect([401, 403, 404], `${key} as ${caller} (forbidden)`).toContain(res.status);
          expect(res.headers.get("content-type")).toBe("application/problem+json");
        }
      }
      console.log(`authz matrix ${key}: ${cells.join(", ")}`);
    });
  }

  const workspaceRoutes = Object.entries(AUTHZ_MATRIX).filter(([, cls]) => cls.workspace);

  it("authz matrix · P-cross-workspace-denied: workspace B's id in the path answers 404 and changes nothing in B", async () => {
    expect(workspaceRoutes.length).toBeGreaterThan(0);
    for (const [key] of workspaceRoutes) {
      const before = await snapshotB();
      const r = await requestFor(key, b); // a valid request, but in workspace B
      const owner = await sessionFor(t.db, a.owner.id);
      const res = await call(app, r.path, {
        method: r.method,
        session: owner,
        ...(r.body === undefined ? {} : { body: r.body }),
      });
      expect(res.status, key).toBe(404);
      // requestFor added a target member to B; nothing else may change.
      const after = await snapshotB();
      expect(JSON.parse(after).invites, key).toEqual(JSON.parse(before).invites);
      expect(JSON.parse(after).resets, key).toEqual(JSON.parse(before).resets);
      expect(JSON.parse(after).ws, key).toEqual(JSON.parse(before).ws);
    }
  });

  it("authz matrix · P-cross-workspace-denied: B's member id under A's workspace path answers 404", async () => {
    const owner = await sessionFor(t.db, a.owner.id);
    for (const [key] of workspaceRoutes.filter(([k]) => k.includes("{userId}"))) {
      const before = await snapshotB();
      const [method = "", template = ""] = key.split(" ");
      const path = template.replace("{id}", a.id).replace("{userId}", b.owner.id);
      const res = await call(app, path, {
        method,
        session: owner,
        ...(method === "PATCH" ? { body: { role: "reviewer" } } : {}),
      });
      expect(res.status, key).toBe(404);
      expect(await snapshotB(), key).toBe(before);
    }
  });

  it("authz matrix · P-cross-workspace-denied: B's ids in the query and in body arrays are ignored, never acted on or returned", async () => {
    const bIds = [b.id, b.owner.id, b.reviewer.id, randomUUID()];
    const query = `?workspaceId=${b.id}&ids=${bIds.join(",")}&userId=${b.owner.id}`;
    for (const [key] of workspaceRoutes) {
      const r = await requestFor(key, a);
      const before = await snapshotB();
      const owner = await sessionFor(t.db, a.owner.id);
      const res = await call(app, `${r.path}${query}`, {
        method: r.method,
        session: owner,
        body: { ...(r.body ?? {}), ids: bIds, workspaceId: b.id, userIds: [b.owner.id] },
      });
      const text = await res.text();
      expect([200, 201, 204, 400, 401, 403, 404], key).toContain(res.status);
      for (const id of bIds) expect(text.includes(id), `${key} response holds ${id}`).toBe(false);
      expect(await snapshotB(), key).toBe(before);
    }
    // And B's owner role is still owner: nothing above demoted or reset them.
    expect(
      (await forWorkspace({ workspaceId: b.id }, t.db).memberships.get(b.owner.id))?.role,
    ).toBe("owner");
  });
});
