---
title: "M0-09 · Load spike: 20,000 rows parsed in a worker thread inside a 1 CPU / 2 GB container"
milestone: "M0 · Recon & Bootstrap"
labels: ["recon", "backend"]
blocked_by: ["M0-05"]
estimate: "3h"
resources: []
needs: []
---

## Context

R1 caps inputs at 10 MB and 20,000 rows; R2 wants the health report for 20,000 rows within 5 min;
ADR 0017 chose the 1 CPU / 2 GB Render instance partly on the risk that 512 MB fails this target,
and says the 20,000-row target is load-tested in M0-09 and M3-08. The architecture parses uploads
in worker threads with `resourceLimits` and a timeout (STRIDE: denial of service) and chunks jobs
at ≤ 200 records (ADR 0006). Nobody has measured memory for SheetJS on a 20,000-row XLSX or
papaparse on a 10 MB CSV yet. This spike sets the numbers M1-08 and M2-01/M2-02 configure.

All data is synthetic (`PROJECT.md` §9.1).

## Scope

1. `scripts/spikes/m0-09/gen-rows.mjs`: deterministic (seeded) generator of a synthetic supplier
   list with 20,000 rows (name, 4 × 35 address lines, IBAN-shaped placeholder, country), mixed
   scripts (Latin, CJK, Devanagari, Arabic, Cyrillic), written as `rows-utf8.csv`, `rows.xlsx`, and
   a Latin-only `rows-cp1252.csv` in Windows-1252 (the XLSX is written with SheetJS loaded from
   `--deps`); files stay under `$TMPDIR` and are never committed. Output size near the 10 MB cap.
2. `scripts/spikes/m0-09/parse-worker.mjs`: a `worker_threads` harness that parses the file in a
   worker with `resourceLimits` (`maxOldGenerationSizeMb`, `maxYoungGenerationSizeMb`) and a wall
   timeout, splits records into chunks of 200, and reports per phase: wall time, peak RSS, worker
   heap used, and chunk count. Parsers: papaparse 5.7.1 for CSV and SheetJS 0.20.3 from the
   cdn.sheetjs.com tarball for XLSX, both installed in a scratch directory under `$TMPDIR` (no
   change to `package-lock.json`).
3. Insert the 20,000 parsed records into a scratch Postgres (`docker run postgres:17-alpine`, own
   port, `$TMPDIR` volume) in chunks of 200 inside transactions; measure total insert time.
4. Run everything inside a container limited like production:
   `docker run --cpus=1 --memory=2g` on the M0-05 image's Node 24 base, three runs each, and once at
   `--memory=512m` for comparison with the rejected plan.
5. `scripts/spikes/m0-09/run.sh`: with `--install-only`, installs the two parsers into
   `$TMPDIR/m009-deps` and exits; otherwise starts and
   removes the scratch Postgres, runs the full matrix (formats × memory limits × 3 runs, plus the
   insert) and prints one JSON document; it is the single reproduction command.
6. Record in `docs/evidence/load-spike.md`: medians and maxima per format and phase, the recommended
   `resourceLimits`, worker timeout, chunk size and maximum concurrent parses per instance, and
   whether R2's 5-minute budget leaves room for structuring (stating what is not yet measured:
   structuring cost per record arrives in M2).

## Out of scope

- The production ingest (M2-01, M2-02), upload hardening (M1-08) and the production load test on
  Render (M3-08)
- Structuring cost (not built yet)

## Acceptance Criteria

1. The generator produces byte-identical CSV files for the same seed (sha256 equal across two
   runs; the XLSX may differ only in workbook timestamps), each with 20,000 data rows and within
   10 MB.
2. The harness parses the CSV and the XLSX inside `--cpus=1 --memory=2g` without the container
   being OOM-killed, three runs each; results are printed as JSON.
3. A deliberately low `maxOldGenerationSizeMb` makes the worker fail with
   `ERR_WORKER_OUT_OF_MEMORY` while the main thread survives and reports the failure; a timeout
   below the parse time terminates the worker and is reported.
4. The 20,000-row chunked insert completes and its time is recorded.
5. `docs/evidence/load-spike.md` holds the measured table (2 GB and 512 MB), the recommended
   `resourceLimits`, timeout, chunk size and parse concurrency, and what remains unmeasured.
6. No generated file or scratch install is tracked (`git status --short` shows only the scripts and
   the evidence doc).

## Deliverables

- `scripts/spikes/m0-09/gen-rows.mjs`, `scripts/spikes/m0-09/parse-worker.mjs`,
  `scripts/spikes/m0-09/run.sh`, `scripts/spikes/m0-09/README.md` (how to reproduce)
- `docs/evidence/load-spike.md`

## Validation Gate

```bash
./scripts/spikes/m0-09/run.sh --install-only
node scripts/spikes/m0-09/gen-rows.mjs --deps "$TMPDIR/m009-deps" --seed 42 --rows 20000 --out "$TMPDIR/m009" && sha256sum "$TMPDIR"/m009/*.csv > "$TMPDIR/a.sha"
node scripts/spikes/m0-09/gen-rows.mjs --deps "$TMPDIR/m009-deps" --seed 42 --rows 20000 --out "$TMPDIR/m009" && sha256sum "$TMPDIR"/m009/*.csv | diff - "$TMPDIR/a.sha" && echo deterministic
du -b "$TMPDIR"/m009/*.csv "$TMPDIR"/m009/*.xlsx                      # each <= 10485760
./scripts/spikes/m0-09/run.sh --data "$TMPDIR/m009" | tee "$TMPDIR/m009-results.json"
jq -e '[.runs[]|select(.memory=="2g")]|all(.oom_killed==false)' "$TMPDIR/m009-results.json"
jq -e '.insert.rows==20000' "$TMPDIR/m009-results.json"
docker run --rm --cpus=1 --memory=2g -v "$PWD/scripts/spikes/m0-09:/spike:ro" -v "$TMPDIR/m009:/data:ro" -v "$TMPDIR/m009-deps:/deps:ro" node:24-slim node /spike/parse-worker.mjs --deps /deps --file /data/rows.xlsx --max-old-mb 32 --json   # expect ERR_WORKER_OUT_OF_MEMORY reported, exit 0
docker run --rm --cpus=1 --memory=2g -v "$PWD/scripts/spikes/m0-09:/spike:ro" -v "$TMPDIR/m009:/data:ro" -v "$TMPDIR/m009-deps:/deps:ro" node:24-slim node /spike/parse-worker.mjs --deps /deps --file /data/rows.xlsx --timeout-ms 50 --json     # expect timeout reported, exit 0
grep -ciE 'resourceLimits|timeout|chunk|512' docs/evidence/load-spike.md
git status --short
./scripts/landing-checks.sh
```

## Handoff

- **M1-08** (upload hardening): the recommended `resourceLimits`, worker timeout and parse
  concurrency.
- **M2-01, M2-02** (CSV, XLSX ingest): measured parse cost and memory per format; SheetJS memory
  behaviour on 20,000 rows.
- **M1-04** (jobs): chunk size confirmation and insert throughput.
- **M3-08** (load test): local baseline to compare against production.
- If 2 GB does not hold R1/R2, log to BL-01 with an owner decision (plan size) before M1.
