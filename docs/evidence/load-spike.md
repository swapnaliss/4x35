# Load spike: 20,000 rows in a worker thread, 1 CPU / 2 GB (M0-09)

Measured on 2026-11-24 (results document dated `2026-11-24T16:19:10Z`). Reproduce with
`scripts/spikes/m0-09/README.md`:

```bash
./scripts/spikes/m0-09/run.sh --install-only
node scripts/spikes/m0-09/gen-rows.mjs --deps "$TMPDIR/m009-deps" --seed 42 --rows 20000 --out "$TMPDIR/m009"
PORT_OFFSET=500 ./scripts/spikes/m0-09/run.sh --data "$TMPDIR/m009" > "$TMPDIR/m009-results.json"
```

Every number below comes from that run's JSON (`summary`, `runs`, `probes`, `insert`) unless the row
says otherwise. The run took 3 minutes (16:16:11 to 16:19:11 UTC).

**Set-up.** Each case runs in its own `node:24-slim` container (the M0-05 Dockerfile base; Node
24.22.3 inside) with `--cpus=1 --memory=<2g|512m> --memory-swap=<same>`, so no swap. The host is a
4 vCPU laptop with 15 GB RAM and Docker 29.1.3, and nothing else ran during the measurement. The
parsers are papaparse 5.7.1, SheetJS 0.20.3 (the cdn.sheetjs.com tarball) and pg 8.23.1, all
installed under `$TMPDIR`; `package-lock.json` is unchanged. The scratch Postgres is
`postgres:17-alpine` (17.11) on the host, with no CPU or memory limit.

**Worker settings for every matrix case:** `maxOldGenerationSizeMb: 256`,
`maxYoungGenerationSizeMb: 32`, a 60,000 ms wall timeout, chunks of 200, and SheetJS `dense: true`.

## 1. Input files (synthetic, seed 42)

| File | Bytes | Rows | Columns | Notes |
|---|---|---|---|---|
| `rows-utf8.csv` | 10,245,491 | 20,000 | 13 | 50% Latin, 20% CJK, 10% each Devanagari, Arabic, Cyrillic. UTF-8 with BOM, CRLF. |
| `rows-cp1252.csv` | 10,000,534 | 20,000 | 13 | Latin only, Windows-1252 (includes `€` at 0x80) |
| `rows.xlsx` | 6,031,077 | 20,000 | 13 | the `rows-utf8.csv` rows, one sheet, written by SheetJS |

The cap is 10,485,760 bytes. Every file parsed to 20,000 records, 100 chunks and 0 parse errors.
The harness detected `utf-8` and `windows-1252` for the two CSVs. Two generator runs with seed 42
gave identical CSV sha256 (gate output: `deterministic`).

## 2. Measured: per file, 1 CPU

"Wall" is the worker's wall time from spawn to the last record chunked. "RSS" is the peak resident
set of the whole Node process, including the main thread, which sits at 46.9 to 47.3 MB before the
worker starts. "Heap" is the peak V8 heap used by the worker, sampled every 10 ms.

### 2 GB (3 runs each; median / max)

| File | Wall ms | Peak RSS MB | Worker heap MB | OOM-killed |
|---|---|---|---|---|
| `rows-utf8.csv` | 539 / 623 | 135.5 / 136.3 | 37.2 / 38.8 | 0 of 3 |
| `rows-cp1252.csv` | 652 / 660 | 135.9 / 136.1 | 37.4 / 38.5 | 0 of 3 |
| `rows.xlsx` | 4,615 / 4,859 | 210.3 / 210.8 | 75.4 / 75.5 | 0 of 3 |

### 512 MB, the rejected plan (1 run each)

| File | Wall ms | Peak RSS MB | Worker heap MB | OOM-killed |
|---|---|---|---|---|
| `rows-utf8.csv` | 713 | 135.1 | 37.6 | no |
| `rows-cp1252.csv` | 644 | 136.1 | 37.4 | no |
| `rows.xlsx` | 4,509 | 211.1 | 71.0 | no |

