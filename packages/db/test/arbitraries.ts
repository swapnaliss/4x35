/**
 * Domain arbitraries for P1 (P-entity-roundtrip), following .kiro/steering/specs.md: address text
 * with whitespace runs (3+), tabs and non-breaking spaces; letters from CJK, Devanagari, Arabic,
 * Cyrillic and Latin with diacritics, in NFC and NFD; lengths around 15/16/17, 34/35/36, 69/70/71.
 * Never bare `fc.string()`.
 *
 * Postgres `text` and `jsonb` cannot hold U+0000 or a lone surrogate, so no arbitrary produces them
 * (BL-01: the core string schemas still admit both; ingest must reject them).
 */
import {
  type AuditEvent,
  AuditEventSchema,
  BATCH_FORMATS,
  BATCH_KINDS,
  BATCH_STATES,
  type Batch,
  BatchSchema,
  buildProposal,
  type Candidate,
  DECISION_ACTIONS,
  type Decision,
  DecisionSchema,
  type DomainRecord,
  ELEMENT_MAX_OCCURS,
  ELEMENTS,
  MEMBERSHIP_ROLES,
  type Membership,
  MembershipSchema,
  nfc,
  RECORD_STATES,
  RecordSchema,
  recordInput,
  TARGET_FORMS,
  TRANSFORMS,
  type User,
  UserSchema,
  type Workspace,
  WorkspaceSchema,
} from "@4x35/core";
import fc from "fast-check";
import { type PersistedProposal, storedProposal } from "../src/mappers/review.js";

/** numRuns for P1: FC_NUM_RUNS, never below the ticket's 200. */
export const NUM_RUNS = Math.max(200, Number(process.env.FC_NUM_RUNS ?? 0) || 0);

const chars = (s: string) => fc.constantFrom(...[...s]);
const latin = chars("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz");
const latinDiacritic = chars("ÄÖÜäöüßÉÈÊéèêÇçÑñÅåØøŁłŚśŽžĞğİıŐőŰűĀāẞ");
const cjk = chars("東京都千代田区丸の内一丁目二番地上海市浦东新区北京路大阪府");
const devanagari = chars("मुंबईनगरदिल्लीमार्गक्षत्रज्ञ");
const arabic = chars("شارعالملكفهدالرياضدبيمدينة");
const cyrillic = chars("МоскваулицаТверскаядомСанктПетербургЁё");
const digit = chars("0123456789");
const punct = chars(",.-/#'()&");
/** A character outside the BMP (a surrogate pair), never a lone surrogate. */
const astral = chars("𠮷𩸽😀");

const letter = fc.oneof(
  { weight: 4, arbitrary: latin },
  { weight: 3, arbitrary: latinDiacritic },
  { weight: 2, arbitrary: cjk },
  { weight: 1, arbitrary: devanagari },
  { weight: 1, arbitrary: arabic },
  { weight: 2, arbitrary: cyrillic },
  { weight: 2, arbitrary: digit },
  { weight: 1, arbitrary: punct },
  { weight: 1, arbitrary: astral },
);

const whitespace = fc.oneof(
  { weight: 4, arbitrary: fc.constant(" ") },
  {
    weight: 2,
    arbitrary: fc.array(chars(" \t  　"), { minLength: 1, maxLength: 5 }).map((a) => a.join("")),
  },
  { weight: 1, arbitrary: fc.constantFrom("   ", "\t\t\t", "   ") },
);

const word = fc.array(letter, { minLength: 1, maxLength: 12 }).map((a) => a.join(""));
const normalForm = (s: string) => fc.constantFrom(s.normalize("NFC"), s.normalize("NFD"));

/** One free-text address line, with optional leading/trailing whitespace. */
export const addressLine: fc.Arbitrary<string> = fc
  .tuple(
    fc.option(whitespace, { nil: "" }),
    fc.array(fc.tuple(word, whitespace), { minLength: 0, maxLength: 6 }),
    word,
    fc.option(whitespace, { nil: "" }),
  )
  .map(([lead, parts, last, trail]) => lead + parts.map(([w, s]) => w + s).join("") + last + trail)
  .chain(normalForm);

/** Exactly `n` UTF-16 code units of address letters (BMP only), for the limit boundaries. */
const ofLength = (n: number) =>
  fc
    .array(fc.oneof(latin, latinDiacritic, cjk, cyrillic, digit), { minLength: n, maxLength: n })
    .map((a) => a.join(""));

/** Non-empty text: an address line, or a string at 15/16/17, 34/35/36 or 69/70/71. */
export const text: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: addressLine },
  { weight: 1, arbitrary: fc.constantFrom(15, 16, 17, 34, 35, 36, 69, 70, 71).chain(ofLength) },
);

