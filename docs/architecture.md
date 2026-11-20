# 4x35 architecture

The system design for 4x35. It covers how free-text payment addresses become ISO 20022 structured
addresses that a person has checked, and how payment files are pre-flighted against published bank
rules. Each decision is recorded once in [`adr/`](adr/); this page links to them and does not repeat
them.

## 1. Requirements

**K** = known, with a source. **A** = assumed, with how it gets validated.

| # | Requirement | Kind |
|---|---|---|
| R1 | Inputs: CSV/XLSX up to 10 MB and 20,000 rows; pain.001.001.03 and .09 (read and write), .12 (read); MT101 (fields 50/59, 4 × 35 lines). Typical SME list: 100–5,000 rows | A: user outreach (M0-01), load spike (M0-09) |
| R2 | Health report p95 ≤ 30 s for 500 rows and ≤ 5 min for 20,000 rows; review action p95 ≤ 300 ms; pre-flight of 500 transactions ≤ 10 s | A: load test (M3-08) |
| R3 | Launch: ≤ 50 workspaces, ≤ 20 concurrent users, ≤ 100k rows/day. 100×: 5,000 workspaces, 10M rows/day | A |
| R4 | 99% availability (single region, best effort); RPO 24 h; RTO 4 h; reachable until 29 Jan 2027 | K: hackathon rules §4 |
| R5 | Relational data; uploads and derived records deleted after 30 days; audit hashes kept. Addresses are personal data (GDPR, DPDP); demo data is synthetic | K: law; PROJECT.md §9.1 |
| R6 | Correctness: original data is immutable; every proposed value has valid provenance (§3); every exported field fits its XSD length and the pack's character set; same input + same pack version → same output | K: domain |
| R7 | Unicode input (Latin, CJK, Devanagari, Arabic, Cyrillic); output charset per pack with deterministic transliteration; i18n keys; WCAG 2.2 AA | K: ISO 20022 CBPR+ charset; WCAG |
| R8 | Authenticated, invite-only workspaces; roles owner and reviewer; server-side authZ; rate limits; append-only audit; no file content in logs | K: data is personal |
| R9 | Hosting about $32/month; LLM ≤ $10/month at launch | K: approved budget |
| R10 | Local fast check ≤ 2 min; PR CI ≤ 5 min; environment reset ≤ 2 min | A: measured in M0-05 |

## 2. Domain model

### Modules (bounded contexts)
Dependencies point inward to `packages/core`, which is pure and does no I/O.

| Module | Owns |
|---|---|
| Ingest | parsing CSV/XLSX/pain.001/MT101 into Records with locations (row/column, XPath + byte range, MT field); column mapping; the original bytes |
| Structuring | candidate generation (deterministic parsers, dataset lookups), optional LLM labelling through an adapter, the provenance checker, confidence |
| Rules | the rule vocabulary (pure functions) and versioned packs (data); per-message-version element map |
| Review | Decisions, bulk approve, four-eyes, record state |
| Linking | PaymentFileLink: approved master-list addresses → payment-file parties |
| Pre-flight & Export | running packs over a payment file; building artefacts |
| Identity | users, workspaces, memberships, invites, sessions, API tokens |
| Audit | append-only events |

### Entities and invariants
- **Workspace, User, Membership** (`owner | reviewer`), **Invite**, **Session**, **ApiToken**
  (hashed, prefix `4x35_`, scopes, expiry, revocation).
- **Batch**: one upload. Kind `master_list | payment_file`, format, original bytes (immutable),
  sha256, encoding/delimiter/EOL, column map, `packId@version`, target form `structured | hybrid`.
  Unique `(workspace, sha256, pack, form)`, so a repeated upload is idempotent.
- **Record**: batch, location, party role, name, original lines (immutable), country hint,
  `version` (optimistic concurrency).
- **Proposal**: record, pack version, `fields[] {element, value, provenance, confidence}`,
  `findings[] {ruleId, severity reject|strip|warn, message}`. A Proposal can only be built through a
  constructor that rejects any value without valid provenance (R6).
- **Decision** (append-only): record, proposal version, action `approve | edit | unknown | reopen`,
  fields after edit, actor, actor kind `session | token`, time.
- **PaymentFileLink**: payment-file party ↔ master-list record by IBAN/account + normalised name;
  status `matched | ambiguous | none`; ambiguous and none go to review.