### Per phase, 2 GB (median ms / max ms; max peak RSS MB; max worker heap MB)

| Phase | `rows-utf8.csv` | `rows-cp1252.csv` | `rows.xlsx` |
|---|---|---|---|
| read (file to Buffer) | 7 / 8 ms; 73.8 MB; 8.0 MB | 7 / 10 ms; 74.3 MB; 8.1 MB | 5 / 6 ms; 101.3 MB; 26.1 MB |
| decode (CSV only) | 20 / 23 ms; 92.4 MB; 8.0 MB | 72 / 73 ms; 118.1 MB; 8.1 MB | n/a |
| parse (papaparse, or SheetJS `read`) | 207 / 210 ms; 117.1 MB; 19.1 MB | 164 / 199 ms; 120.8 MB; 18.5 MB | **4,104 / 4,212 ms**; 205.2 MB; 71.1 MB |
| extract (SheetJS `sheet_to_json`) | 0 / 0 ms; 119.1 MB; 20.2 MB | 0 / 0 ms; 119.4 MB; 19.0 MB | 20 / 22 ms; 206.2 MB; 70.5 MB |
| records (rows to objects) | 212 / 337 ms; 135.9 MB; 38.8 MB | 237 / 311 ms; 135.9 MB; 38.5 MB | 97 / 121 ms; 210.8 MB; 75.4 MB |
| chunk (slices of 200) | 0 / 0 ms; 136.1 MB; 28.3 MB | 0 / 1 ms; 135.9 MB; 38.5 MB | 0 / 0 ms; 210.8 MB; 75.5 MB |

Worker boot plus parser load (`start`) peaks at 63.5 to 64.2 MB RSS. The 512 MB per-phase figures
are in the JSON's `summary`.

## 3. Measured: probes (1 run each)

| Probe | Memory | Result | Wall ms | Peak RSS MB | Worker heap MB |
|---|---|---|---|---|---|
| XLSX, SheetJS `dense: false` (sparse) | 2g | ok | 4,894 | 225.8 | 89.6 |
| XLSX, `maxOldGenerationSizeMb: 48` | 2g | `ERR_WORKER_OUT_OF_MEMORY` (main thread reported it, exit 0) | 10,260 | 191.0 | 55.1 |
| XLSX, `maxOldGenerationSizeMb: 64` | 2g | ok | 7,506 | 205.7 | 69.7 |
| UTF-8 CSV, `maxOldGenerationSizeMb: 24` | 2g | `ERR_WORKER_OUT_OF_MEMORY` | 765 | 128.1 | 24.6 |
| UTF-8 CSV, `maxOldGenerationSizeMb: 32` | 2g | ok | 617 | 133.2 | 38.1 |
| XLSX × 2 concurrent workers, one process | 2g | ok | 12,921 (both) | 350.0 | 74.2 max |
| XLSX × 4 concurrent | 2g | ok | 37,489 (all four) | 622.3 | 76.3 max |
| UTF-8 CSV × 4 concurrent | 2g | ok | 3,599 (all four) | 334.3 | 35.6 max |
| XLSX × 2 concurrent | 512m | ok | 21,610 (both) | 346.1 | 75.8 max |
| XLSX × 4 concurrent | 512m | **container OOM-killed** (exit 137, no report) | n/a | n/a | n/a |

The gate's own checks, in a 2 GB container: `--max-old-mb 32` on the XLSX reported
`ERR_WORKER_OUT_OF_MEMORY` after 6,964 ms, and `--timeout-ms 50` reported `status: "timeout"` after
55 ms with the worker terminated. Both exited 0.

Two observations follow from these rows:

- **A tight heap makes the failure slow, not fast.** At 48 MB the XLSX worker spent 10.3 s in
  garbage collection before V8 gave up, twice its normal parse time. At 64 MB it passed but took
  7.5 s instead of 4.6 s. The heap limit must leave headroom, and the wall timeout must cover the
  slow-failure path.
