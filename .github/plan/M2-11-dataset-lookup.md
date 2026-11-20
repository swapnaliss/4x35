---
title: "M2-11 · Dataset lookup: unique and corroborated matches (GeoNames, Japan Post)"
milestone: "M2 · Core Loop"
labels: ["backend"]
blocked_by: ["M2-10"]
estimate: "6h"
resources: ["SCHEMA"]
needs: ["P-03", "P-11", "P-12"]
---

## Context
ADR 0007 uses dataset lookups (GeoNames postal codes, Japan Post) "only on a **unique** match
corroborated by an input span"; ADR 0008 makes `dataset` values never auto-approvable and requires
the dataset record to be cited; ADR 0018 allows Japanese romanisation only through a Japan Post
record matched by postcode. ADR 0003 loads these datasets with an idempotent seed (only the needed
columns, index `(country, postcode)`). M0-08 measured the files and licences. A dataset match also
feeds the "known town" validator that M2-15 uses for auto-approval of `span` values. Rubric:
Innovation (public datasets) and R6.

## Scope
1. Write the Kiro spec first: `.kiro/specs/dataset-lookup/{requirements.md (EARS), design.md,
   tasks.md}` in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties:
   **P-DS-1** a `dataset` value is produced only when the lookup returns exactly one distinct place
   and an input span corroborates it under the documented normalisation; **P-DS-2** every `dataset`
   value cites its dataset, record key and corroborating span; **P-DS-3** with zero or several
   matches no value is produced and the finding is `dataset.no_match` or `dataset.ambiguous`;
   **P-DS-4** lookup results are deterministic for a given dataset version.
2. Schema (SCHEMA: adds a migration): tables `geonames_postal` (country, postcode, place, admin1–3
   names and codes, dataset_version) and `jp_post` (postcode, prefecture/city/town in kanji and
   romanised, dataset_version), each indexed on `(country, postcode)` / `(postcode)`, unless M1-02
   already created them, in which case only missing indexes are added. Repository access through
   the workspace-independent read-only dataset repository in `packages/db/src/repos/datasets.ts`.
3. Seed `packages/db/seed/datasets/{geonames,jp-post}.ts`, idempotent (keyed by dataset version,
   re-running is a no-op): downloads `allCountries.zip` from `https://download.geonames.org/export/zip/`
   and Japan Post `KEN_ALL_ROME` (Shift_JIS, decoded with iconv-lite), loads only the needed columns,
   records the source URL, retrieval date and sha256 in a `dataset_versions` row. Use the GB, NL and CA
   full files only if M0-08 cleared their licences. Exposed as `make seed-datasets`.
4. Port and stage: `packages/core/src/structuring/datasets.ts` defines the `DatasetLookup` port and
   the pure `resolveDatasetCandidates(...)` used by the pipeline stage from M2-10. Normalisation for
   corroboration: NFC, case fold, whitespace, Latin-ASCII folding (transform table entries only).
   - Exact span equal to the dataset place → keep the `span` value and set `validators.knownTown`.
   - Corroborated but differently spelled (for example `MUENCHEN` vs `München` is **not**
     corroboration under this normalisation; `MUNCHEN` is) → `dataset` value with citation.
   - Japan: a postcode span plus kanji town names in the input that equal the Japan Post kanji
     fields → romanised prefecture, city and town from Japan Post as `dataset` values.
   - Countries where GeoNames is partial (CN codes ending 00, BR major CEPs only, outward-only GB/CA/NL
     without the full files, AE where numbers are not postcodes) are listed in `design.md`; lookups
     there return `dataset.partial_coverage` instead of a guess.
5. Adapter in `apps/server/src/modules/structuring/datasets.ts`: one query per chunk (≤ 200 records)
   with a 5 s timeout; a missing dataset table or empty dataset turns the stage off with a logged
   warning (architecture §9 degradation), never an error.
6. Test fixtures: a committed CC-BY extract `fixtures/datasets/geonames-sample.tsv` and a Japan Post
   extract `fixtures/datasets/jp-post-sample.csv` (a few hundred rows across JP, IN, DE, GB, US, FR),
   attributed in `fixtures/datasets/README.md`; tests seed from these, never from the network.

## Out of scope
- Town-name fuzzy matching or spelling correction (would invent a value).
- Datasets other than GeoNames postal and Japan Post. Showing citations in the UI (M2-19).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/dataset-lookup/` with P-DS-1..4 named, and
   `docs/kiro-usage.md` has an entry.
2. P-DS-1..4 pass as fast-check property tests (at least 500 runs each) over generated lookup
   results and inputs.
3. The migration applies cleanly on a fresh database and rolls forward from M1's schema
   (`make migrate` twice is a no-op).
4. Seeding from the committed extracts twice leaves the same row counts, and `dataset_versions` holds
   the source URL, retrieval date and sha256.
5. A JP fixture `〒112-0001 東京都文京区白山` with the matching sample row yields romanised prefecture,
   city and town values with `dataset` provenance citing the Japan Post record; the same postcode with
   a different kanji town yields no value and `dataset.no_match`.
6. A postcode with two places in the extract yields no value and `dataset.ambiguous` with the count.
7. With the dataset tables empty, the structuring job still completes and the records carry the
   deterministic partial (integration test).
8. `make seed-datasets` against the real downloads completes on the local stack in under 5 minutes
   (time printed), and the row counts are recorded in the PR.

## Deliverables
- `.kiro/specs/dataset-lookup/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/db/src/schema/datasets.ts` and the new `drizzle/` migration
- `packages/db/src/repos/datasets.ts`; `packages/db/seed/datasets/{geonames,jp-post}.ts`; `Makefile` target `seed-datasets`
- `packages/core/src/structuring/datasets.ts` and tests
- `apps/server/src/modules/structuring/datasets.ts`; `apps/server/test/integration/datasets.test.ts`
- `fixtures/datasets/{geonames-sample.tsv,jp-post-sample.csv,README.md}`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
make up && make migrate && make migrate
npx vitest run packages/core/src/structuring/datasets
npx vitest run apps/server/test/integration/datasets.test.ts
time make seed-datasets
npx tsc -b
npx biome check packages/core/src/structuring packages/db apps/server/src/modules/structuring
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-12** (JP parser) relies on this stage for romanised values from kanji input; the parser emits
  kanji spans and the postcode, never romanised text.
- **M2-15** reads `validators.knownTown` and the `dataset` kind (never auto-approvable).
- **M2-19** shows the citation (dataset, record key, corroborating span) in the record detail.
- **M0-07 / M2-26**: production needs `make seed-datasets` (or the setup script) run once; record the
  command and timing in the PR handoff.
