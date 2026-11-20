---
title: "M2-10 · Country detection, chromium-i18n formats, transform table and transliteration"
milestone: "M2 · Core Loop"
labels: ["backend", "critical"]
blocked_by: ["M2-06"]
estimate: "8h"
resources: []
needs: ["P-03", "P-11", "P-12"]
---

## Context
ADR 0007's pipeline starts with country detection (names, ISO codes, postcode shapes), then
chromium-i18n country formats, then per-country parsers. ADR 0008 makes the transform table closed
and versioned (NFC, case, whitespace, postcode format, ISO 9 Cyrillic, Latin-ASCII folding where the
pack charset requires it), and ADR 0018 forbids any transliteration outside that table (Japanese
romanisation only through Japan Post, M2-11). R6 (never invent, never truncate, deterministic) and
R7 (Unicode input, pack charset output). M1-07 shipped a country-only stage; this ticket replaces it
with the real pipeline skeleton that M2-11..M2-15 plug into. Rubric: Innovation (public datasets)
and Technological Implementation (property tests for every invariant).

## Scope
1. Write the Kiro spec first: `.kiro/specs/structuring-core/{requirements.md (EARS), design.md,
   tasks.md}` in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties:
   **P-STR-1** never invent: every candidate value is a substring of the NFC input or the declared
   transform chain applied to one; **P-STR-2** never truncate; **P-STR-3** determinism (same input,
   pack version and transform-table version → same candidates); **P-STR-4** ISO 9 is reversible
   (decode(encode(s)) = s for Cyrillic strings); **P-STR-5** after a charset-required transform chain
   the value is inside the pack charset, or the field is empty with the finding
   `charset.no_deterministic_transform`; **P-STR-6** Latin-ASCII folding is the identity on ASCII.
2. Country names to ISO codes: ADR 0008's closed table includes the entry `country-alias` (ISO 3166 alpha-2/alpha-3 codes and a closed alias list such as
   `UK`, `U.K.`, `P.R. CHINA`, `HONGKONG`, `UAE`, built from the chromium-i18n `name` field plus a
   committed list); implement it as a transform-table entry. Do not edit `packages/core/src/provenance.ts` beyond
   registering the new entry id if the constructor needs it.
3. Transform table v2 in `packages/core/src/transforms/`: `table.ts` (closed list, version
   `transform-table@2`), `iso9-cyrillic.ts`, `latin-ascii.ts` (ICU-style Latin-ASCII folding),
   `postcode-format.ts` (per-country normalisation such as removing a `D-` prefix or inserting the
   Brazil CEP dash, driven by chromium-i18n `zip` patterns), `country-alias.ts`. Transform provenance
   records the ordered chain of entry ids and the source span.
4. chromium-i18n snapshot: `scripts/fetch-chromium-i18n.ts` downloads the per-country JSON from
   `https://chromium-i18n.appspot.com/ssl-address/data/{CC}` and writes
   `packages/core/data/chromium-i18n/countries.json` (fields `name`, `fmt`, `lfmt`, `require`, `upper`,
   `zip`, `zipex`, `sub_keys`, `sub_names`, `sub_lnames`, `sub_isoids`) with the retrieval date. The
   snapshot is committed (CC-BY 4.0; confirm the NOTICE entry from M0-05 names it).
5. Country detection `packages/core/src/structuring/country.ts` (pure): signals in order: a mapped
   country column or hint (`span`), an ISO code or alias on the last lines (`span` or `transform`
   via `country-alias`), a postcode shape unique to one country among the candidates (`inferred`).
   Conflicting signals → no `Ctry` and the finding `country.conflict`; no signal → no `Ctry` and
   `country.unknown`.
