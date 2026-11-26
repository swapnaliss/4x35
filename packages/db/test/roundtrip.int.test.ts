/**
 * P1 (P-entity-roundtrip), .kiro/specs/persistence/design.md:
 *   FOR ALL valid core entities (Workspace, User, Membership, Batch, Record, StoredProposal,
 *   Decision, AuditEvent), writing them through the mappers and reading them back SHALL give values
 *   equal to the originals.
 *
 * Planted bug (recorded before the real mapper was restored, .kiro/steering/specs.md):
 *   recordFromRow returned `originalLines: row.originalLines.map((l) => l.normalize("NFC"))`.
 *   P1 failed: see PLANTED_BUG below for the seed, run count and counterexample.
 */
import { and, eq } from "drizzle-orm";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditEventFromRow,
  auditEventToRow,
  batchFromRow,
  batchToRow,
  decisionFromRow,
  decisionToRow,
  membershipFromRow,
  membershipToRow,
  proposalFromRow,
  proposalToRow,
  recordFromRow,
  recordToRow,
  userFromRow,
  userToRow,
  workspaceFromRow,
  workspaceToRow,
} from "../src/mappers/index.js";
import {
  auditEvents,
  batches,
  decisions,
  memberships,
  proposals,
  records,
  users,
  workspaces,
} from "../src/schema/index.js";
import { type EntityGraph, entityGraph, NUM_RUNS } from "./arbitraries.js";
import { createTestDatabase, hasDatabase, type TestDb } from "./harness.js";

/** Recorded failure of the planted bug (see the file header). */
export const PLANTED_BUG = {
  bug: 'recordFromRow: originalLines.map((l) => l.normalize("NFC"))',
  seed: -1730475784,
  failedAfterRuns: 1,
  counterexample:
    'record.originalLines = ["A\\u0308" + "0"] (NFD "Ä0"): read back as NFC, so the stored original changed',
};

class Rollback extends Error {}

describe.skipIf(!hasDatabase)("P1 (P-entity-roundtrip): entities survive the mappers", () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDatabase("roundtrip");
  });
  afterAll(async () => {
    await t?.dropAndClose();
  });

  /** Writes the graph in one transaction, reads every entity back, then rolls back. */
  async function roundTrip(g: EntityGraph): Promise<EntityGraph> {
    let read: EntityGraph | undefined;
    try {
      await t.db.transaction(async (tx) => {
        await tx.insert(workspaces).values(workspaceToRow(g.workspace));
        await tx.insert(users).values(userToRow(g.user));
        await tx.insert(memberships).values(membershipToRow(g.membership));
        await tx.insert(batches).values(batchToRow(g.batch));
        await tx.insert(records).values(recordToRow(g.record));
        await tx.insert(proposals).values(proposalToRow(g.proposal));
        await tx.insert(decisions).values(decisionToRow(g.decision));
        await tx.insert(auditEvents).values(auditEventToRow(g.audit));

        const one = <T>(rows: T[]): T => {
          expect(rows).toHaveLength(1);
          return rows[0] as T;
        };
        read = {
          workspace: workspaceFromRow(
            one(await tx.select().from(workspaces).where(eq(workspaces.id, g.workspace.id))),
          ),
          user: userFromRow(one(await tx.select().from(users).where(eq(users.id, g.user.id)))),
          membership: membershipFromRow(
            one(
              await tx
                .select()
                .from(memberships)
                .where(
                  and(
                    eq(memberships.workspaceId, g.membership.workspaceId),
                    eq(memberships.userId, g.membership.userId),
                  ),
                ),
            ),
          ),
          batch: batchFromRow(
            one(await tx.select().from(batches).where(eq(batches.id, g.batch.id))),
          ),
          record: recordFromRow(
            one(await tx.select().from(records).where(eq(records.id, g.record.id))),
          ),
          proposal: proposalFromRow(
            one(await tx.select().from(proposals).where(eq(proposals.id, g.proposal.id))),
          ),
          decision: decisionFromRow(
            one(await tx.select().from(decisions).where(eq(decisions.id, g.decision.id))),
          ),
          audit: auditEventFromRow(
            one(await tx.select().from(auditEvents).where(eq(auditEvents.id, g.audit.id))),
          ),
        };
        throw new Rollback();
      });
    } catch (err) {
      if (!(err instanceof Rollback)) throw err;
    }
    if (read === undefined) throw new Error("round trip produced nothing");
    return read;
  }

  it(`P1 (P-entity-roundtrip): write → read is the identity (${NUM_RUNS} runs)`, async () => {
    await fc.assert(
      fc.asyncProperty(entityGraph, async (g) => {
        expect(await roundTrip(g)).toEqual(g);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
