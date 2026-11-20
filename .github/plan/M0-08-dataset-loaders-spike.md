---
title: "M0-08 · Dataset loaders spike: GeoNames postal, chromium-i18n address metadata, Japan Post romanised; licences, sizes, defects"
milestone: "M0 · Recon & Bootstrap"
labels: ["recon", "backend", "infra"]
blocked_by: ["M0-05"]
estimate: "5h"
resources: []
needs: []
---

## Context

ADR 0007 makes structuring deterministic first, using chromium-i18n country formats and dataset
lookups (GeoNames postal codes, Japan Post) only on a **unique** match backed by an input span
(ADR 0008, R6). Innovation (20% of the rubric) rests on these public datasets; using third-party
data outside its licence is a disqualifier (`PROJECT.md` §1). Kickoff research found GeoNames
defects (HK placeholder, AE bogus, CN/IE/BR/UK truncated) and noted Japan Post's romanised file;
none of it has been measured. ADR 0003 loads GeoNames and Japan Post into Postgres by an idempotent
seed, keeping only needed columns, so Render Postgres basic storage (R9) must hold them.

This spike pins sources, confirms licences, measures sizes and load times, quantifies the defects,
and leaves fetch scripts that M2-10 and M2-11 reuse.

## Scope

1. Fetch scripts, each idempotent with pinned URLs and sha256 in `data/sources.json`
   (`{id, url, licence, licence_url, retrieved, sha256, bytes}`), writing only to `data/raw/`
   (gitignored), 60 s timeout, non-zero exit on hash mismatch:
   - `scripts/data/fetch-geonames.sh`: GeoNames postal codes `allCountries.zip`
   - `scripts/data/fetch-japanpost.sh`: Japan Post romanised postcode file
   - `scripts/data/fetch-chromium-i18n.mjs`: chromium-i18n address metadata for every country in
     `PROJECT.md` §2's parser list (JP, IN, CN, SG, HK, AE, BR, DE, GB, US, FR, NL, ES, IT) plus the
     30 countries M2-24's demo set will use if known, else the top 40 by GeoNames coverage
2. Licences: confirm each licence from the publisher's page (CC-BY 4.0 for GeoNames and
   chromium-i18n, Japan Post's terms) with URL and retrieval date; decide what may be committed.
   chromium-i18n metadata (small, CC-BY 4.0) is committed as a snapshot under
   `data/chromium-i18n/<CC>.json` with attribution; GeoNames and Japan Post are fetched at seed time
   and never committed. Update `NOTICE` with source, version or retrieval date.
3. Load spike in a scratch Postgres (`docker run postgres:17-alpine` under its own port and a
   `$TMPDIR` volume, independent of M0-06): stream each file (detect and convert Japan Post's
   encoding to UTF-8), keep only the columns ADR 0003 needs (country, postcode, place, admin1,
   admin2 for GeoNames; postcode, prefecture, city, town in kana/kanji/romaji for Japan Post) and
   `COPY` into scratch tables with an index on `(country, postcode)`. The loader prototype lives at
   `packages/db/src/seed/datasets.ts` with a vitest test on a 50-row synthetic excerpt in
   `fixtures/datasets/`. No new npm dependency (Node streams, `zlib`/`unzip` CLI, `pg` from M0-06
   or the scratch install).
4. Measure and record in `docs/evidence/datasets.md`: download size, rows per country, load time,
   table and index size, and the share of postcodes that map to exactly one place versus several
   (the "unique match" rate, per parser-list country).
5. Quantify the known defects: placeholder or bogus postcodes (HK, AE), truncated coverage (CN, IE,
   BR, GB), with counts and an example postcode shape each; state what M2-11 must exclude.
6. Answer for M2-10: which chromium-i18n fields are present per parser-list country (`fmt`,
   `require`, `zip` regex, `sub_keys`, `lfmt`) and which countries lack a postcode regex.

## Out of scope

- The production schema tables (M1-02) and the lookup logic (M2-11)
- Country detection and parsers (M2-10, M2-12, M2-13)
- Loading data on Render (M2-11 seeds production)

## Acceptance Criteria

1. Each fetch script run twice exits 0, downloads only on the first run, and fails on an altered
   hash; `data/sources.json` has url, licence, licence_url, retrieved, sha256 and bytes for every
   source.
2. `data/chromium-i18n/` holds one JSON file per listed country and each parses; `git ls-files
   data/raw` lists only `.gitkeep`.
3. `NOTICE` names GeoNames, chromium-i18n and Japan Post with licence and retrieval date.
4. The loader prototype test passes on the synthetic excerpt; the full load into the scratch
   Postgres completes and the row counts per source are recorded.
5. `docs/evidence/datasets.md` reports sizes, load times, table and index sizes, unique-match rates
   per parser-list country, and the defect counts with exclusions.
6. Projected production storage for both datasets is stated against the Render Postgres basic plan
   limit, with a BL-01 entry if it does not fit.

## Deliverables

- `scripts/data/fetch-geonames.sh`, `scripts/data/fetch-japanpost.sh`,
  `scripts/data/fetch-chromium-i18n.mjs`, `data/sources.json`
- `data/chromium-i18n/*.json`, `NOTICE`
- `packages/db/src/seed/datasets.ts`, `packages/db/test/datasets.test.ts`, `fixtures/datasets/`
- `docs/evidence/datasets.md`

## Validation Gate

```bash
for s in scripts/data/fetch-geonames.sh scripts/data/fetch-japanpost.sh; do $s; echo "$s first $?"; $s; echo "$s second $?"; done
node scripts/data/fetch-chromium-i18n.mjs; echo "chromium exit $?"
jq -e 'all(.[]; .url and .licence and .licence_url and .retrieved and .sha256 and .bytes)' data/sources.json
for f in data/chromium-i18n/*.json; do jq -e . "$f" >/dev/null || echo "BAD $f"; done; ls data/chromium-i18n | wc -l
git ls-files data/raw
grep -ciE 'geonames|chromium|japan post' NOTICE                          # expect >= 3
npm test -w packages/db -- datasets
grep -ciE 'unique|defect|index size|load time' docs/evidence/datasets.md
./scripts/landing-checks.sh
```

## Handoff

- **M2-10**: `data/chromium-i18n/` snapshot and the per-country field availability table.
- **M2-11**: fetch scripts, loader prototype, column choice, unique-match rates and the exclusion
  list for defective postcodes; the projected storage on Render.
- **M1-02**: column lists for `geonames_postal` and `jp_post`.
- **M2-24**: which countries have usable dataset coverage for the synthetic demo set.
- **M3-12**: licence URLs and attribution text for the attribution page.
