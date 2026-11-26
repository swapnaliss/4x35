/**
 * Constraints, triggers and cascades of the M1-02 schema (ticket AC 2a, 2b, 2c, 2e), on a fresh
 * database from the harness. All data is synthetic.
 */
import { randomUUID } from "node:crypto";
import { count, eq, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTx } from "../src/client.js";
import {
  auditEvents,
  batches,
  decisions,
  exportsTable,
  invites,
  jobTimings,
  memberships,
  paymentFileLinks,
  preflightRuns,
  proposals,
  records,
  users,
  workspaces,
} from "../src/schema/index.js";
import {
  createTestDatabase,
  databaseExists,
  hasDatabase,
  pgMessage,
  rejection,
  sqlState,
  type TestDb,
} from "./harness.js";

const UNIQUE = "23505";
const CHECK = "23514";
const RAISED = "P0001";
const sha = (c: string) => c.repeat(64);

describe.skipIf(!hasDatabase)("M1-02 schema on Postgres 17", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDatabase("schema");
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });

  // ---- fixtures -------------------------------------------------------------------------------

  async function workspaceAndUser() {
    const [w] = await t.db.insert(workspaces).values({ name: "Synthetic GmbH" }).returning();
    const [u] = await t.db
      .insert(users)
      .values({ email: `clerk-${randomUUID()}@example.test` })
      .returning();
    if (w === undefined || u === undefined) throw new Error("fixture insert returned nothing");
    return { w, u };
  }

  async function batch(
    over: Partial<typeof batches.$inferInsert> = {},
  ): Promise<typeof batches.$inferSelect> {
    const { w, u } = await workspaceAndUser();
    const [b] = await t.db
      .insert(batches)
      .values({
        workspaceId: w.id,
        kind: "master_list",
        format: "csv",
        original: new TextEncoder().encode("name;line1\nAcme;Hauptstr. 1\n"),
        sha256: sha("a"),
        encoding: "utf-8",
        packId: "generic",
        packVersion: "1.0.0",
        form: "structured",
        createdBy: u.id,
        ...over,
      })
      .returning();
    if (b === undefined) throw new Error("fixture insert returned nothing");
    return b;
  }

  /** A batch with one of every batch-owned row. */
  async function populated() {
    const b = await batch({ kind: "payment_file", format: "pain001" });
    const [r] = await t.db
      .insert(records)
      .values({
        batchId: b.id,
        location: { kind: "xml", xpath: "/Document/Cdtr/PstlAdr", byteStart: 10, byteEnd: 90 },
        partyRole: "creditor",
        originalLines: ["Acme Ltd", "1 High Street", "London"],
      })
      .returning();
    if (r === undefined) throw new Error("fixture insert returned nothing");
    const [p] = await t.db
      .insert(proposals)
      .values({
        recordId: r.id,
        packId: "generic",
        packVersion: "1.0.0",
        fields: [],
        findings: [],
        rejected: [],
      })
      .returning();
    if (p === undefined) throw new Error("fixture insert returned nothing");
    const [d] = await t.db
      .insert(decisions)
      .values({
        recordId: r.id,
        proposalId: p.id,
        action: "approve",
        actorId: randomUUID(),
        actorKind: "session",
      })
      .returning();
    await t.db.insert(paymentFileLinks).values({
      paymentBatchId: b.id,
      partyLocation: { kind: "xml", xpath: "/Document/Cdtr/PstlAdr", byteStart: 10, byteEnd: 90 },
      masterRecordId: r.id,
      matchKey: "GB00SYNT00000000000001|acme ltd",
      status: "matched",
    });
    await t.db.insert(preflightRuns).values({
      batchId: b.id,
      packId: "generic",
      packVersion: "1.0.0",
      results: [],
      summary: { reject: 0, strip: 0, warn: 0 },
    });
    await t.db.insert(exportsTable).values({
      batchId: b.id,
      kind: "payment_file",
      bytes: new Uint8Array([60, 63]),
      sha256: sha("b"),
      actorId: randomUUID(),
      actorKind: "session",
    });
    if (d === undefined) throw new Error("fixture insert returned nothing");
    return { b, r, p, d };
  }

  async function auditEvent() {
    const [e] = await t.db
      .insert(auditEvents)
      .values({
        workspaceId: randomUUID(),
        actorId: randomUUID(),
        actorKind: "session",
        action: "decision.recorded",
        subject: "record:synthetic",
        dataHash: sha("c"),
      })
      .returning();
    if (e === undefined) throw new Error("fixture insert returned nothing");
    return e;
  }

  const rows = async (table: PgTable, where: SQL | undefined): Promise<number> =>
    Number((await t.db.select({ n: count() }).from(table).where(where))[0]?.n ?? -1);

  // ---- AC 2a, 2e: uniqueness --------------------------------------------------------------------

  it("AC 2a: a second batch with the same (workspace_id, sha256, pack_id, pack_version, form) is a unique violation", async () => {
    const b = await batch();
    const again = (over: Partial<typeof batches.$inferInsert>) =>
      t.db.insert(batches).values({
        workspaceId: b.workspaceId,
        kind: "master_list",
        format: "xlsx",
        original: new Uint8Array([1]),
        sha256: b.sha256,
        encoding: "utf-8",
        packId: b.packId,
        packVersion: b.packVersion,
        form: b.form,
        createdBy: b.createdBy,
        ...over,
      });
    const err = await rejection(again({}));
    expect(sqlState(err)).toBe(UNIQUE);
    expect(pgMessage(err)).toContain("batches_dedup_key");
    // A different form or pack version is a different batch.
    await again({ form: "hybrid" });
    await again({ packVersion: "1.0.1" });
    expect(await rows(batches, eq(batches.sha256, b.sha256))).toBeGreaterThanOrEqual(3);
  });

  it("AC 2e: users.email is case-insensitive unique (citext) and keeps the case it was written with", async () => {
    const local = `Mixed.Case-${randomUUID()}`;
    const [u] = await t.db
      .insert(users)
      .values({ email: `${local}@Example.TEST` })
      .returning();
    expect(u?.email).toBe(`${local}@Example.TEST`);
    const err = await rejection(
      t.db.insert(users).values({ email: `${local.toLowerCase()}@example.test` }),
    );
    expect(sqlState(err)).toBe(UNIQUE);
    expect(pgMessage(err)).toContain("users_email_unique");
    const found = await t.db
      .select()
      .from(users)
      .where(eq(users.email, `${local.toUpperCase()}@EXAMPLE.TEST`));
    expect(found).toHaveLength(1);
  });

  // ---- AC 2b: immutability ----------------------------------------------------------------------

  it("AC 2b: UPDATE and DELETE on decisions raise and leave the row unchanged", async () => {
    const { d } = await populated();
    for (const stmt of [
      t.db.update(decisions).set({ action: "edit" }).where(eq(decisions.id, d.id)),
      t.db.delete(decisions).where(eq(decisions.id, d.id)),
      // a statement that matches no row still raises
      t.db.delete(decisions).where(eq(decisions.id, randomUUID())),
    ]) {
      const err = await rejection(stmt);
      expect(sqlState(err)).toBe(RAISED);
      expect(pgMessage(err)).toMatch(/^immutable: (UPDATE|DELETE) on decisions/);
    }
    expect(await t.db.select().from(decisions).where(eq(decisions.id, d.id))).toEqual([d]);
  });

  it("AC 2b: UPDATE and DELETE on audit_events raise and leave the row unchanged", async () => {
    const e = await auditEvent();
    for (const stmt of [
      t.db.update(auditEvents).set({ subject: "changed" }).where(eq(auditEvents.id, e.id)),
      t.db.delete(auditEvents).where(eq(auditEvents.id, e.id)),
      t.db.delete(auditEvents),
    ]) {
      const err = await rejection(stmt);
      expect(sqlState(err)).toBe(RAISED);
      expect(pgMessage(err)).toMatch(/^immutable: (UPDATE|DELETE) on audit_events/);
    }
    expect(await t.db.select().from(auditEvents).where(eq(auditEvents.id, e.id))).toEqual([e]);
  });

  it("AC 2b: UPDATE of batches.original, batches.sha256 and records.original_lines raises", async () => {
    const { b, r } = await populated();
    const cases: Array<[Promise<unknown>, string]> = [
      [
        t.db
          .update(batches)
          .set({ original: new Uint8Array([0]) })
          .where(eq(batches.id, b.id)),
        "batches.original",
      ],
      [
        t.db
          .update(batches)
          .set({ sha256: sha("f") })
          .where(eq(batches.id, b.id)),
        "batches.sha256",
      ],
      [
        t.db
          .update(records)
          .set({ originalLines: ["Acme Ltd", "2 High Street"] })
          .where(eq(records.id, r.id)),
        "records.original_lines",
      ],
    ];
    for (const [stmt, column] of cases) {
      const err = await rejection(stmt);
      expect(sqlState(err)).toBe(RAISED);
      expect(pgMessage(err)).toBe(`immutable: UPDATE of ${column} is not allowed`);
    }
    expect(await t.db.select().from(batches).where(eq(batches.id, b.id))).toEqual([b]);
    expect(await t.db.select().from(records).where(eq(records.id, r.id))).toEqual([r]);
  });

  it("other columns of batches and records still update (status, locked, version)", async () => {
    const { b, r } = await populated();
    const [b2] = await t.db
      .update(batches)
      .set({ status: "parsing", locked: true })
      .where(eq(batches.id, b.id))
      .returning();
    expect(b2).toMatchObject({
      status: "parsing",
      locked: true,
      original: b.original,
      sha256: b.sha256,
    });
    const [r2] = await t.db
      .update(records)
      .set({ status: "proposed", version: sql`${records.version} + 1` })
      .where(eq(records.id, r.id))
      .returning();
    expect(r2).toMatchObject({ status: "proposed", version: 1, originalLines: r.originalLines });
  });

  it("a DELETE on decisions issued from another trigger raises while the record exists", async () => {
    const { d } = await populated();
    await t.pool.query(`
      CREATE TABLE scratch_nested (decision_id uuid);
      CREATE FUNCTION scratch_nested_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN DELETE FROM decisions WHERE id = NEW.decision_id; RETURN NEW; END; $$;
      CREATE TRIGGER scratch_nested_t AFTER INSERT ON scratch_nested
        FOR EACH ROW EXECUTE FUNCTION scratch_nested_delete();`);
    try {
      const err = await rejection(t.pool.query("insert into scratch_nested values ($1)", [d.id]));
      expect(sqlState(err)).toBe(RAISED);
      expect(pgMessage(err)).toBe("immutable: DELETE on decisions is not allowed (append-only)");
      expect(await t.db.select().from(decisions).where(eq(decisions.id, d.id))).toEqual([d]);
    } finally {
      await t.pool.query("DROP TABLE scratch_nested; DROP FUNCTION scratch_nested_delete();");
    }
  });

  it("deleting a proposal that has decisions raises (the cascade exception is for a deleted record only)", async () => {
    const { p } = await populated();
    const err = await rejection(t.db.delete(proposals).where(eq(proposals.id, p.id)));
    expect(sqlState(err)).toBe(RAISED);
  });

  // ---- AC 2c: cascade ---------------------------------------------------------------------------

  it("AC 2c: deleting a batch removes its records, proposals, decisions, links, pre-flight runs and exports", async () => {
    const { b, r, p, d } = await populated();
    const other = await populated(); // must survive
    const before = {
      records: await rows(records, eq(records.batchId, b.id)),
      proposals: await rows(proposals, eq(proposals.id, p.id)),
      decisions: await rows(decisions, eq(decisions.id, d.id)),
      links: await rows(paymentFileLinks, eq(paymentFileLinks.paymentBatchId, b.id)),
      preflight: await rows(preflightRuns, eq(preflightRuns.batchId, b.id)),
      exports: await rows(exportsTable, eq(exportsTable.batchId, b.id)),
    };
    expect(before).toEqual({
      records: 1,
      proposals: 1,
      decisions: 1,
      links: 1,
      preflight: 1,
      exports: 1,
    });

    await t.db.delete(batches).where(eq(batches.id, b.id));

    expect({
      batches: await rows(batches, eq(batches.id, b.id)),
      records: await rows(records, eq(records.id, r.id)),
      proposals: await rows(proposals, eq(proposals.id, p.id)),
      decisions: await rows(decisions, eq(decisions.id, d.id)),
      links: await rows(paymentFileLinks, eq(paymentFileLinks.paymentBatchId, b.id)),
      preflight: await rows(preflightRuns, eq(preflightRuns.batchId, b.id)),
      exports: await rows(exportsTable, eq(exportsTable.batchId, b.id)),
    }).toEqual({
      batches: 0,
      records: 0,
      proposals: 0,
      decisions: 0,
      links: 0,
      preflight: 0,
      exports: 0,
    });
    expect(await rows(decisions, eq(decisions.id, other.d.id))).toBe(1);
    expect(await rows(records, eq(records.id, other.r.id))).toBe(1);
  });

  // ---- scope 3: enum CHECKs, version, purge_after, records index -------------------------------

  it("every enum column rejects a value outside its set (insert and update)", async () => {
    const { b, r, p, d } = await populated();
    await t.db
      .insert(memberships)
      .values({ workspaceId: b.workspaceId, userId: b.createdBy, role: "owner" });
    // Thunks: each statement starts only when the loop awaits it.
    const bad: Array<() => PromiseLike<unknown>> = [
      () => batch({ kind: "invoice" }),
      () => batch({ format: "json" }),
      () => batch({ form: "free_text" }),
      () => batch({ status: "done" }),
      () => batch({ eol: "crcr" }),
      () => t.db.update(batches).set({ status: "archived" }).where(eq(batches.id, b.id)),
      () => t.db.update(records).set({ status: "maybe" }).where(eq(records.id, r.id)),
      () =>
        t.db.update(memberships).set({ role: "admin" }).where(eq(memberships.userId, b.createdBy)),
      () =>
        t.db.insert(invites).values({
          workspaceId: b.workspaceId,
          email: "invitee@example.test",
          role: "admin",
          tokenHash: sha("e"),
          expiresAt: new Date(),
        }),
      () =>
        t.db.insert(decisions).values({
          recordId: r.id,
          proposalId: p.id,
          action: "reject",
          actorId: d.actorId,
          actorKind: "session",
        }),
      () =>
        t.db.insert(decisions).values({
          recordId: r.id,
          proposalId: p.id,
          action: "approve",
          actorId: d.actorId,
          actorKind: "robot",
        }),
      () =>
        t.db.insert(auditEvents).values({
          workspaceId: b.workspaceId,
          actorId: d.actorId,
          actorKind: "system",
          action: "x",
          subject: "y",
          dataHash: sha("d"),
        }),
      () =>
        t.db
          .insert(paymentFileLinks)
          .values({ paymentBatchId: b.id, partyLocation: {}, matchKey: "k", status: "maybe" }),
      () =>
        t.db
          .insert(jobTimings)
          .values({ jobId: d.actorId, kind: "structure", ms: 5, outcome: "ok" }),
    ];
    for (const stmt of bad) expect(sqlState(await rejection(Promise.resolve(stmt())))).toBe(CHECK);
  });

  it("records.version defaults to 0, and records has the (batch_id, status) index", async () => {
    const { r } = await populated();
    expect(r.version).toBe(0);
    const idx = await t.pool.query<{ def: string }>(
      "select indexdef as def from pg_indexes where tablename = 'records' and indexname = 'records_batch_status_idx'",
    );
    expect(idx.rows[0]?.def).toContain("(batch_id, status)");
  });

  it("purge_after is created_at (UTC) + 30 days on insert, whatever the caller sends", async () => {
    const createdAt = new Date("2026-03-20T23:30:00.123Z"); // across a European DST change
    const b = await batch({ createdAt, purgeAfter: new Date("2099-01-01T00:00:00Z") });
    expect(b.purgeAfter.toISOString()).toBe("2026-04-19T23:30:00.123Z");
    const now = await batch();
    expect(now.purgeAfter.getTime() - now.createdAt.getTime()).toBe(30 * 86_400_000);
  });

  it("every table of the ticket exists", async () => {
    const res = await t.pool.query<{ t: string }>(
      "select tablename as t from pg_tables where schemaname = 'public' order by 1",
    );
    expect(res.rows.map((x) => x.t)).toEqual([
      "api_tokens",
      "audit_events",
      "batches",
      "decisions",
      "exports",
      "idempotency_keys",
      "invites",
      "job_timings",
      "memberships",
      "payment_file_links",
      "preflight_runs",
      "proposals",
      "records",
      "sessions",
      "users",
      "workspaces",
    ]);
  });

  // ---- client.ts: withTx and the statement timeout ---------------------------------------------

  it("withTx commits when the callback resolves and rolls back and rethrows when it throws", async () => {
    const name = `tx-${randomUUID()}`;
    const id = await withTx(t.db, async (tx) => {
      const [w] = await tx.insert(workspaces).values({ name }).returning();
      return w?.id;
    });
    expect(await rows(workspaces, eq(workspaces.name, name))).toBe(1);

    const boom = new Error("synthetic failure");
    const lost = `tx-${randomUUID()}`;
    await expect(
      withTx(t.db, async (tx) => {
        await tx.insert(workspaces).values({ name: lost });
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(await rows(workspaces, eq(workspaces.name, lost))).toBe(0);
    expect(id).toBeTypeOf("string");
  });
});

describe.skipIf(!hasDatabase)("harness and pool", () => {
  it("each file gets its own database, named with PORT_OFFSET, and it is dropped after", async () => {
    const a = await createTestDatabase("harness");
    const b = await createTestDatabase("harness");
    try {
      expect(a.name).not.toBe(b.name);
      expect(a.name).toMatch(
        new RegExp(`^t_harness_${process.env.PORT_OFFSET ?? "0"}_[0-9a-f]{10}$`),
      );
      expect(await databaseExists(a.name)).toBe(true);
    } finally {
      await a.dropAndClose();
      await b.dropAndClose();
    }
    expect(await databaseExists(a.name)).toBe(false);
    expect(await databaseExists(b.name)).toBe(false);
  });

  it("a statement over the pool's statement timeout fails with 57014", async () => {
    const t = await createTestDatabase("timeout", { migrate: false, statementTimeoutMs: 100 });
    try {
      expect(sqlState(await rejection(t.pool.query("select pg_sleep(2)")))).toBe("57014");
    } finally {
      await t.dropAndClose();
    }
  });
});