- **On 1 CPU, concurrent parses cost more than serial ones.** Two XLSX parses together took 12.9 s
  against 2 × 4.6 s = 9.2 s in series, and four took 37.5 s against 18.5 s. Memory is not the limit
  at 2 GB (four XLSX parses peaked at 622.3 MB); CPU is.

## 4. Measured: chunked insert

The UTF-8 CSV is parsed in the worker (1,176 ms, 2 GB container) and its 100 chunks are handed to the
main thread by `postMessage`. Each chunk is then inserted as one 200-row multi-value `INSERT` inside
its own `BEGIN`/`COMMIT`, into a table of the 13 text columns plus an `int` chunk number and a
`bigserial` key.

| Rows | Chunks | Total ms | Per chunk median ms | Per chunk max ms | Rows/s |
|---|---|---|---|---|---|
| 20,000 | 100 × 200 | 1,518 | 11.7 | 91.8 | 13,178 |

`SELECT count(*)` after the run returned 20,000.

## 5. Recommendations (for M1-08, M1-04, M2-01, M2-02)

| Setting | Value | Basis (measured above) |
|---|---|---|
| `resourceLimits.maxOldGenerationSizeMb` | **256** | XLSX worker heap peaks at 75.5 MB (3.4× headroom). The floor is between 48 MB (fails) and 64 MB (passes, but 63% slower). |
| `resourceLimits.maxYoungGenerationSizeMb` | **32** | the only value measured; all matrix runs used it |
| Worker wall timeout | **30,000 ms** | 6× the slowest single XLSX parse (4,859 ms), and about 3× the 48 MB slow-failure path (10,260 ms) |
| Chunk size | **200** (ADR 0006 confirmed) | 100 chunks of 200 rows insert in 1,518 ms, 11.7 ms median per chunk |
| Concurrent parses per instance | **1**, queued FIFO | Concurrency on 1 CPU only adds time (12.9 s for 2 XLSX parses against 9.2 s in series). At 1 the worst case is one worker at the 256 MB heap cap plus the measured non-heap RSS (about 135 MB), far inside 2 GB. |
| SheetJS read options | `type: "buffer", dense: true` | sparse peaks 14.1 MB higher on the worker heap (89.6 against 75.5 MB) at the same speed |
| CSV decoding | UTF-8 `fatal: true`, then Windows-1252 | 20 ms against 72 ms median; both files detected correctly |

**2 GB against 512 MB.** One parse at a time fits either size: the largest peak RSS was 211.1 MB. The
512 MB container was OOM-killed only with four concurrent XLSX parses, which the concurrency of 1
above rules out. This spike measured the parse process alone; the web server, the pg-boss worker
and the structuring code will share the same memory in production (`MODE=all`), and none of them is
measured here. ADR 0017's choice of 2 GB stands; nothing measured here asks the owner for a
different plan size.

## 6. R2: does 5 minutes leave room for structuring?

For 20,000 rows on 1 CPU, the slowest file (XLSX) took 4,859 ms to parse, and the insert took
1,518 ms. That is 6.4 s of the 300 s budget, which leaves about 293.6 s, or about 14.7 ms per record,
for everything else. On these numbers there is room, if structuring stays within that per-record
budget.

## 7. Not yet measured

- **Structuring cost per record** (M2): the remaining budget in section 6 is arithmetic, not a
  measurement.
- Rule-pack pre-flight, report generation and pg-boss job overhead for 100 jobs (M1-04, M2).
- The web process, pg-boss and the parse sharing one CPU in `MODE=all`.
- **An XLSX near 10 MB.** At 20,000 rows the generated XLSX is 6.0 MB; a 10 MB XLSX needs wider rows.
  Heap and time for it are not measured. Do not assume they scale linearly.
- Upload body handling before the worker (M1-08), and streaming parse (papaparse's `step` or chunk
  mode); every number here is for a whole-file parse.
- Render's real CPU, disk and Postgres (the scratch Postgres here had no limits): M3-08 measures
  production against this local baseline.
- `maxYoungGenerationSizeMb` values other than 32.