- **PreflightRun**: batch, pack version, per-transaction results. Immutable.
- **Export**: batch, artefacts, sha256, actor, time.
- **AuditEvent** (append-only): actor, action, subject, time, data hash.

### Provenance (the core invariant)
Every proposed value has exactly one of these:

| Kind | Meaning | Auto-approvable? |
|---|---|---|
| `span` | a substring of the NFC-normalised input | yes, if validators agree |
| `transform` | a span changed by an entry in the closed, versioned transform table (NFC, case, whitespace, postcode format, ISO 9 Cyrillic, Latin-ASCII folding where the pack charset requires it, `country-alias` to ISO 3166) | yes, if validators agree |
| `dataset` | a **unique** dataset match (GeoNames, chromium-i18n, Japan Post) backed by an input span; the record is cited | never |
| `inferred` | derived, for example country from postcode shape | never |
| `human` | a reviewer's edit in the UI | — |
| `external` | an edit through an API token; needs a UI reviewer's approval | never |

Values are never truncated: if a value is too long, that is a finding. An LLM-labelled field is
auto-approvable only when the deterministic validators agree (postcode regex, known town, country
match).

### State machines
```
Batch:  uploaded → parsing → parsed → structuring → ready_for_review ⇄ reviewed → exported
        (any active state) → failed(reason)      exported → exported (new Export row)
        (after 30 days, unless locked or a judge sandbox) → purged (tombstone)

Record: pending → proposed → auto_approvable | needs_review | already_valid
        auto_approvable | needs_review → approved | edited | unknown
        approved | edited | unknown → needs_review   (reopen)

Job:    queued → active → completed | failed (retry ≤ 3, jittered backoff) → dead_letter
```

### Events
Each event is written in the same transaction as its state change, and pg-boss jobs are enqueued
in that transaction too. Handlers are idempotent, keyed by `(batch, pack, step, chunk)`.
`BatchUploaded → BatchParsed → StructuringCompleted → DecisionRecorded → BatchReviewed →
PaymentFileLinked → PreflightCompleted → ExportCreated`.

## 3. Decisions

| # | Area | Decision | ADR |
|---|---|---|---|
| 1 | Style | Modular monolith in npm workspaces, pure core | [0001](adr/0001-modular-monolith.md) |
| 2 | Runtime | Node 24 + TypeScript 6.0.3, ESM | [0002](adr/0002-node-typescript.md) |
| 3 | Data | Postgres + Drizzle; uploads as `bytea` | [0003](adr/0003-postgres-drizzle.md) |
| 4 | Consistency | Single primary; transactional decisions and exports | [0004](adr/0004-consistency.md) |
| 5 | API | REST via Hono + zod-openapi; idempotency keys; problem+json | [0005](adr/0005-rest-api.md) |
| 6 | Async | pg-boss, in-transaction enqueue, chunks ≤ 200, polling | [0006](adr/0006-jobs-pg-boss.md) |
| 7 | Structuring | Deterministic first; datasets on unique match | [0007](adr/0007-deterministic-structuring.md) |
| 8 | Provenance | Six provenance kinds, closed transform table, never truncate | [0008](adr/0008-provenance.md) |
| 9 | Rule packs | Versioned JSON packs on one rule vocabulary; element map per message version | [0009](adr/0009-rule-packs.md) |
| 10 | XML | Position-reporting SAX + byte splice; xmllint-wasm XSD check | [0010](adr/0010-xml-byte-splice.md) |
| 11 | Spreadsheets | SheetJS 0.20.3 + papaparse; encoding round-trip | [0011](adr/0011-spreadsheet-round-trip.md) |
| 12 | Frontend | React 19 SPA, Vite, TanStack, Tailwind + shadcn | [0012](adr/0012-react-spa.md) |
| 13 | Auth | Invite-only, argon2id, server sessions, scoped tokens, four-eyes | [0013](adr/0013-auth.md) |
| 14 | AI | One opt-in LLM step that labels substrings; cached; capped | [0014](adr/0014-llm-span-labeller.md) |
| 15 | Observability | pino + correlation IDs; job timings in the DB | [0015](adr/0015-observability.md) |
| 16 | Delivery | Docker + `render.yaml`; GitHub Actions | [0016](adr/0016-delivery.md) |
| 17 | Hosting | Render Frankfurt, 1 CPU / 2 GB + Postgres | [0017](adr/0017-hosting-render.md) |
| 18 | Global | UTF-8, i18n keys, deterministic transliteration | [0018](adr/0018-globalisation.md) |
| 19 | Kiro | Specs, steering, hooks, agent, MCP, power, Crew app | [0019](adr/0019-kiro-surfaces.md) |
| 20 | Testing | vitest, fast-check, Postgres integration, Playwright, evals | [0020](adr/0020-testing-evals.md) |
| 21 | Licence | Apache-2.0 + NOTICE for CC-BY data | [0021](adr/0021-licence.md) |
| 22 | Linking | PaymentFileLink by IBAN/account + normalised name | [0022](adr/0022-payment-file-link.md) |
| 23 | Retention | 30-day purge with cascade; audit hashes kept | [0023](adr/0023-retention.md) |