6. Pipeline skeleton `packages/core/src/structuring/pipeline.ts`: NFC → country → format (chromium
   `fmt` and `require` for that country) → parser registry → dataset stage (a no-op port until M2-11)
   → LLM stage (a no-op port until M2-14) → transliteration where the pack `charset` requires it →
   M1-01's Proposal constructor (provenance check). The parser interface and registry live in
   `packages/core/src/structuring/parsers/{types,registry}.ts`; the registry imports two group
   indexes, `parsers/asia-mideast-brazil/index.ts` and `parsers/europe-us/index.ts`, created here as
   empty lists so M2-12 and M2-13 can work in parallel without touching the registry.
7. Wire the pipeline into the structuring job handler in `apps/server/src/modules/structuring/`,
   replacing M1-07's country-only stage, with the job key `(batch, pack, step, chunk)` unchanged.
8. Synthetic fixtures `fixtures/structuring/country/*.jsonl` (fictional parties): country by code,
   by name in several languages, by alias, by postcode shape only, conflicting, absent; Cyrillic,
   accented Latin, CJK, Devanagari and Arabic text.

## Out of scope
- Country parsers (M2-12, M2-13), dataset lookups (M2-11), the LLM step (M2-14), confidence (M2-15).
- Romanising Japanese, Chinese, Devanagari or Arabic text: no deterministic transform exists, so
  those fields stay for review.

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/structuring-core/` with P-STR-1..6 named, and
   `docs/kiro-usage.md` has an entry.
2. P-STR-1..6 pass as fast-check property tests (at least 1,000 runs for P-STR-1 and P-STR-2, at
   least 500 for the others) over generated multi-script 4 × 35 inputs.
3. Every fixture in `fixtures/structuring/country/` yields the expected `Ctry` and provenance kind:
   `P.R. CHINA` → `CN` (`transform`, `country-alias`), a German postcode shape alone → `DE`
   (`inferred`), `DE` on the last line plus `FRANCE` → no `Ctry` and `country.conflict`.
4. `node scripts/fetch-chromium-i18n.ts --check` confirms the committed snapshot parses and has a
   `zip` pattern for each of JP, IN, CN, SG, BR, DE, GB, US, FR, NL, ES, IT, and records that HK and AE
   have none.
5. A Cyrillic town with the CBPR+ charset produces a value through the chain `iso9-cyrillic` →
   `latin-ascii` with both ids in its provenance; a kanji town produces no value and the finding
   `charset.no_deterministic_transform`.
6. The `country-alias` table is versioned with the transform table, and every alias in it has a unit test (ADR 0008).
7. An integration test runs the structuring job on an uploaded CSV fixture and stores Proposals whose
   every field passes the Proposal constructor; re-running the same chunk writes no duplicate rows.

## Deliverables
- `.kiro/specs/structuring-core/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/core/src/transforms/{table,iso9-cyrillic,latin-ascii,postcode-format,country-alias}.ts` and tests
- `packages/core/data/chromium-i18n/countries.json`; `scripts/fetch-chromium-i18n.ts`
- `packages/core/src/structuring/{country,pipeline}.ts`, `parsers/{types,registry}.ts`,
  `parsers/asia-mideast-brazil/index.ts`, `parsers/europe-us/index.ts`, and tests
- `apps/server/src/modules/structuring/` handler update; `apps/server/test/integration/structuring.test.ts`
- `fixtures/structuring/country/*.jsonl`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
make up && make migrate
node scripts/fetch-chromium-i18n.ts --check
npx vitest run packages/core/src/transforms packages/core/src/structuring
npx vitest run apps/server/test/integration/structuring.test.ts
npx tsc -b
npx biome check packages/core/src/transforms packages/core/src/structuring apps/server/src/modules/structuring
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-11** implements the dataset port the pipeline calls; it receives `(country, candidates, NFC lines)`.
- **M2-12** adds parsers only under `parsers/asia-mideast-brazil/`; **M2-13** only under
  `parsers/europe-us/`. Neither edits the registry or the pipeline.
- **M2-14** implements the LLM port; it runs only for records the deterministic stages left incomplete.
- **M2-15** reads provenance kinds and validator flags to compute confidence.
- `country-alias` provenance is `transform` (ADR 0008), so M2-15 treats it as auto-approvable when validators agree.
