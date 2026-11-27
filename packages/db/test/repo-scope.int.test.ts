/**
 * P1 P-cross-workspace-denied (M1-03 AC 2), against a real Postgres 17: two workspaces A and B, each
 * with a full graph of workspace data (members, invites, reset links, API tokens, batches, records,
 * proposals, decisions, audit events, exports, preflight runs, payment-file links, idempotency keys).
 * FOR ALL repository calls made with workspace A's context and any resource ids (A's, B's or random),
 * no call returns a row of workspace B, and no write attaches to a row of workspace B.
 *
 * The property also runs once against a planted bug (a `records.get` that forgets the workspace
 * filter) and must fail on it; the seed and counterexample are printed in the verbose log.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Executor,
  forWorkspace,
  identityRepository,
  OutOfScopeError,
  type WorkspaceRepositories,
} from "../src/index.js";
import { addressLine, NUM_RUNS } from "./arbitraries.js";
import { createTestDatabase, hasDatabase, type TestDb } from "./harness.js";

type Kind =
  | "membership"
  | "invite"
  | "reset"
  | "apiToken"
  | "batch"
  | "record"
  | "proposal"
  | "decision"
  | "audit"
  | "export"
  | "preflight"
  | "link"
  | "idempotencyKey";

interface Seeded {
  readonly workspaceId: string;
  readonly ids: Record<Kind, string[]>;
  readonly inviteEmails: string[];
  readonly onlyHereUserId: string;
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const hex64 = () => randomBytes(32).toString("hex");

/** A synthetic workspace graph, written through the repositories themselves. */
async function seedWorkspace(db: Executor, label: string, lines: string[]): Promise<Seeded> {
  const identity = identityRepository(db);
  const ws = await identity.createWorkspace(`Synthetic ${label}`);
  const repos = forWorkspace({ workspaceId: ws.id }, db);
  const ids: Record<Kind, string[]> = {
    membership: [],
    invite: [],
    reset: [],
    apiToken: [],
    batch: [],
    record: [],
    proposal: [],
    decision: [],
    audit: [],
    export: [],
    preflight: [],
    link: [],
    idempotencyKey: [],
  };
  const tag = randomBytes(3).toString("hex");
  const owner = await identity.ensureUser(`owner-${label}-${tag}@example.test`);
  const reviewer = await identity.ensureUser(`reviewer-${label}-${tag}@example.test`);
  await repos.memberships.add(owner.id, "owner");
  await repos.memberships.add(reviewer.id, "reviewer");
  ids.membership.push(owner.id, reviewer.id);

  const inviteEmails = [`invitee-${label}-${tag}@example.test`];
  const inv = await repos.invites.create({
    email: inviteEmails[0] ?? "",
    role: "reviewer",
    tokenHash: hex64(),
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  ids.invite.push(inv.id);
  ids.reset.push(
    (
      await repos.passwordResets.create({
        userId: reviewer.id,
        tokenHash: hex64(),
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    ).id,
  );
  ids.apiToken.push(
    (
      await repos.apiTokens.create({
        prefix: `4x35_${tag}`,
        tokenHash: hex64(),
        createdBy: owner.id,
      })
    ).id,
  );
  ids.audit.push(
    (
      await repos.auditEvents.insert({
        actorId: owner.id,
        actorKind: "session",
        action: "synthetic.seed",
        subject: `workspace:${ws.id}`,
        dataHash: hex64(),
      })
    ).id,
  );
  const key = `key-${label}-${tag}`;
  await repos.idempotencyKeys.claim(key, hex64(), { pending: true });
  ids.idempotencyKey.push(key);

  for (const kind of ["master_list", "payment_file"] as const) {
    const original = randomBytes(24);
    const batch = await repos.batches.insert({
      kind,
      format: "csv",
      original,
      sha256: sha(original),
      encoding: "utf-8",
      packId: "synthetic-pack",
      packVersion: "1.0.0",
      form: "structured",
      createdBy: owner.id,
    });
    ids.batch.push(batch.id);
    for (let i = 0; i < 2; i++) {
      const rec = await repos.records.insert({
        batchId: batch.id,
        location: { kind: "cell", sheet: null, row: i + 1, columns: ["A"] },
        partyRole: "creditor",
        originalLines: [lines[i % lines.length] ?? "1 Synthetic Street", "Exampletown"],
      });
      ids.record.push(rec.id);
      const prop = await repos.proposals.insert({
        recordId: rec.id,
        packId: "synthetic-pack",
        packVersion: "1.0.0",
        fields: [],
        findings: [],
        rejected: [],
      });
      ids.proposal.push(prop.id);
      ids.decision.push(
        (
          await repos.decisions.insert({
            recordId: rec.id,
            proposalId: prop.id,
            action: "approve",
            actorId: reviewer.id,
            actorKind: "session",
          })
        ).id,
      );
    }
    const bytes = randomBytes(8);
    ids.export.push(
      (
        await repos.exports.insert({
          batchId: batch.id,
          kind: "health_report",
          bytes,
          sha256: sha(bytes),
          actorId: owner.id,
          actorKind: "session",
        })
      ).id,
    );
    ids.preflight.push(
      (
        await repos.preflightRuns.insert({
          batchId: batch.id,
          packId: "synthetic-pack",
          packVersion: "1.0.0",
          results: [],
          summary: {},
        })
      ).id,
    );
  }
  const [masterBatch, paymentBatch] = ids.batch;
  const masterRecord = ids.record[0];
  if (!masterBatch || !paymentBatch || !masterRecord) throw new Error("seed incomplete");
  ids.link.push(
    (
      await repos.paymentFileLinks.insert({
        paymentBatchId: paymentBatch,
        partyLocation: { kind: "cell", sheet: null, row: 1, columns: ["B"] },
        masterRecordId: masterRecord,
        matchKey: `synthetic-${tag}`,
        status: "matched",
      })
    ).id,
  );
  const onlyHere = await identity.ensureUser(`only-${label}-${tag}@example.test`);
  await repos.memberships.add(onlyHere.id, "reviewer");
  ids.membership.push(onlyHere.id);
  return { workspaceId: ws.id, ids, inviteEmails, onlyHereUserId: onlyHere.id };
}

/** One repository call; returns every row it gave back, as (kind, id) pairs to check. */
type Call = (r: WorkspaceRepositories, id: string, b: Seeded) => Promise<[Kind, string][]>;

const got = <T>(kind: Kind, rows: (T | undefined)[], idOf: (row: T) => string): [Kind, string][] =>
  rows.filter((x): x is T => x !== undefined).map((x) => [kind, idOf(x)]);
const byId = (x: { id: string }) => x.id;

/** The kind of id each read takes (null: it takes none). */
const ID_KIND: Record<string, Kind | null> = {
  "memberships.get": "membership",
  "memberships.list": null,
  "invites.get": "invite",
  "invites.list": null,
  "invites.pendingFor(B's invitee)": null,
  "passwordResets.get": "reset",
  "apiTokens.get": "apiToken",
  "apiTokens.list": null,
  "batches.get": "batch",
  "batches.list": null,
  "records.get": "record",
  "records.listByBatch": "batch",
  "records.countByStatus": "batch",
  "proposals.get": "proposal",
  "proposals.listByRecord": "record",
  "decisions.get": "decision",
  "decisions.listByRecord": "record",
  "auditEvents.get": "audit",
  "auditEvents.list": null,
  "exports.get": "export",
  "exports.listByBatch": "batch",
  "preflightRuns.get": "preflight",
  "preflightRuns.listByBatch": "batch",
  "paymentFileLinks.get": "link",
  "paymentFileLinks.listByBatch": "batch",
  "idempotencyKeys.get": "idempotencyKey",
};

const READS: Record<string, Call> = {
  "memberships.get": async (r, id) =>
    got("membership", [await r.memberships.get(id)], (m) => m.userId),
  "memberships.list": async (r) => got("membership", await r.memberships.list(), (m) => m.userId),
  "invites.get": async (r, id) => got("invite", [await r.invites.get(id)], byId),
  "invites.list": async (r) => got("invite", await r.invites.list(), byId),
  "invites.pendingFor(B's invitee)": async (r, _id, b) =>
    got("invite", await r.invites.pendingFor(b.inviteEmails[0] ?? ""), byId),
  "passwordResets.get": async (r, id) => got("reset", [await r.passwordResets.get(id)], byId),
  "apiTokens.get": async (r, id) => got("apiToken", [await r.apiTokens.get(id)], byId),
  "apiTokens.list": async (r) => got("apiToken", await r.apiTokens.list(), byId),
  "batches.get": async (r, id) => got("batch", [await r.batches.get(id)], byId),
  "batches.list": async (r) => got("batch", await r.batches.list(), byId),
  "records.get": async (r, id) => got("record", [await r.records.get(id)], byId),
  "records.listByBatch": async (r, id) => got("record", await r.records.listByBatch(id), byId),
  "records.countByStatus": async (r, id) =>
    (await r.records.countByStatus(id)).length > 0 ? [["batch", id]] : [],
  "proposals.get": async (r, id) => got("proposal", [await r.proposals.get(id)], byId),
  "proposals.listByRecord": async (r, id) =>
    got("proposal", await r.proposals.listByRecord(id), byId),
  "decisions.get": async (r, id) => got("decision", [await r.decisions.get(id)], byId),
  "decisions.listByRecord": async (r, id) =>
    got("decision", await r.decisions.listByRecord(id), byId),
  "auditEvents.get": async (r, id) => got("audit", [await r.auditEvents.get(id)], byId),
  "auditEvents.list": async (r) => got("audit", await r.auditEvents.list(), byId),
  "exports.get": async (r, id) => got("export", [await r.exports.get(id)], byId),
  "exports.listByBatch": async (r, id) => got("export", await r.exports.listByBatch(id), byId),
  "preflightRuns.get": async (r, id) => got("preflight", [await r.preflightRuns.get(id)], byId),
  "preflightRuns.listByBatch": async (r, id) =>
    got("preflight", await r.preflightRuns.listByBatch(id), byId),
  "paymentFileLinks.get": async (r, id) => got("link", [await r.paymentFileLinks.get(id)], byId),
  "paymentFileLinks.listByBatch": async (r, id) =>
    got("link", await r.paymentFileLinks.listByBatch(id), byId),
  "idempotencyKeys.get": async (r, id) =>
    got("idempotencyKey", [await r.idempotencyKeys.get(id)], (k) => k.key),
};

/** Writes that would attach a row to one of B's rows: each must throw OutOfScopeError. */
const WRITES: Record<
  string,
  (r: WorkspaceRepositories, id: string, b: Seeded) => Promise<unknown>
> = {
  "records.insert": (r, id) =>
    r.records.insert({
      batchId: id,
      location: { kind: "cell", sheet: null, row: 9, columns: ["A"] },
      partyRole: "creditor",
      originalLines: ["9 Synthetic Street"],
    }),
  "proposals.insert": (r, id) =>
    r.proposals.insert({
      recordId: id,
      packId: "p",
      packVersion: "1",
      fields: [],
      findings: [],
      rejected: [],
    }),
  "exports.insert": (r, id) => {
    const bytes = randomBytes(4);
    return r.exports.insert({
      batchId: id,
      kind: "x",
      bytes,
      sha256: sha(bytes),
      actorId: randomUUID(),
      actorKind: "session",
    });
  },
  "preflightRuns.insert": (r, id) =>
    r.preflightRuns.insert({
      batchId: id,
      packId: "p",
      packVersion: "1",
      results: [],
      summary: {},
    }),
  "paymentFileLinks.insert": (r, id) =>
    r.paymentFileLinks.insert({
      paymentBatchId: id,
      partyLocation: {},
      matchKey: "k",
      status: "none",
    }),
  "passwordResets.create(B-only user)": (r, _id, b) =>
    r.passwordResets.create({
      userId: b.onlyHereUserId,
      tokenHash: hex64(),
      expiresAt: new Date(Date.now() + 3_600_000),
    }),
};

describe.skipIf(!hasDatabase)("workspace-scoped repositories (M1-03)", () => {
  let t: TestDb;
  let a: Seeded;
  let b: Seeded;
  let owner: Map<string, string>;

  beforeAll(async () => {
    t = await createTestDatabase("repo-scope", { migrate: true });
    const lines = fc.sample(addressLine, { numRuns: 4, seed: 3031 });
    a = await seedWorkspace(t.db, "a", lines);
    b = await seedWorkspace(t.db, "b", lines);
    owner = new Map();
    for (const s of [a, b]) {
      for (const list of Object.values(s.ids)) for (const id of list) owner.set(id, s.workspaceId);
    }
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });

  const allIds = (s: Seeded) => Object.values(s.ids).flat();
  /** A call and its id: B's id of the right kind (most often), any id of A or B, random or junk. */
  const callAndId = () =>
    fc.constantFrom(...Object.keys(READS)).chain((name) => {
      const kind = ID_KIND[name] ?? null;
      const ofKind = (s: Seeded) => (kind === null ? allIds(s) : s.ids[kind]);
      return fc.tuple(
        fc.constant(name),
        fc.oneof(
          { weight: 4, arbitrary: fc.constantFrom(...ofKind(b)) },
          { weight: 1, arbitrary: fc.constantFrom(...allIds(b)) },
          { weight: 1, arbitrary: fc.constantFrom(...ofKind(a)) },
          { weight: 1, arbitrary: fc.uuid() },
          {
            weight: 1,
            arbitrary: fc.constantFrom("not-a-uuid", "", "00000000-0000-0000-0000-000000000000"),
          },
        ),
      );
    });

  /** The property, over a repository factory (the real one, or a planted bug). */
  const property = (make: (ctx: { workspaceId: string }) => WorkspaceRepositories) =>
    fc.asyncProperty(callAndId(), async ([name, id]) => {
      const call = READS[name];
      if (!call) throw new Error(name);
      const rows = await call(make({ workspaceId: a.workspaceId }), id, b);
      for (const [kind, rowId] of rows) {
        const ws = owner.get(rowId);
        if (ws === b.workspaceId) {
          throw new Error(`${name}(${id}) returned ${kind} ${rowId} of workspace B`);
        }
      }
    });

  it(`P1 P-cross-workspace-denied: no repository call with workspace A's context returns a row of workspace B (${NUM_RUNS} runs)`, async () => {
    await fc.assert(
      property((ctx) => forWorkspace(ctx, t.db)),
      { numRuns: NUM_RUNS },
    );
  });

  it("P1 P-cross-workspace-denied: every write that would attach to workspace B's rows throws OutOfScopeError and writes nothing", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Object.keys(WRITES)),
        fc.constantFrom(...b.ids.batch, ...b.ids.record),
        async (name, id) => {
          const write = WRITES[name];
          if (!write) throw new Error(name);
          const before = (await forWorkspace({ workspaceId: b.workspaceId }, t.db).batches.list())
            .length;
          await expect(
            write(forWorkspace({ workspaceId: a.workspaceId }, t.db), id, b),
          ).rejects.toBeInstanceOf(OutOfScopeError);
          const after = (await forWorkspace({ workspaceId: b.workspaceId }, t.db).batches.list())
            .length;
          expect(after).toBe(before);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("positive control: workspace A's own ids are found through A's context", async () => {
    const r = forWorkspace({ workspaceId: a.workspaceId }, t.db);
    for (const name of Object.keys(READS)) {
      const call = READS[name];
      if (!call) continue;
      const kind = name.split(".")[0];
      const sample: Record<string, string | undefined> = {
        memberships: a.ids.membership[0],
        invites: a.ids.invite[0],
        passwordResets: a.ids.reset[0],
        apiTokens: a.ids.apiToken[0],
        batches: a.ids.batch[0],
        records: name === "records.get" ? a.ids.record[0] : a.ids.batch[0],
        proposals: name === "proposals.get" ? a.ids.proposal[0] : a.ids.record[0],
        decisions: name === "decisions.get" ? a.ids.decision[0] : a.ids.record[0],
        auditEvents: a.ids.audit[0],
        exports: name === "exports.get" ? a.ids.export[0] : a.ids.batch[0],
        preflightRuns: name === "preflightRuns.get" ? a.ids.preflight[0] : a.ids.batch[0],
        paymentFileLinks: name === "paymentFileLinks.get" ? a.ids.link[0] : a.ids.batch[1],
        idempotencyKeys: a.ids.idempotencyKey[0],
      };
      const id = sample[kind ?? ""] ?? "";
      const rows = await call(r, id, a);
      expect(rows.length, name).toBeGreaterThan(0);
    }
    expect(await r.workspace.get()).toMatchObject({ id: a.workspaceId });
  });

  it("P1 catches a planted bug: records.get without the workspace filter", async () => {
    const planted = (ctx: { workspaceId: string }): WorkspaceRepositories => {
      const real = forWorkspace(ctx, t.db);
      const other = forWorkspace({ workspaceId: b.workspaceId }, t.db);
      return {
        ...real,
        records: {
          ...real.records,
          // The bug: falls back to any workspace's record, as an unscoped `where id = $1` would.
          get: async (id) => (await real.records.get(id)) ?? other.records.get(id),
        },
      };
    };
    const out = await fc.check(property(planted), { numRuns: NUM_RUNS, seed: 3032 });
    expect(out.failed).toBe(true);
    console.log(
      `P-cross-workspace-denied planted bug caught: seed ${out.seed}, counterexample ${JSON.stringify(out.counterexample)}`,
    );
  });
});