## 4. System diagram

```
                Browser (React SPA)                    Crew app (own repo, chat channels)
                      │ HTTPS, session cookie + CSRF          │ HTTPS, scoped API token
══════════════════════╪═══════════ trust boundary ════════════╪═════════════════════════
┌──────────────────── Render, Frankfurt: one container (MODE=all) ───────────────────┐
│  Hono API ── authN/authZ ── rate limits ── zod validation                           │
│     │                                                                               │
│     ├── Ingest (worker threads with resourceLimits + timeout)                       │
│     ├── Review · Linking · Pre-flight & Export · Identity · Audit                   │
│     │            │                                                                  │
│     │      packages/core (pure): structuring · rules · provenance checker           │
│     │            ▲                                                                  │
│     └── pg-boss worker (chunks ≤ 200) ──┘── LLM adapter ── cache ─────────────┐     │
└────────────────────────────┬────────────────────────────────────────────────┼─────┘
                             ▼                                                ▼ opt-in per workspace
             Render Postgres 17 (data, jobs, audit, GeoNames/JP datasets)   Anthropic API
                                                                            (trust boundary)
Local only, no network: MCP server (stdio) and Kiro power, with bundled rule packs
```

## 5. Data model

| Table | Key columns | Notes |
|---|---|---|
| `workspaces` | id, name, settings (four_eyes, llm_opt_in, quotas), is_sandbox | |
| `users` | id, email (unique, citext), password_hash, created_at | argon2id |
| `memberships` | workspace_id, user_id, role | PK (workspace_id, user_id) |
| `invites` | id, workspace_id, email, role, token_hash, expires_at, used_at | one-time |
| `sessions` | id_hash, user_id, csrf_secret, expires_at | httpOnly cookie |
| `api_tokens` | id, workspace_id, prefix, token_hash, scopes[], expires_at, revoked_at | |
| `batches` | id, workspace_id, kind, format, original bytea, sha256, encoding, delimiter, eol, column_map jsonb, pack_id, pack_version, form, status, locked, created_by, created_at, purge_after | unique (workspace_id, sha256, pack_id, pack_version, form) |
| `records` | id, batch_id, location jsonb, party_role, name, original_lines text[], country_hint, status, version | index (batch_id, status) |
| `proposals` | id, record_id, pack_version, fields jsonb, findings jsonb, confidence, created_at | latest per record |
| `decisions` | id, record_id, proposal_id, action, fields jsonb, actor_id, actor_kind, at | append-only |
| `payment_file_links` | id, payment_batch_id, party_location, master_record_id, match_key, status | |
| `preflight_runs` | id, batch_id, pack_version, results jsonb, summary, at | immutable |
| `exports` | id, batch_id, kind, bytes bytea, sha256, actor_id, at | |
| `audit_events` | id, workspace_id, actor_id, actor_kind, action, subject, data_hash, at | append-only (no UPDATE/DELETE grant) |
| `llm_cache` | key (record hash, prompt version, model), response jsonb, tokens, cost, at | determinism |
| `llm_usage` | workspace_id, day, tokens, cost | caps |
| `idempotency_keys` | key, workspace_id, request_hash, response, at | 24 h |
| `job_timings` | job_id, kind, batch_id, chunk, ms, outcome | observability |
| `geonames_postal`, `jp_post` | country, postcode, place, admin… | seed, index (country, postcode) |
| pg-boss schema | managed by pg-boss | jobs, dead letters |

## 6. Events and real-time
No push channel. The UI polls batch status, which reads counts and the latest job state. Events are
rows written in the state-change transaction, and jobs are enqueued in that same transaction, so no
separate outbox relay is needed ([0006](adr/0006-jobs-pg-boss.md)).

