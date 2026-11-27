// The workspace-scoped repository layer (ADR 0013, M1-03). `forWorkspace(ctx, db)` is the only way
// product code reads or writes workspace data: every query below filters by `ctx.workspaceId`,
// directly (`workspace_id` column) or through a join to the owning batch. A row of another
// workspace is never returned, and a write that would attach to another workspace's row throws
// `OutOfScopeError` before touching the database. Property `P-cross-workspace-denied` tests this.
import { and, asc, count, desc, eq, getTableColumns, gt, isNull, lt, sql } from "drizzle-orm";
import {
  apiTokens,
  auditEvents,
  batches,
  decisions,
  exportsTable,
  idempotencyKeys,
  invites,
  memberships,
  passwordResets,
  paymentFileLinks,
  preflightRuns,
  proposals,
  records,
  users,
  workspaces,
} from "../schema/index.js";
import type {
  ApiTokenRow,
  ScopedAuditEventInsert,
  AuditEventRow,
  ScopedBatchInsert,
  BatchRow,
  DecisionInsert,
  DecisionRow,
  Executor,
  ExportInsert,
  ExportRow,
  IdempotencyKeyRow,
  InviteRow,
  MembershipRole,
  MembershipRow,
  PasswordResetRow,
  PaymentFileLinkInsert,
  PaymentFileLinkRow,
  PreflightRunInsert,
  PreflightRunRow,
  ProposalInsert,
  ProposalRow,
  RecordInsert,
  RecordRow,
  WorkspaceContext,
  WorkspaceRow,
} from "./types.js";

