// Shared helpers for the apps/server integration tests (M1-04). Test-only: nothing here is
// imported by product code.
import { createHash, randomBytes } from "node:crypto";
import type { RecordStatus } from "@4x35/core";
import { type Database, forWorkspace, identityRepository } from "@4x35/db";
import { sql } from "drizzle-orm";

/** Synthetic session and CSRF keys for tests (low-entropy on purpose: not credentials). */
export const TEST_KEYS = { SESSION_SECRET: "s".repeat(40), CSRF_SECRET: "c".repeat(40) } as const;

/** The connection string of the harness database `name` (same server and credentials). */
export function urlFor(name: string): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  url.pathname = `/${name}`;
  return url.toString();
}

/** Polls `probe` every 100 ms until it returns a value other than undefined, or times out. */
export async function waitFor<T>(
  what: string,
  probe: () => Promise<T | undefined>,
  timeoutMs = 30_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await probe();
    if (v !== undefined) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** A workspace, a user and one batch with `statuses.length` records (synthetic data). */
export async function seedBatch(
  db: Database,
  statuses: readonly RecordStatus[],
): Promise<{ workspaceId: string; batchId: string; recordIds: string[] }> {
  const identity = identityRepository(db);
  const ws = await identity.createWorkspace("Synthetic workspace");
  const user = await identity.ensureUser(`synthetic-${randomBytes(4).toString("hex")}@example.test`);
  const repos = forWorkspace({ workspaceId: ws.id }, db);
  const bytes = randomBytes(16);
  const batch = await repos.batches.insert({
    kind: "master_list",
    format: "csv",
    original: bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    encoding: "utf-8",
    packId: "synthetic-pack",
    packVersion: "1.0.0",
    form: "structured",
    createdBy: user.id,
  });
  const recordIds: string[] = [];
  for (const [i, status] of statuses.entries()) {
    const r = await repos.records.insert({
      batchId: batch.id,
      location: { kind: "cell", sheet: null, row: i + 1, columns: ["A"] },
      partyRole: "creditor",
      originalLines: [`${i + 1} Synthetic Street`, "Exampletown"],
      status,
    });
    recordIds.push(r.id);
  }
  return { workspaceId: ws.id, batchId: batch.id, recordIds };
}

/** Jobs in pg-boss for one batch (any queue, any state), by the singletonKey prefix. */
export async function jobsOfBatch(
  db: Database,
  batchId: string,
): Promise<{ id: string; name: string; state: string }[]> {
  const res = await db.execute<{ id: string; name: string; state: string }>(
    sql`select id, name, state::text as state from pgboss.job where singleton_key like ${`${batchId}/%`} order by created_on`,
  );
  return res.rows;
}

/** The state of one job in queue `name`, or undefined when it is gone. */
export async function jobState(db: Database, id: string): Promise<string | undefined> {
  const res = await db.execute<{ state: string }>(
    sql`select state::text as state from pgboss.job where id = ${id}`,
  );
  return res.rows[0]?.state;
}

/** A Postgres array literal of UUIDs, bound as one text parameter and cast in SQL. */
export function pgArray(ids: readonly string[]): string {
  return `{${ids.join(",")}}`;
}
