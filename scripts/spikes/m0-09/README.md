# M0-09 load spike: 20,000 rows in a worker thread, 1 CPU / 2 GB

Measures what parsing a 20,000-row upload costs (wall time, peak RSS, worker V8 heap) with the
parsers M2-01 and M2-02 will use, inside a container limited like the Render instance (ADR 0017),
and what a chunked insert of the records costs. Results and recommendations:
[`docs/evidence/load-spike.md`](../../../docs/evidence/load-spike.md).

All rows are synthetic (`PROJECT.md` §9.1): names, streets and towns are assembled from syllable
pools by a seeded PRNG, and IBANs are placeholders with check digits `00`.

## Reproduce

Needs Docker, Node 24, jq. Nothing is written inside the repo.

```bash
export TMPDIR=<a writable scratch directory>
./scripts/spikes/m0-09/run.sh --install-only      # papaparse 5.7.1, SheetJS 0.20.3, pg 8.23.1 -> $TMPDIR/m009-deps
node scripts/spikes/m0-09/gen-rows.mjs --deps "$TMPDIR/m009-deps" --seed 42 --rows 20000 --out "$TMPDIR/m009"
PORT_OFFSET=500 ./scripts/spikes/m0-09/run.sh --data "$TMPDIR/m009" > "$TMPDIR/m009-results.json"
```

`run.sh` takes about 2 minutes on a 4 vCPU laptop. It prints one JSON document on stdout and its
progress on stderr.

## Files

| File | What |
|---|---|
| `gen-rows.mjs` | seeded generator: `rows-utf8.csv` (mixed scripts, UTF-8 with BOM), `rows-cp1252.csv` (Latin only, Windows-1252), `rows.xlsx` (the UTF-8 rows, written by SheetJS). The CSVs are byte-identical for the same seed. |
| `parse-worker.mjs` | the harness: parses one file in a `worker_threads` worker with `resourceLimits` and a wall timeout, splits records into chunks of 200, reports per phase. `--pg <url>` also inserts the chunks, one transaction each. |
| `run.sh` | the single reproduction command: scratch Postgres, the matrix, the probes, the insert, one JSON. |

## Harness options (`parse-worker.mjs`)

| Option | Default | Meaning |
|---|---|---|
| `--deps <dir>` | required | where `run.sh --install-only` put the parsers |
| `--file <path>` | required | `.xlsx` is parsed with SheetJS, anything else with papaparse |
| `--max-old-mb` / `--max-young-mb` | 256 / 32 | the worker's `resourceLimits` |
| `--timeout-ms` | 60000 | wall timeout; the worker is terminated and `status: "timeout"` reported |
| `--chunk` | 200 | records per chunk (ADR 0006) |
| `--xlsx-mode` | `dense` | SheetJS `dense: true`, or `sparse` |
| `--concurrency` | 1 | parse the file in N workers at once, in one process |
| `--pg <url>` | none | insert the chunks into table `m009_rows` |
| `--json` | off | one-line JSON instead of pretty JSON |

`status` is `ok`, `oom` (the worker hit `ERR_WORKER_OUT_OF_MEMORY`), `timeout` or `error`. The main
thread survives `oom` and `timeout`, reports them and exits 0. Only `error` exits 1.

CSV decoding tries UTF-8 with `fatal: true` first and falls back to Windows-1252, the order M2-01
will use.

## Phases

`start` (worker boot and parser load) → `read` (file to Buffer) → `decode` (CSV only) → `parse`
(papaparse, or SheetJS `read`) → `extract` (SheetJS `sheet_to_json`; nothing for CSV) → `records`
(rows to objects keyed by header) → `chunk` (slices of 200).

The main thread samples process RSS and the worker heap (`worker.getHeapStatistics()`, answered
while the worker is busy) every 10 ms and charges each sample to the phase the worker last
announced. RSS is process-wide: it includes the main thread (about 47 MB at rest in the container).
