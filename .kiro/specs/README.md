# Capability index

One Kiro spec per capability lives at `.kiro/specs/<slug>/{requirements.md,design.md,tasks.md,.config.kiro}`.
How specs are written: [`../steering/specs.md`](../steering/specs.md). Every spec action is logged in
[`docs/kiro-usage.md`](../../docs/kiro-usage.md).

This index lists every `.kiro/specs/<slug>` path named in a `.github/plan/*.md` ticket on 2026-11-24 (M0-10).
Slugs are taken from the tickets as written. A capability ticket uses the slug in its own row and never invents
a new one. "Properties" are the IDs the ticket names, kept verbatim (each becomes `P<n>` in `design.md` with the
ticket's ID beside it). "none named" means the ticket names no property; its spec still names a property for
every invariant it states.

| Slug | Tickets | ADRs | Properties the tickets name |
|---|---|---|---|
| `domain-core` | M1-01 | 0001, 0008 | `P-never-invent`, `P-span-exact`, `P-transform-replays`, `P-no-truncation`, `P-not-auto-approvable`, `P-proposal-deterministic`, `P-batch-transitions`, `P-record-transitions` |
| `persistence` | M1-02 | 0003, 0004, 0005, 0006 | `P-entity-roundtrip` |
| `identity` | M1-03 | 0013 | `P-cross-workspace-denied`, `P-csrf-required` |
| `jobs` | M1-04 | 0005, 0006 | `P-chunking-covers-once`, `P-handler-idempotent`, `P-idempotency-key-replay` |
| `observability` | M1-05 | 0015 | `P-logs-carry-no-content` |
| `ingest` | M1-07 (thin slice) | 0003, 0006, 0008, 0013 | `P-upload-dedup`, `P-country-span-only` |
| `health-report` | M1-07 (thin slice), M2-16 | 0003, 0006, 0008, 0013 | H1 (M2-16) |
| `export` | M1-07 (thin slice), M2-22 | 0003, 0004, 0006, 0008, 0010, 0011, 0013 | `P-original-bytes-unchanged` (M1-07); E1–E4 (M2-22) |
| `security-baseline` | M1-08 | none cited | `P-escape-cell-safe`, `P-audit-hash-stable`, `P-rate-limit-bound` |
| `ingest-csv` | M2-01 | 0001, 0011 | P-CSV-1..3 |
| `ingest-xlsx` | M2-02 | 0011 | P-XLSX-1..3 |
| `ingest-pain001` | M2-03 | 0010 | P-XML-1..4 |
| `ingest-mt101` | M2-04 | none cited | P-MT-1..3 |
| `column-mapping` | M2-05 | 0005, 0006, 0012 | P-MAP-1..2 |
| `rule-packs` | M2-06, M2-07 | 0009 | P-RULE-1..5 (M2-06); P-PACK-1, P-PACK-2 (M2-07) |
| `packs-nordic` | M2-08 | 0009 | P-PACK-1, P-PACK-2 |
| `packs-continental` | M2-09 | 0009 | P-PACK-1, P-PACK-2 |
| `structuring-core` | M2-10 | 0007, 0008, 0018 | P-STR-1..6 |
| `dataset-lookup` | M2-11 | 0003, 0007, 0008, 0018 | P-DS-1..4 |
| `parsers-asia-mideast-brazil` | M2-12 | 0007, 0020 | P-PAR-1..6 |
| `parsers-europe-us` | M2-13 | 0007 | P-PAR-1..6 |
| `llm-labeller` | M2-14, M3-11 | 0007, 0008, 0014, 0020 | P1–P4 (M2-14); P-LLM-1, P-LLM-2 (M3-11) |
| `confidence` | M2-15 | 0008, 0014 | C1–C5 |
| `review` | M2-17, M2-18, M2-19 | 0004, 0008, 0012, 0013 | V1–V4 (M2-17); D1 (M2-19) |
| `payment-file-link` | M2-20 | 0022 | L1–L4 |
| `preflight` | M2-21 | none cited | F1–F3 |
| `retention` | M2-23 | 0006, 0023 | T1–T3 |
| `synthetic-data` | M2-24 | 0020 | S1–S4 |
| `evals` | M2-25 | 0020 | none named |
| `storyboard-e2e` | M2-26 | 0016 | none named |
| `api-tokens` | M3-01 | 0005, 0008, 0013, 0019 | P-TOK-1..3 |
| `mcp-server` | M3-02 | 0001, 0008, 0009, 0019, 0020 | P-MCP-1..3 |
| `kiro-power` | M3-03 | 0019 | P-PWR-1 |
| `crew-app` | M3-04 | 0019 | P-CREW-1, P-CREW-2 |
| `kiro-automation` | M3-05 | 0009, 0019 | P-AUTH-1 |
| `accuracy-eval` | M3-06, M3-07 | 0009, 0020 | P-GOLD-1 (M3-06); P-ACC-1, P-ACC-2 (M3-07) |
| `performance` | M3-08 | 0017 | P-LOAD-1 |
| `judge-sandboxes` | M3-09 | 0013, 0015, 0023 | P-SBX-1, P-SBX-2 |
| `accessibility-i18n` | M3-10 | 0012, 0018 | P-I18N-1 |
| `privacy-attribution` | M3-12 | 0014, 0021, 0023 | P-ATTR-1 |

Notes:
- M1-07 names three properties for its three thin-slice specs without assigning them; this index puts
  `P-upload-dedup` and `P-country-span-only` under `ingest` and `P-original-bytes-unchanged` under `export`.
- `ingest` (M1-07, "extended by M2") and the M2 format slugs `ingest-csv`, `ingest-xlsx`, `ingest-pain001`,
  `ingest-mt101` overlap. Kept as written and reported to BL-01; not renamed here.
- ADRs are those each ticket cites. Check with:
  `comm -23 <(grep -ohE '\.kiro/specs/[a-z0-9-]+' .github/plan/*.md | sed 's#.kiro/specs/##' | sort -u) <(grep -oE '`[a-z0-9-]+`' .kiro/specs/README.md | tr -d '`' | sort -u)`
  prints nothing when the index is complete.