const hex64 = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join(""));

/** Millisecond dates (timestamptz(3) keeps exactly these), 2000–2099. */
const date = fc
  .integer({ min: Date.UTC(2000, 0, 1), max: Date.UTC(2099, 11, 31) })
  .map((ms) => new Date(ms));

const DAY_MS = 86_400_000;

const nullable = <T>(a: fc.Arbitrary<T>) => fc.option(a, { nil: null });

/** A valid address that `z.email()` accepts; mixed case, so citext's case handling is exercised. */
const email = fc
  .tuple(
    fc
      .stringMatching(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,14}[A-Za-z0-9]$/)
      .filter((s) => !s.includes("..")),
    fc.stringMatching(/^[A-Za-z][A-Za-z0-9-]{0,10}[A-Za-z0-9]$/),
    fc.constantFrom("test", "example", "invalid"),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Non-negative integers inside Postgres `integer`. */
const int4 = fc.integer({ min: 0, max: 2_147_483_647 });

const workspace: fc.Arbitrary<Workspace> = fc
  .record({
    id: fc.uuid(),
    name: text,
    fourEyes: fc.boolean(),
    llmOptIn: fc.boolean(),
    quotas: fc.dictionary(fc.constantFrom("records", "uploads", "llm_tokens", "exports"), int4),
    isSandbox: fc.boolean(),
    createdAt: date,
  })
  .map(({ fourEyes, llmOptIn, quotas, ...w }) =>
    WorkspaceSchema.parse({ ...w, settings: { fourEyes, llmOptIn, quotas } }),
  );

const user: fc.Arbitrary<User> = fc
  .record({ id: fc.uuid(), email, createdAt: date })
  .map((u) => UserSchema.parse(u));

const location = fc.oneof(
  fc.record({
    kind: fc.constant("cell" as const),
    sheet: nullable(text),
    row: int4,
    columns: fc.array(text, { maxLength: 4 }),
  }),
  fc
    .record({
      kind: fc.constant("xml" as const),
      xpath: fc.constantFrom(
        "/Document/CstmrCdtTrfInitn/PmtInf[1]/CdtTrfTxInf[1]/Cdtr/PstlAdr",
        "/Document/CstmrCdtTrfInitn/PmtInf[2]/Dbtr/PstlAdr",
      ),
      byteStart: int4,
      length: int4,
    })
    .map(({ length, ...l }) => ({ ...l, byteEnd: l.byteStart + length })),
  fc.record({
    kind: fc.constant("mt" as const),
    message: int4,
    field: fc.constantFrom("50K", "59", "50F"),
  }),
);

const elementRef = fc
  .constantFrom(...ELEMENTS)
  .chain((element) =>
    fc
      .integer({ min: 0, max: ELEMENT_MAX_OCCURS[element] - 1 })
      .map((index) => ({ element, index })),
  );

/** Spans of `t` that never split a surrogate pair. */
function spanOf(t: string) {
  const isHigh = (i: number) => i > 0 && i <= t.length && /[\ud800-\udbff]/.test(t[i - 1] ?? "");
  return fc.tuple(fc.nat({ max: t.length - 1 }), fc.nat({ max: t.length - 1 })).map(([a, b]) => {
    let start = Math.min(a, b);
    let end = Math.max(a, b) + 1;
    if (isHigh(start)) start -= 1;
    if (end < t.length && isHigh(end)) end += 1;
    return { start, end };
  });
}

/** Candidates for a record: real spans and transforms, plus provenances that are never auto-approvable. */
function candidates(lines: readonly string[]): fc.Arbitrary<Candidate[]> {
  const t = nfc(recordInput(lines));
  const span = spanOf(t);
  const one: fc.Arbitrary<Candidate> = fc.oneof(
    fc.tuple(elementRef, span).map(([element, s]) => ({
      element,
      value: t.slice(s.start, s.end),
      provenance: { kind: "span" as const, span: s },
    })),
    fc.tuple(elementRef, span, fc.constantFrom(...TRANSFORMS)).map(([element, s, tr]) => ({
      element,
      value: tr.apply(t.slice(s.start, s.end)),
      provenance: {
        kind: "transform" as const,
        transform: { id: tr.id, version: tr.version },
        source: s,
      },
    })),
    fc.tuple(elementRef, text, fc.uuid()).map(([element, value, actorId]) => ({
      element,
      value,
      provenance: { kind: "human" as const, actorId },
    })),
    fc.tuple(elementRef, text, span).map(([element, value, source]) => ({
      element,
      value,
      provenance: {
        kind: "dataset" as const,
        datasetId: "geonames-postal:DE",
        recordKey: "DE:10115",
        unique: true as const,
        source,
      },
    })),
  );
  return fc.array(one, { maxLength: 8 });
}

