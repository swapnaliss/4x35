/** Entity schemas: one valid and one invalid example each; Record.originalLines is readonly. */
import { describe, expect, it } from "vitest";
import {
  AuditEventSchema,
  BatchSchema,
  DecisionSchema,
  type DomainRecord,
  MembershipSchema,
  RecordSchema,
  UserSchema,
  WorkspaceSchema,
} from "../src/index.js";

const ID = "00000000-0000-4000-8000-000000000003";
const SHA = "a".repeat(64);
const AT = new Date("2026-11-26T00:00:00Z");

// Synthetic values only (data policy).
const valid = {
  workspace: {
    id: ID,
    name: "Demo AP",
    settings: { fourEyes: true },
    isSandbox: true,
    createdAt: AT,
  },
  user: { id: ID, email: "reviewer@example.test", createdAt: AT },
  membership: { workspaceId: ID, userId: ID, role: "reviewer" },
  batch: {
    id: ID,
    workspaceId: ID,
    kind: "master_list",
    format: "csv",
    original: new Uint8Array([1]),
    sha256: SHA,
    encoding: "utf-8",
    delimiter: ",",
    eol: "lf",
    columnMap: null,
    pack: { id: "generic", version: "1.0.0" },
    form: "hybrid",
    status: "uploaded",
    failureReason: null,
    locked: false,
    createdBy: ID,
    createdAt: AT,
    purgeAfter: AT,
  },
  record: {
    id: ID,
    batchId: ID,
    location: { kind: "cell", sheet: null, row: 2, columns: ["addr1"] },
    partyRole: "creditor",
    name: "Example GmbH",
    originalLines: ["Musterweg 12", "10115 Berlin"],
    countryHint: "DE",
    status: "pending",
    version: 0,
  },
  decision: {
    id: ID,
    recordId: ID,
    proposalId: ID,
    action: "edit",
    fields: [{ element: "TwnNm", index: 0, value: "Berlin" }],
    actorId: ID,
    actorKind: "session",
    at: AT,
  },
  audit: {
    id: ID,
    workspaceId: ID,
    actorId: ID,
    actorKind: "token",
    action: "decision.recorded",
    subject: `record:${ID}`,
    dataHash: SHA,
    at: AT,
  },
};

describe("entity schemas", () => {
  it.each([
    ["Workspace", WorkspaceSchema, valid.workspace, { ...valid.workspace, id: "x" }],
    ["User", UserSchema, valid.user, { ...valid.user, email: "not-an-email" }],
    ["Membership", MembershipSchema, valid.membership, { ...valid.membership, role: "admin" }],
    ["Batch", BatchSchema, valid.batch, { ...valid.batch, status: "done" }],
    ["Record", RecordSchema, valid.record, { ...valid.record, countryHint: "DEU" }],
    ["Decision", DecisionSchema, valid.decision, { ...valid.decision, action: "delete" }],
    ["AuditEvent", AuditEventSchema, valid.audit, { ...valid.audit, dataHash: "ABC" }],
  ] as const)("%s accepts a valid example and rejects an invalid one", (_n, schema, ok, bad) => {
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse(bad).success).toBe(false);
  });

  it("defaults the LLM opt-in to off (ADR 0014)", () => {
    expect(WorkspaceSchema.parse(valid.workspace).settings.llmOptIn).toBe(false);
  });

  it("Record.originalLines is readonly at the type level and frozen at run time", () => {
    const r: DomainRecord = RecordSchema.parse(valid.record);
    // @ts-expect-error original lines are readonly
    expect(() => r.originalLines.push("x")).toThrow(TypeError);
  });
});
