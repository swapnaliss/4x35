# Reference datasets: sources, licences, load spike, defects (M0-08)

Measured on 2026-11-24. Reproduce with:

```bash
scripts/data/fetch-geonames.sh && scripts/data/fetch-japanpost.sh   # into data/raw/ (gitignored)
node scripts/data/fetch-chromium-i18n.mjs                           # data/chromium-i18n/ (committed)
PORT_OFFSET=600 scripts/data/load-spike.sh                          # scratch postgres:17-alpine
```

`load-spike.sh` streams each file through the loader prototype (`packages/db/src/seed/datasets.ts`,
via `scripts/data/copy-stream.mjs`) into `psql COPY ... FROM STDIN`, then runs
`scripts/data/measure-spike.sql`. Every number below comes from that output. Machine: 4 vCPU,
14 GB RAM, Docker 29.1.3, Node 24.22.1, scratch Postgres 17 with default settings.

## 1. Sources and licences

Pinned in `data/sources.json` (url, licence, licence_url, licence_retrieved, retrieved, sha256,
bytes). Licences were read on the publisher's own page on 2026-11-24.

| Source | File | Download bytes | Unzipped bytes | Licence (publisher's page) | Committed? |
|---|---|---|---|---|---|
| GeoNames postal codes | `allCountries.zip` | 20,004,904 | 144,482,531 | CC-BY 4.0, [readme.txt](https://download.geonames.org/export/zip/readme.txt): "This work is licensed under a Creative Commons Attribution 4.0 License" | no, fetched at seed time |
| Japan Post, romanised | `KEN_ALL_ROME.zip` (Shift_JIS) | 1,706,353 | 11,302,133 | [readme_ro.html](https://www.post.japanpost.jp/service/search/zipcode/download/readme_ro.html): Japan Post claims no copyright on postcode data and allows free redistribution | no, fetched at seed time |
| Japan Post, UTF-8 | `utf_ken_all.zip` | 2,033,286 | 18,358,764 | same terms, [utf-readme.html](https://www.post.japanpost.jp/service/search/zipcode/download/utf-readme.html) | no, fetched at seed time |
| chromium-i18n address metadata | `ssl-address/data/<CC>`, 30 files | 28,138 in all | n/a | CC-BY 4.0, [libaddressinput README, License](https://github.com/google/libaddressinput/blob/81eb9628382b07d371d8ea0b11badf7de3857fd5/README.md#license): "Data licensed under the CC-BY 4.0" | yes, `data/chromium-i18n/<CC>.json`, byte for byte as served |

Decisions:

- **chromium-i18n** is small and CC-BY 4.0, so it is committed as a snapshot with attribution in
  `NOTICE`. It is excluded from biome so the bytes stay identical to the pinned sha256.
- **GeoNames and Japan Post** are fetched at seed time and never committed (`data/raw/` is
  gitignored; `git ls-files data/raw` lists only `.gitkeep`). Japan Post's terms would allow
  committing, but the repo stays small and one rule covers both.
- **GeoNames `GB_full.csv.zip` is not used.** The readme says it "Contains Royal Mail data Royal
  Mail copyright and database right", which is not the CC-BY grant. `allCountries.zip` has GB
  outward codes only (section 5).
- **Kana.** Japan Post's romanised file has kanji and romaji but no kana. The kana readings come
  from Japan Post's `utf_ken_all.zip` (same publisher and terms), fetched by the same script.

Source facts that M2-11 must handle:

- **GeoNames regenerates `allCountries.zip` every day** (Last-Modified 2026-11-24 03:02 GMT on the
  day of the spike). A fresh download will not match the pinned sha256 after that, and the fetch
  exits 3 by design. Re-pin after review with `PIN=1 scripts/data/fetch-geonames.sh`. Logged on
  BL-01.
- **Japan Post moved its downloads** to `/service/search/zipcode/download/`. The old
  `/zipcode/dl/...zip` URLs return HTTP 404. Japan Post updates monthly; re-pin the same way.
- **chromium-i18n**: `chromium-i18n.appspot.com/ssl-address/data/<CC>` redirects to gstatic for 29
  of the 30 countries. MY is served by appspot only, and gstatic returns 404 for it. The pinned
  URL is therefore the appspot one.

Fetch behaviour (AC 1): a file whose sha256 matches its pin is not downloaded again. A file with
an altered hash exits 3 and is never overwritten. A download whose hash does not match is deleted
and exits 3. curl and fetch time out after 60 s.

## 2. Load: rows, times, sizes

Columns kept (ADR 0003):

- `geonames_postal`: country, postcode, place, admin1, admin2. admin1 and admin2 are names, not
  codes.
- `jp_post`: postcode, prefecture, city and town, each in kanji, kana and romaji.

Indexes: `geonames_postal (country, postcode)` and `jp_post (postcode)`. Values are copied verbatim
and trimmed. An empty field becomes NULL.

| Table | Rows | Encoding detected | Skipped lines |
|---|---|---|---|
| geonames_postal | 1,836,751 (124 countries) | utf-8 | 0 |
| jp_post_roman (staging) | 124,840 | shift_jis, converted to UTF-8 | 0 |
| jp_post_kana (staging) | 124,527 | utf-8 | 0 |
| jp_post (romanised rows + kana joined) | 124,840 | n/a | n/a |

Load time is wall time from `unzip -p` through the loader to the end of COPY. Four runs were made;
the one that failed on a script bug (scratch volume cleanup) is discarded.

| Step | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| GeoNames load | 22.6 s | 13.7 s | 11.8 s |
| Japan Post romanised load | 2.3 s | 3.3 s | 1.7 s |
| Japan Post UTF-8 load | 2.5 s | 2.4 s | 1.4 s |
| jp_post join build | 2.3 s | 2.4 s | 1.5 s |
| Index build, geonames_postal | 7.9 s | 6.0 s | 3.5 s |
| Index build, jp_post | 1.3 s | 0.4 s | 0.2 s |
| Whole spike (container start to measurements) | 69.5 s | n/a | n/a |

Peak client memory for the whole run was 214 MB maximum RSS (`/usr/bin/time -v`). The loader
streams, so its memory does not grow with the file.

Table and index sizes (bytes, `pg_relation_size` / `pg_indexes_size`):

| Table | Table bytes | Index size | Total |
|---|---|---|---|
| geonames_postal (all 124 countries) | 138,280,960 | 39,829,504 | 178,184,192 (170 MiB) |
| geonames_postal without AE and HK (section 5) | 127,401,984 | 34,209,792 | 161,619,968 (154 MiB) |
| jp_post | 22,544,384 | 2,785,280 | 25,370,624 (24 MiB) |
| jp_post_roman + jp_post_kana (staging, dropped after the join) | 32,350,208 | 0 | 32,432,128 (31 MiB) |
| whole scratch database | | | 243,898,035 (233 MiB) |

## 3. Projected production storage (AC 6)

| | Bytes | Share of 1 GB | Share of the 3 GB budget |
|---|---|---|---|
| Steady state: geonames_postal without AE/HK + jp_post | 186,990,592 (178 MiB) | 19% | 6% |
| Steady state, nothing excluded | 203,554,816 (194 MiB) | 20% | 7% |
| Seed peak (worst case): nothing excluded + Japan Post staging tables | 235,986,944 (225 MiB) | 24% | 8% |

Render Postgres is **Basic-256mb** (`docs/budget.md`). render.com/pricing (2026-11-24) lists
Postgres storage as "Expandable storage", $0.30 per GB per month. `docs/budget.md` budgets about
3 GB for datasets and uploads. The datasets fit with wide margin: 0.19 GB steady state and 0.24 GB
at the seed peak. WAL during the seed is transient and is not counted. **No BL-01 entry is needed
for storage.**

The 256 MB RAM limits only the index build. Default `maintenance_work_mem` (64 MB) built the
GeoNames index in 3.5 to 7.9 s here. Expect slower on Basic, but this is a one-off at seed time.

## 4. Unique-match rate per country

Unique postcode = the postcode maps to exactly one distinct place name (`lower(place)`) in
GeoNames. Only these postcodes may yield a `dataset` value (ADR 0008, R6). "Avg places" is the
mean number of distinct places per postcode.

| Country | Parser list | Rows | Postcodes | Unique | Unique-match rate | Avg places | Note |
|---|---|---|---|---|---|---|---|
| JP | yes | 146,883 | 142,577 | 141,240 | 99.1% | 1.03 | Japan Post below is the better JP source |
| IN | yes | 155,570 | 19,238 | 1,879 | 9.8% | 8.09 | one PIN covers many villages |
| CN | yes | 2,352 | 2,349 | 2,346 | 99.9% | 1.00 | **truncated**: only codes ending 00 |
| SG | yes | 121,154 | 121,135 | 121,116 | 100.0% | 1.00 | |
| HK | yes | 1 | 1 | 1 | (100%) | 1.00 | **placeholder**: one row, exclude |
| AE | yes | 178,171 | 178,171 | 178,171 | (100%) | 1.00 | **bogus**: exclude |
| BR | yes | 5,525 | 5,525 | 5,525 | 100.0% | 1.00 | **truncated**: major codes only |
| DE | yes | 23,296 | 10,815 | 8,423 | 77.9% | 2.15 | |
| GB | yes | 27,450 | 3,002 | 775 | 25.8% | 9.14 | **truncated**: outward code only |
| US | yes | 41,490 | 41,488 | 41,486 | 100.0% | 1.00 | |
| FR | yes | 51,611 | 20,418 | 16,130 | 79.0% | 2.53 | includes CEDEX forms |
| NL | yes | 4,334 | 4,086 | 3,879 | 94.9% | 1.06 | **truncated**: 4 digits only |
| ES | yes | 37,867 | 11,150 | 5,698 | 51.1% | 3.40 | |
| IT | yes | 18,415 | 4,736 | 1,834 | 38.7% | 3.89 | |
| SE | no | 18,887 | 18,887 | 18,887 | 100.0% | 1.00 | |
| DK | no | 1,159 | 1,159 | 1,159 | 100.0% | 1.00 | |
| NO | no | 5,132 | 5,132 | 5,132 | 100.0% | 1.00 | |
| FI | no | 3,576 | 3,576 | 3,576 | 100.0% | 1.00 | |
| CH | no | 4,528 | 3,358 | 2,691 | 80.1% | 1.33 | |
| BE | no | 2,785 | 1,147 | 625 | 54.5% | 2.43 | |
| AT | no | 19,225 | 2,501 | 711 | 28.4% | 7.60 | |
| PL | no | 72,899 | 20,299 | 16,937 | 83.4% | 3.59 | |
| IE | no | 139 | 139 | 139 | (100%) | 1.00 | **truncated**: routing key only |
| KR | no | 35,583 | 34,249 | 33,021 | 96.4% | 1.04 | |
| PH | no | 2,317 | 2,190 | 2,158 | 98.5% | 1.06 | |
| TW | no | 0 | 0 | 0 | none | | **no GeoNames postal data** |
| MY | no | 2,818 | 2,757 | 2,709 | 98.3% | 1.02 | |
| AU | no | 18,566 | 3,170 | 1,021 | 32.2% | 5.85 | |
| CA | no | 1,657 | 1,653 | 1,651 | 99.9% | 1.00 | **truncated**: FSA only |
| MX | no | 144,655 | 32,448 | 12,879 | 39.7% | 4.46 | |

**JP from Japan Post** (`jp_post`, one distinct city + town per postcode): 120,720 postcodes,
119,175 unique, a **98.7%** unique-match rate.

A rate in parentheses is meaningless: the data is a placeholder or too coarse to back a match.
A truncated code can still match uniquely at its own granularity. It must never be widened into a
full postcode (never invent).

## 5. Defects and what M2-11 must exclude

Shape notation: digit → 9, letter → A.

| Country | Defect | Count | Example | M2-11 rule |
|---|---|---|---|---|
| HK | placeholder: HK has no postcodes; one row holds `999077` = "Hong Kong Special Administrative Region" | 1 of 1 rows | `999077` | **exclude HK** |
| AE | bogus: every row is a 5+5-digit pair (`99999 99999`), 226 places, no admin1; the UAE has no postcode system | 178,171 of 178,171 rows | `00225 63489` → "Hessyan First" | **exclude AE** |
| CN | truncated: only codes ending `00` | 2,352 of 2,352 | `010000` Hohhot | keep; a match is city-level only, never a full code |
| BR | truncated: major codes (`-000`) plus one per municipality | 5,519 of 5,525 end in `000` | `01000-000` São Paulo | keep; match only an exact full code from the input |
| IE | truncated: Eircode routing key only (3 chars) | 139 of 139 | `A41` Ballyboughal | keep; match the routing key only, never the full Eircode |
| GB | truncated: outward code only | 27,450 of 27,450 | `AB10` Aberdeen | keep; match the outward code only; 25.8% unique |
| NL | truncated: 4 digits only, no letters | 4,334 of 4,334 | `1011` Amsterdam | keep; match the 4-digit part |
| CA | truncated: FSA only | 1,655 of 1,657 are 3 chars | `A0A` | keep; match the FSA only |
| TW | missing: no rows | 0 | n/a | no dataset values for TW |
| all | exact duplicate (country, postcode, place, admin1, admin2) groups | 587 groups | n/a | de-duplicate at seed time; harmless for uniqueness |
| JP (Japan Post) | placeholder towns: `以下に掲載がない場合` ("not listed below") | 1,870 rows | `0600000` | never use as a town value |
| JP (Japan Post) | placeholder towns: `…一円` (whole municipality) | 23 rows | n/a | never use as a town value |
| JP (Japan Post) | long town names split over several rows in the romanised file | 1,514 rows open `（` without closing, 120 rows close only | `0660005` 協和（…）split in 3 | merge continuation rows (same postcode, consecutive) before use |
| JP (Japan Post) | kana join misses | 2,578 of 124,840 (2.1%), **all** continuation fragments of split towns; 0 postcodes absent from the UTF-8 file | `0882686` 俣落 | resolved by the merge above |
| JP (Japan Post) | wave dash: Shift_JIS `0x8160` decodes to U+FF5E `～`, the UTF-8 file has U+301C `〜` | affects every range town such as `大通西（１〜１９丁目）` | `0600042` | normalise both forms in the join and lookup key, never in the stored value |

## 6. chromium-i18n field availability (for M2-10)

Snapshot: `data/chromium-i18n/<CC>.json`, 30 countries. `fmt` is present for all 30. Columns show
whether the field is present; `require` shows its value; `sub_keys` shows the subdivision count.

| CC | fmt | lfmt | require | zip regex | sub_keys | zip name | upper |
|---|---|---|---|---|---|---|---|
| JP | yes | yes | ASZ | `\d{3}-?\d{4}` | 47 | postal | S |
| IN | yes | - | ACSZ | `\d{6}` | 36 | pin | - |
| CN | yes | yes | ACSZ | `\d{6}` | 34 | postal | S |
| SG | yes | - | AZ | `\d{6}` | - | postal | - |
| HK | yes | yes | AS | **none** | 3 | postal | S |
| AE | yes | yes | AS | **none** | 7 | postal | - |
| BR | yes | - | ASCZ | `\d{5}-?\d{3}` | 27 | postal | CS |
| DE | yes | - | ACZ | `\d{5}` | - | postal | - |
| GB | yes | - | ACZ | present (full outward + inward pattern, BFPO, GIR 0AA) | - | postal | CZ |
| US | yes | - | ACSZ | `(\d{5})(?:[ \-](\d{4}))?` | 62 | zip | CS |
| FR | yes | - | ACZ | `\d{2} ?\d{3}` | - | postal | CX |
| NL | yes | - | ACZ | `[1-9]\d{3} ?(?:[A-RT-Z][A-Z]\|S[BCE-RT-Z])` | - | postal | - |
| ES | yes | - | ACSZ | `\d{5}` | 52 | postal | CS |
| IT | yes | - | ACSZ | `\d{5}` | 111 | postal | CS |
| SE | yes | - | ACZ | `\d{3} ?\d{2}` | - | postal | - |
| DK | yes | - | ACZ | `\d{4}` | - | postal | - |
| NO | yes | - | ACZ | `\d{4}` | - | postal | - |
| FI | yes | - | ACZ | `\d{5}` | - | postal | - |
| CH | yes | - | ACZ | `\d{4}` | - | postal | (empty) |
| BE | yes | - | ACZ | `\d{4}` | - | postal | - |
| AT | yes | - | ACZ | `\d{4}` | - | postal | - |
| PL | yes | - | ACZ | `\d{2}-\d{3}` | - | postal | - |
| IE | yes | - | (absent) | `[\dA-Z]{3} ?[\dA-Z]{4}` | 26 | eircode | - |
| KR | yes | yes | ACSZ | `\d{5}` | 16 | postal | Z |
| PH | yes | - | (absent) | `\d{4}` | 82 | postal | - |
| TW | yes | yes | ACSZ | `\d{3}(?:\d{2,3})?` | 22 | postal | - |
| MY | yes | - | ACZ | `\d{5}` | 16 | postal | CS |
| AU | yes | - | ACSZ | `\d{4}` | 9 | postal | CS |
| CA | yes | - | ACSZ | `[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d` | 13 | postal | ACNOSZ |
| MX | yes | - | ACSZ | `\d{5}` | 32 | postal | CSZ |

- **No postcode regex: HK and AE.** Both are consistent with the GeoNames defects above.
- **`lfmt`** (Latin format) is present only for JP, CN, HK, AE, KR and TW. The others use `fmt`.
- **`require` absent: IE and PH.** libaddressinput then falls back to the default record
  (`data/ZZ`), which is not in this snapshot. M2-10 decides whether to snapshot ZZ.
- **`sub_keys`**: present for 17 of the 30. Absent for SG, DE, GB, FR, NL, SE, DK, NO, FI, CH, BE,
  AT and PL. M2-10 must not expect a subdivision list there.
