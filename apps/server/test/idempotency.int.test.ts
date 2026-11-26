/**
 * Idempotency-Key middleware against a real Postgres (M1-04, AC 2).
 * P3 P-idempotency-key-replay: a POST replayed with the same key and body returns the identical
 * status and body without running the handler again; the same key with a different body is 422.
 * Planted bug first: the route opted out of the middleware, so a replay runs the handler again.
 */
import { randomUUID } from "node:crypto";
import { schema } from "@4x35/db";
import { and, eq, sql } from "drizzle-orm";
import fc from "fast-check";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addressLine } from "../../../packages/core/test/arbitraries.js";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import {
  createApp,
  IDEMPOTENCY_HEADER,
  type IdempotencyEnv,
  idempotency,
  type OptOut,
  REPLAYED_HEADER,
} from "../src/index.js";
import { seedBatch } from "./support.js";

const P3_RUNS = Math.max(100, Number(process.env.FC_NUM_RUNS ?? 0) || 0);

describe.skipIf(!hasDatabase)("Idempotency-Key (real Postgres)", () => {
  let t: TestDb;
  let workspaceId: string;
  let calls = 0;

  beforeAll(async () => {
    t = await createTestDatabase("idempotency");
    ({ workspaceId } = await seedBatch(t.db, []));
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });
  beforeEach(() => {
    calls = 0;
  });

  /** A test app: the auth stand-in sets the workspace, then the middleware, then test routes. */
  const appWith = (optOut: readonly OptOut[] = [], ws: string | null = workspaceId) => {
    const app = new Hono<IdempotencyEnv>();
    app.use("*", async (c, next) => {
      if (ws !== null) c.set("workspaceId", ws);
      await next();
    });
    app.use("*", idempotency({ db: t.db, optOut }));
    app.post("/things", async (c) => {
      calls++;
      const body = await c.req.json();
      return c.json({ call: calls, id: randomUUID(), echo: body }, 201);
    });
    app.post("/boom", (c) => {
      calls++;
      return c.json({ error: "synthetic" }, 503);
    });
    app.post("/slow", async (c) => {
      calls++;
      await new Promise((r) => setTimeout(r, 300));
      return c.json({ ok: true }, 200);
    });
    return app;
  };

  const post = (app: Hono<IdempotencyEnv>, path: string, key: string | null, body: unknown) =>
    app.request(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key === null ? {} : { [IDEMPOTENCY_HEADER]: key }),
      },
      body: JSON.stringify(body),
    });

  /** Request bodies as the API will see them: synthetic address lines and a record count. */
  const requestBody = fc.record({
    name: addressLine,
    lines: fc.array(addressLine, { minLength: 1, maxLength: 4 }),
    count: fc.integer({ min: 0, max: 20_000 }),
  });

  const replayProperty = (app: Hono<IdempotencyEnv>) =>
    fc.asyncProperty(
      fc.uuid({ version: 4 }),
      requestBody,
      requestBody,
      async (key, body, other) => {
        const before = calls;
        const first = await post(app, "/things", key, body);
        const firstText = await first.text();
        const again = await post(app, "/things", key, body);
        expect(again.status).toBe(first.status);
        expect(await again.text()).toBe(firstText);
        expect(calls - before).toBe(1);
        if (JSON.stringify(other) !== JSON.stringify(body)) {
          const changed = await post(app, "/things", key, other);
          expect(changed.status).toBe(422);
          expect(changed.headers.get("content-type")).toBe("application/problem+json");
          expect(calls - before).toBe(1);
        }
      },
    );

  it("P3 P-idempotency-key-replay catches a planted bug (the route opted out of the middleware)", async () => {
    const planted = appWith([{ path: "/things", reason: "planted bug" }]);
    const result = await fc.check(replayProperty(planted), {
      numRuns: P3_RUNS,
      seed: 4043,
      endOnFailure: true,
    });
    expect(result.failed, "P-idempotency-key-replay: the planted bug was not caught").toBe(true);
    console.log(
      `P-idempotency-key-replay: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; first request body name length=${result.counterexample?.[1]?.name.length}`,
    );
  });

  it(`P3 P-idempotency-key-replay: same key and body replays status and body once; a new body is 422 (${P3_RUNS} runs)`, async () => {
    await fc.assert(replayProperty(appWith()), { numRuns: P3_RUNS });
  });

  it("stores (key, workspace_id, request_hash, response) and marks the replay", async () => {
    const app = appWith();
    const key = randomUUID();
    const first = await post(app, "/things", key, { a: 1 });
    const replay = await post(app, "/things", key, { a: 1 });
    expect(first.headers.get(REPLAYED_HEADER)).toBeNull();
    expect(replay.headers.get(REPLAYED_HEADER)).toBe("true");
    expect(replay.headers.get("content-type")).toBe(first.headers.get("content-type"));
    const [row] = await t.db
      .select()
      .from(schema.idempotencyKeys)
      .where(
        and(
          eq(schema.idempotencyKeys.workspaceId, workspaceId),
          eq(schema.idempotencyKeys.key, key),
        ),
      );
    expect(row?.requestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.response).toMatchObject({ status: 201 });
  });

  it("a POST without the header, or without a workspace, runs every time", async () => {
    const app = appWith();
    await post(app, "/things", null, { a: 1 });
    await post(app, "/things", null, { a: 1 });
    const anonymous = appWith([], null);
    const key = randomUUID();
    await post(anonymous, "/things", key, { a: 1 });
    await post(anonymous, "/things", key, { a: 1 });
    expect(calls).toBe(4);
  });

  it("the same key in another workspace is a different entry", async () => {
    const { workspaceId: other } = await seedBatch(t.db, []);
    const key = randomUUID();
    await post(appWith(), "/things", key, { a: 1 });
    const res = await post(appWith([], other), "/things", key, { a: 2 });
    expect(res.status).toBe(201);
    expect(calls).toBe(2);
  });

  it("a 5xx response is not stored, so a retry runs the handler again", async () => {
    const app = appWith();
    const key = randomUUID();
    expect((await post(app, "/boom", key, {})).status).toBe(503);
    expect((await post(app, "/boom", key, {})).status).toBe(503);
    expect(calls).toBe(2);
  });

  it("a second request while the first is in flight gets 409 problem+json", async () => {
    const app = appWith();
    const key = randomUUID();
    const [a, b] = await Promise.all([
      post(app, "/slow", key, {}),
      new Promise((r) => setTimeout(r, 100)).then(() => post(app, "/slow", key, {})),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(409);
    expect(b.headers.get("content-type")).toBe("application/problem+json");
    expect(calls).toBe(1);
  });

  it("an entry older than 24 h is ignored and replaced", async () => {
    const app = appWith();
    const key = randomUUID();
    await post(app, "/things", key, { a: 1 });
    await t.db.execute(
      sql`update idempotency_keys set at = now() - interval '25 hours' where key = ${key}`,
    );
    const res = await post(app, "/things", key, { a: 2 });
    expect(res.status).toBe(201);
    expect(calls).toBe(2);
  });

  it("rejects a malformed key with 400 problem+json", async () => {
    const res = await post(appWith(), "/things", "has spaces", {});
    expect(res.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("createApp applies the middleware to every POST when given the database", async () => {
    const app = createApp({ version: "0.1.0", commit: "test" }, { db: t.db });
    // No auth middleware yet (M1-03): without a workspace the middleware passes through.
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    const routes = app.routes.map((r) => `${r.method} ${r.path}`);
    expect(routes).toContain("ALL /*");
  });
});