/** A full graph of valid core entities that reference each other, written in this order. */
export interface EntityGraph {
  readonly workspace: Workspace;
  readonly user: User;
  readonly membership: Membership;
  readonly batch: Batch;
  readonly record: DomainRecord;
  readonly proposal: PersistedProposal;
  readonly decision: Decision;
  readonly audit: AuditEvent;
}

export const entityGraph: fc.Arbitrary<EntityGraph> = fc
  .record({ workspace, user, role: fc.constantFrom(...MEMBERSHIP_ROLES) })
  .chain(({ workspace: w, user: u, role }) =>
    fc
      .record({
        batch: fc
          .record({
            id: fc.uuid(),
            kind: fc.constantFrom(...BATCH_KINDS),
            format: fc.constantFrom(...BATCH_FORMATS),
            original: fc.uint8Array({ maxLength: 512 }),
            sha256: hex64,
            encoding: fc.constantFrom("utf-8", "windows-1252", "shift_jis", "utf-16le"),
            delimiter: nullable(fc.constantFrom(",", ";", "\t", "|")),
            eol: nullable(fc.constantFrom("lf" as const, "crlf" as const, "cr" as const)),
            columnMap: nullable(
              fc.dictionary(text, fc.constantFrom("name", "line1", "line2", "country")),
            ),
            pack: fc.record({
              id: fc.constantFrom("cbpr-plus", "generic", "nordic-se"),
              version: fc.constantFrom("2025.1", "1.0.0"),
            }),
            form: fc.constantFrom(...TARGET_FORMS),
            status: fc.constantFrom(...BATCH_STATES),
            failureReason: nullable(text),
            locked: fc.boolean(),
            createdAt: date,
          })
          .map((b) =>
            BatchSchema.parse({
              ...b,
              workspaceId: w.id,
              createdBy: u.id,
              purgeAfter: new Date(b.createdAt.getTime() + 30 * DAY_MS),
            }),
          ),
        recordId: fc.uuid(),
        lines: fc.array(addressLine, { minLength: 0, maxLength: 4 }),
      })
      .chain(({ batch, recordId, lines }) =>
        fc
          .record({
            location,
            partyRole: fc.constantFrom("creditor", "debtor", "ultimate_creditor", "supplier"),
            name: nullable(text),
            countryHint: nullable(fc.stringMatching(/^[A-Z]{2}$/)),
            status: fc.constantFrom(...RECORD_STATES),
            version: int4,
            cands: candidates(lines.length === 0 ? ["x"] : lines),
            proposalId: fc.uuid(),
            confidence: nullable(
              fc.double({ min: 0, max: 1, noNaN: true }).map((x) => (x === 0 ? 0 : x)),
            ),
            proposalAt: date,
            decision: fc.record({
              id: fc.uuid(),
              action: fc.constantFrom(...DECISION_ACTIONS),
              fields: nullable(
                fc.array(
                  fc.tuple(elementRef, text).map(([r, value]) => ({ ...r, value })),
                  { maxLength: 5 },
                ),
              ),
              actorId: fc.uuid(),
              actorKind: fc.constantFrom("session" as const, "token" as const),
              at: date,
            }),
            audit: fc.record({
              id: fc.uuid(),
              actorId: fc.uuid(),
              actorKind: fc.constantFrom("session" as const, "token" as const),
              action: fc.constantFrom("batch.uploaded", "decision.recorded", "export.created"),
              subject: text,
              dataHash: hex64,
              at: date,
            }),
          })
          .map(({ cands, proposalId, confidence, proposalAt, decision, audit, ...r }) => {
            const record = RecordSchema.parse({
              ...r,
              id: recordId,
              batchId: batch.id,
              originalLines: lines,
            });
            const built = buildProposal(
              { id: record.id, originalLines: lines.length === 0 ? ["x"] : lines },
              batch.pack,
              cands,
            );
            return {
              workspace: w,
              user: u,
              membership: MembershipSchema.parse({ workspaceId: w.id, userId: u.id, role }),
              batch,
              record,
              proposal: {
                id: proposalId,
                stored: storedProposal(built),
                confidence,
                createdAt: proposalAt,
              },
              decision: DecisionSchema.parse({ ...decision, recordId: record.id, proposalId }),
              audit: AuditEventSchema.parse({ ...audit, workspaceId: w.id }),
            };
          }),
      ),
  );