## 7. Data and consistency
- One Postgres primary. Decisions, bulk approvals and exports each run in one transaction.
- Optimistic concurrency on `records.version`: a stale write returns 409. Bulk approve sends
  `(id, proposalVersion)` pairs and reports per-record results.
- Idempotency: uploads are deduplicated by content; POSTs take an `Idempotency-Key` header; job
  handlers are keyed by `(batch, pack, step, chunk)`.
- Original bytes are never modified. Exports are new rows.
- Reference datasets (GeoNames, Japan Post) are global and read-only, served by a dataset repository outside the workspace scope; every other query is workspace-scoped.

## 8. Security (STRIDE)

| Threat | Control |
|---|---|
| Spoofing | argon2id, server sessions, invite-only signup, admin-issued one-time reset links, scoped API tokens with expiry |
| Tampering | CSRF tokens on mutations; zod validation; optimistic concurrency; append-only decisions and audit (no UPDATE/DELETE grant) |
| Repudiation | audit events with actor and actor kind; `external` provenance for token edits; four-eyes option |
| Information disclosure | every query scoped by `workspace_id` in a repository layer that needs a workspace context; authZ matrix test on every endpoint, including bulk ID arrays; no file content in logs; chat replies carry counts only, and review links need a login |
| Denial of service | size and row limits; zip central-directory checks (ratio, entry count, size); parsing in worker threads with `resourceLimits` + timeout; rate limits on login, upload and API; per-workspace quotas; LLM spend caps |
| Elevation of privilege | role checks in middleware and at the query level; token scopes (the Crew token can upload and read summaries only) |
| File attacks | reject `<!DOCTYPE` (XXE); xmllint with no network; XLSX book type only; CSV formula-injection escaping on new values only |
| Secrets | Render env vars; `.env` never tracked; gitleaks in CI; token prefix `4x35_` so scanners detect leaks |

## 9. Reliability, observability and SLOs
- **SLOs**: health report p95 ≤ 30 s for 500 rows; review action p95 ≤ 300 ms; job failure rate < 1%.
- **Logs**: pino JSON with request and job correlation IDs; no file content ([0015](adr/0015-observability.md)).
- **Metrics**: `job_timings` table and the dead-letter view in admin.
- **Alerts**: Render health check, plus a daily synthetic run of the core flow on a sandbox workspace.
- **Backups**: Render daily backups (RPO 24 h); restore drill documented (RTO 4 h).
- **Degradation**: the LLM is off or failing → records go to `needs_review` with the deterministic
  partial; a dataset is missing → that provenance kind is not offered.

## 10. Agent architecture
Not an agent. It is a deterministic workflow with one optional LLM step ([0014](adr/0014-llm-span-labeller.md)).
- **Input guardrail**: address lines only (names dropped); the prompt treats content as data.
- **Output guardrail**: a zod schema of `{label, substring}`. Each substring must occur exactly once
  in the NFC input, otherwise review. Then the provenance checker runs.
- **No tools, no actions.** Circuit breakers: per-batch token cap, daily spend cap, 20 s timeout,
  2 retries.
- **Determinism**: responses cached by `(record hash, prompt version, model)`.
- **Governance**: off by default per workspace; sub-processor disclosed in the privacy notice;
  every call traced in `llm_usage` (model, tokens, cost, latency).
- **Evals**: on recorded responses in CI (M2-25), plus a separate live eval (M3-11).

## 11. Scaling story and cost at 100×

| Load | Shape | Cost/month |
|---|---|---|
| Launch (R3) | 1 container (`MODE=all`) 1 CPU / 2 GB + Postgres basic | ≈ $32 hosting + ≤ $10 LLM |
| 100× (5,000 workspaces, 10M rows/day) | separate `web` ×2 and `worker` ×N (same image, `MODE`), Postgres pro + read replica, object storage for uploads | ≈ $170 web + ≈ $95 Postgres + worker instances |

Honest LLM number at 100×: 10M rows/day × 30% needing the LLM × about 150 tokens ≈ 450M tokens/day ≈
**$105/day** before the Batch API and before the deterministic share improves. The lever is
deterministic coverage, measured per country by the eval.

Triggers to add infrastructure: object storage (files > 10 MB or > 1 GB total) · Redis (queue p95
> 1 s) · read replicas (DB CPU > 60%) · separate worker service (API p95 > 300 ms) · libpostal
(eval misses target for a country) · SSO (first enterprise customer) · OpenTelemetry (a second
service or an external APM).