/** A write referenced a row that is not in the context's workspace (or does not exist). */
export class OutOfScopeError extends Error {
  constructor(what: string) {
    super(`${what} is not in this workspace`);
    this.name = "OutOfScopeError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids that are not UUIDs match nothing (instead of a Postgres cast error). */
function isUuid(id: string): boolean {
  return UUID.test(id);
}

function first<T>(rows: readonly T[]): T | undefined {
  return rows[0];
}

function one<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new Error("expected one row");
  return row;
}

export interface MemberRow extends MembershipRow {
  readonly email: string;
}

/** Repositories bound to one workspace. Build with `forWorkspace`. */
export interface WorkspaceRepositories {
  readonly workspaceId: string;
  readonly workspace: {
    get(): Promise<WorkspaceRow | undefined>;
  };
  readonly memberships: {
    list(): Promise<MemberRow[]>;
    get(userId: string): Promise<MembershipRow | undefined>;
    /** Adds the user; an existing membership is left as it is. Returns the membership. */
    add(userId: string, role: MembershipRole): Promise<MembershipRow>;
    setRole(userId: string, role: MembershipRole): Promise<MembershipRow | undefined>;
  };
  readonly invites: {
    create(v: {
      email: string;
      role: MembershipRole;
      tokenHash: string;
      expiresAt: Date;
    }): Promise<InviteRow>;
    get(id: string): Promise<InviteRow | undefined>;
    list(): Promise<InviteRow[]>;
    /** Unused, unexpired invites for `email` (case-insensitive: citext). */
    pendingFor(email: string): Promise<InviteRow[]>;
  };
  readonly passwordResets: {
    /** The user must be a member of this workspace. */
    create(v: { userId: string; tokenHash: string; expiresAt: Date }): Promise<PasswordResetRow>;
    get(id: string): Promise<PasswordResetRow | undefined>;
  };
  readonly apiTokens: {
    create(v: {
      prefix: string;
      tokenHash: string;
      scopes?: string[];
      createdBy?: string | null;
    }): Promise<ApiTokenRow>;
    get(id: string): Promise<ApiTokenRow | undefined>;
    list(): Promise<ApiTokenRow[]>;
  };
  readonly batches: {
    insert(v: ScopedBatchInsert): Promise<BatchRow>;
    get(id: string): Promise<BatchRow | undefined>;
    list(): Promise<BatchRow[]>;
  };
  readonly records: {
    insert(v: RecordInsert): Promise<RecordRow>;
    get(id: string): Promise<RecordRow | undefined>;
    listByBatch(batchId: string): Promise<RecordRow[]>;
    /** Record count per status for one batch of this workspace (empty for any other batch). */
    countByStatus(batchId: string): Promise<{ status: string; n: number }[]>;
  };
  readonly proposals: {
    insert(v: ProposalInsert): Promise<ProposalRow>;
    get(id: string): Promise<ProposalRow | undefined>;
    listByRecord(recordId: string): Promise<ProposalRow[]>;
  };
  readonly decisions: {
    insert(v: DecisionInsert): Promise<DecisionRow>;
    get(id: string): Promise<DecisionRow | undefined>;
    listByRecord(recordId: string): Promise<DecisionRow[]>;
  };
  readonly auditEvents: {
    insert(v: ScopedAuditEventInsert): Promise<AuditEventRow>;
    get(id: string): Promise<AuditEventRow | undefined>;
    list(): Promise<AuditEventRow[]>;
  };
  readonly exports: {
    insert(v: ExportInsert): Promise<ExportRow>;
    get(id: string): Promise<ExportRow | undefined>;
    listByBatch(batchId: string): Promise<ExportRow[]>;
  };
  readonly preflightRuns: {
    insert(v: PreflightRunInsert): Promise<PreflightRunRow>;
    get(id: string): Promise<PreflightRunRow | undefined>;
    listByBatch(batchId: string): Promise<PreflightRunRow[]>;
  };
  readonly paymentFileLinks: {
    insert(v: PaymentFileLinkInsert): Promise<PaymentFileLinkRow>;
    get(id: string): Promise<PaymentFileLinkRow | undefined>;
    listByBatch(batchId: string): Promise<PaymentFileLinkRow[]>;
  };
  /** `Idempotency-Key` entries (ADR 0005, M1-04 middleware). */
  readonly idempotencyKeys: {
    /** Deletes the entry for `key` when it is older than `ttlHours`. */
    dropExpired(key: string, ttlHours: number): Promise<void>;
    /** Inserts the entry; false when the key is already taken. */
    claim(key: string, requestHash: string, response: unknown): Promise<boolean>;
    get(key: string): Promise<IdempotencyKeyRow | undefined>;
    store(key: string, response: unknown): Promise<void>;
    release(key: string): Promise<void>;
  };
}

/** Repositories whose every query is filtered by `ctx.workspaceId`. */
export function forWorkspace(ctx: WorkspaceContext, db: Executor): WorkspaceRepositories {
  const ws = ctx.workspaceId;
  if (!isUuid(ws)) throw new OutOfScopeError("workspace");

  const recordCols = getTableColumns(records);
  const proposalCols = getTableColumns(proposals);
  const decisionCols = getTableColumns(decisions);
  const exportCols = getTableColumns(exportsTable);
  const preflightCols = getTableColumns(preflightRuns);
  const linkCols = getTableColumns(paymentFileLinks);

  const batchInScope = async (batchId: string): Promise<boolean> =>
    isUuid(batchId) &&
    (
      await db
        .select({ id: batches.id })
        .from(batches)
        .where(and(eq(batches.id, batchId), eq(batches.workspaceId, ws)))
    ).length === 1;
  const recordInScope = async (recordId: string): Promise<boolean> =>
    isUuid(recordId) &&
    (
      await db
        .select({ id: records.id })
        .from(records)
        .innerJoin(batches, eq(batches.id, records.batchId))
        .where(and(eq(records.id, recordId), eq(batches.workspaceId, ws)))
    ).length === 1;
  const proposalInScope = async (proposalId: string): Promise<boolean> =>
    isUuid(proposalId) &&
    (
      await db
        .select({ id: proposals.id })
        .from(proposals)
        .innerJoin(records, eq(records.id, proposals.recordId))
        .innerJoin(batches, eq(batches.id, records.batchId))
        .where(and(eq(proposals.id, proposalId), eq(batches.workspaceId, ws)))
    ).length === 1;
  const userIsMember = async (userId: string): Promise<boolean> =>
    isUuid(userId) &&
    (
      await db
        .select({ u: memberships.userId })
        .from(memberships)
        .where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, userId)))
    ).length === 1;

  const idemWhere = (key: string) =>
    and(eq(idempotencyKeys.workspaceId, ws), eq(idempotencyKeys.key, key));

  return {
    workspaceId: ws,
    workspace: {
      get: async () => first(await db.select().from(workspaces).where(eq(workspaces.id, ws))),
    },

    memberships: {
      list: async () =>
        db
          .select({ ...getTableColumns(memberships), email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(eq(memberships.workspaceId, ws))
          .orderBy(asc(memberships.createdAt), asc(users.email)),
      get: async (userId) =>
        isUuid(userId)
          ? first(
              await db
                .select()
                .from(memberships)
                .where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, userId))),
            )
          : undefined,
      add: async (userId, role) => {
        await db
          .insert(memberships)
          .values({ workspaceId: ws, userId, role })
          .onConflictDoNothing();
        return one(
          await db
            .select()
            .from(memberships)
            .where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, userId))),
        );
      },
      setRole: async (userId, role) =>
        isUuid(userId)
          ? first(
              await db
                .update(memberships)
                .set({ role })
                .where(and(eq(memberships.workspaceId, ws), eq(memberships.userId, userId)))
                .returning(),
            )
          : undefined,
    },

    invites: {
      create: async (v) => one(await db.insert(invites).values({ ...v, workspaceId: ws }).returning()),
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select()
                .from(invites)
                .where(and(eq(invites.id, id), eq(invites.workspaceId, ws))),
            )
          : undefined,
      list: async () =>
        db.select().from(invites).where(eq(invites.workspaceId, ws)).orderBy(desc(invites.createdAt)),
      pendingFor: async (email) =>
        db
          .select()
          .from(invites)
          .where(
            and(
              eq(invites.workspaceId, ws),
              eq(invites.email, email),
              isNull(invites.usedAt),
              gt(invites.expiresAt, sql`now()`),
            ),
          ),
    },

    passwordResets: {
      create: async (v) => {
        if (!(await userIsMember(v.userId))) throw new OutOfScopeError("user");
        return one(await db.insert(passwordResets).values({ ...v, workspaceId: ws }).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select()
                .from(passwordResets)
                .where(and(eq(passwordResets.id, id), eq(passwordResets.workspaceId, ws))),
            )
          : undefined,
    },

    apiTokens: {
      create: async (v) =>
        one(await db.insert(apiTokens).values({ ...v, workspaceId: ws }).returning()),
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select()
                .from(apiTokens)
                .where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, ws))),
            )
          : undefined,
      list: async () =>
        db
          .select()
          .from(apiTokens)
          .where(eq(apiTokens.workspaceId, ws))
          .orderBy(desc(apiTokens.createdAt)),
    },

    batches: {
      insert: async (v) =>
        one(await db.insert(batches).values({ ...v, workspaceId: ws }).returning()),
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select()
                .from(batches)
                .where(and(eq(batches.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      list: async () =>
        db.select().from(batches).where(eq(batches.workspaceId, ws)).orderBy(desc(batches.createdAt)),
    },

    records: {
      insert: async (v) => {
        if (!(await batchInScope(v.batchId))) throw new OutOfScopeError("batch");
        return one(await db.insert(records).values(v).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select(recordCols)
                .from(records)
                .innerJoin(batches, eq(batches.id, records.batchId))
                .where(and(eq(records.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      listByBatch: async (batchId) =>
        isUuid(batchId)
          ? db
              .select(recordCols)
              .from(records)
              .innerJoin(batches, eq(batches.id, records.batchId))
              .where(and(eq(records.batchId, batchId), eq(batches.workspaceId, ws)))
          : [],
      countByStatus: async (batchId) =>
        isUuid(batchId)
          ? db
              .select({ status: records.status, n: count() })
              .from(records)
              .innerJoin(batches, eq(batches.id, records.batchId))
              .where(and(eq(records.batchId, batchId), eq(batches.workspaceId, ws)))
              .groupBy(records.status)
          : [],
    },

    proposals: {
      insert: async (v) => {
        if (!(await recordInScope(v.recordId))) throw new OutOfScopeError("record");
        return one(await db.insert(proposals).values(v).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select(proposalCols)
                .from(proposals)
                .innerJoin(records, eq(records.id, proposals.recordId))
                .innerJoin(batches, eq(batches.id, records.batchId))
                .where(and(eq(proposals.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      listByRecord: async (recordId) =>
        isUuid(recordId)
          ? db
              .select(proposalCols)
              .from(proposals)
              .innerJoin(records, eq(records.id, proposals.recordId))
              .innerJoin(batches, eq(batches.id, records.batchId))
              .where(and(eq(proposals.recordId, recordId), eq(batches.workspaceId, ws)))
              .orderBy(asc(proposals.createdAt))
          : [],
    },

    decisions: {
      insert: async (v) => {
        if (!(await recordInScope(v.recordId))) throw new OutOfScopeError("record");
        if (!(await proposalInScope(v.proposalId))) throw new OutOfScopeError("proposal");
        return one(await db.insert(decisions).values(v).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select(decisionCols)
                .from(decisions)
                .innerJoin(records, eq(records.id, decisions.recordId))
                .innerJoin(batches, eq(batches.id, records.batchId))
                .where(and(eq(decisions.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      listByRecord: async (recordId) =>
        isUuid(recordId)
          ? db
              .select(decisionCols)
              .from(decisions)
              .innerJoin(records, eq(records.id, decisions.recordId))
              .innerJoin(batches, eq(batches.id, records.batchId))
              .where(and(eq(decisions.recordId, recordId), eq(batches.workspaceId, ws)))
              .orderBy(asc(decisions.at))
          : [],
    },

    auditEvents: {
      insert: async (v) =>
        one(await db.insert(auditEvents).values({ ...v, workspaceId: ws }).returning()),
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select()
                .from(auditEvents)
                .where(and(eq(auditEvents.id, id), eq(auditEvents.workspaceId, ws))),
            )
          : undefined,
      list: async () =>
        db
          .select()
          .from(auditEvents)
          .where(eq(auditEvents.workspaceId, ws))
          .orderBy(desc(auditEvents.at)),
    },

    exports: {
      insert: async (v) => {
        if (!(await batchInScope(v.batchId))) throw new OutOfScopeError("batch");
        return one(await db.insert(exportsTable).values(v).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select(exportCols)
                .from(exportsTable)
                .innerJoin(batches, eq(batches.id, exportsTable.batchId))
                .where(and(eq(exportsTable.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      listByBatch: async (batchId) =>
        isUuid(batchId)
          ? db
              .select(exportCols)
              .from(exportsTable)
              .innerJoin(batches, eq(batches.id, exportsTable.batchId))
              .where(and(eq(exportsTable.batchId, batchId), eq(batches.workspaceId, ws)))
          : [],
    },

    preflightRuns: {
      insert: async (v) => {
        if (!(await batchInScope(v.batchId))) throw new OutOfScopeError("batch");
        return one(await db.insert(preflightRuns).values(v).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select(preflightCols)
                .from(preflightRuns)
                .innerJoin(batches, eq(batches.id, preflightRuns.batchId))
                .where(and(eq(preflightRuns.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      listByBatch: async (batchId) =>
        isUuid(batchId)
          ? db
              .select(preflightCols)
              .from(preflightRuns)
              .innerJoin(batches, eq(batches.id, preflightRuns.batchId))
              .where(and(eq(preflightRuns.batchId, batchId), eq(batches.workspaceId, ws)))
          : [],
    },

    paymentFileLinks: {
      insert: async (v) => {
        if (!(await batchInScope(v.paymentBatchId))) throw new OutOfScopeError("batch");
        if (v.masterRecordId != null && !(await recordInScope(v.masterRecordId))) {
          throw new OutOfScopeError("record");
        }
        return one(await db.insert(paymentFileLinks).values(v).returning());
      },
      get: async (id) =>
        isUuid(id)
          ? first(
              await db
                .select(linkCols)
                .from(paymentFileLinks)
                .innerJoin(batches, eq(batches.id, paymentFileLinks.paymentBatchId))
                .where(and(eq(paymentFileLinks.id, id), eq(batches.workspaceId, ws))),
            )
          : undefined,
      listByBatch: async (batchId) =>
        isUuid(batchId)
          ? db
              .select(linkCols)
              .from(paymentFileLinks)
              .innerJoin(batches, eq(batches.id, paymentFileLinks.paymentBatchId))
              .where(and(eq(paymentFileLinks.paymentBatchId, batchId), eq(batches.workspaceId, ws)))
          : [],
    },

    idempotencyKeys: {
      dropExpired: async (key, ttlHours) => {
        await db
          .delete(idempotencyKeys)
          .where(
            and(
              idemWhere(key),
              lt(idempotencyKeys.at, sql`now() - make_interval(hours => ${ttlHours})`),
            ),
          );
      },
      claim: async (key, requestHash, response) =>
        (
          await db
            .insert(idempotencyKeys)
            .values({ workspaceId: ws, key, requestHash, response })
            .onConflictDoNothing()
            .returning({ key: idempotencyKeys.key })
        ).length === 1,
      get: async (key) => first(await db.select().from(idempotencyKeys).where(idemWhere(key))),
      store: async (key, response) => {
        await db
          .update(idempotencyKeys)
          .set({ response, at: sql`now()` })
          .where(idemWhere(key));
      },
      release: async (key) => {
        await db.delete(idempotencyKeys).where(idemWhere(key));
      },
    },
  };
}
