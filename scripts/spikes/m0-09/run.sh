#!/usr/bin/env bash
# M0-09 load spike: the single reproduction command. See README.md in this directory.
#
#   run.sh --install-only      install papaparse 5.7.1, SheetJS 0.20.3 (cdn.sheetjs.com tarball) and
#                              pg 8.23.1 into $TMPDIR/m009-deps, then exit. No repo file changes.
#   run.sh [--data <dir>]      start a scratch postgres:17-alpine (own container, port 5432+PORT_OFFSET,
#                              $TMPDIR volume), run the matrix in node:24-slim containers limited to
#                              --cpus=1 and --memory 2g (3 runs) / 512m (1 run) per file, the probes and
#                              the chunked insert, remove the scratch Postgres, print ONE JSON document.
#
# <dir> (default $TMPDIR/m009) holds rows-utf8.csv, rows-cp1252.csv and rows.xlsx from gen-rows.mjs.
# Progress goes to stderr; stdout carries only the JSON.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
: "${TMPDIR:?export TMPDIR to a writable scratch directory}"

DEPS="$TMPDIR/m009-deps"
DATA="$TMPDIR/m009"
INSTALL_ONLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --install-only) INSTALL_ONLY=1 ;;
    --data) DATA="${2:?--data needs a directory}"; shift ;;
    *) echo "usage: run.sh [--install-only] [--data <dir>]" >&2; exit 2 ;;
  esac
  shift
done
IMAGE="node:24-slim" # the M0-05 Dockerfile's base
PG_IMAGE="postgres:17-alpine"
SPIKE="$PWD/scripts/spikes/m0-09"
XLSX_TGZ="https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
log() { echo "run.sh: $*" >&2; }

install_deps() {
  local want have
  want=$(jq -cnS --arg x "$XLSX_TGZ" '{papaparse:"5.7.1",pg:"8.23.1",xlsx:$x}')
  have=$(jq -cS '.dependencies // {}' "$DEPS/package.json" 2>/dev/null || echo '{}')
  if [ "$want" = "$have" ] && [ -d "$DEPS/node_modules/xlsx" ] && [ -d "$DEPS/node_modules/papaparse" ]; then
    log "deps already installed in $DEPS"
  else
    rm -rf "$DEPS" && mkdir -p "$DEPS"
    echo '{"name":"m009-deps","private":true}' >"$DEPS/package.json"
    # Run from the scratch directory so the repo's package.json and package-lock.json are untouched.
    (cd "$DEPS" && npm install --no-audit --no-fund --save-exact \
      papaparse@5.7.1 "$XLSX_TGZ" pg@8.23.1 >&2)
  fi
  log "installed: $(dep_versions)"
}
# Read the versions from disk: xlsx's "exports" map hides its package.json from require().
dep_versions() {
  (cd "$DEPS" && node -p 'JSON.stringify(Object.fromEntries(["papaparse", "xlsx", "pg"].map((p) =>
    [p, JSON.parse(require("fs").readFileSync(`node_modules/${p}/package.json`, "utf8")).version])))')
}

install_deps
[ "$INSTALL_ONLY" = 1 ] && exit 0

for f in rows-utf8.csv rows-cp1252.csv rows.xlsx; do
  [ -s "$DATA/$f" ] || { log "$DATA/$f missing: run gen-rows.mjs first"; exit 2; }
done
DATA=$(cd "$DATA" && pwd)
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >&2
docker image inspect "$PG_IMAGE" >/dev/null 2>&1 || docker pull -q "$PG_IMAGE" >&2

PORT=$((5432 + ${PORT_OFFSET:-500}))
PG="m009-pg-$PORT"
WORK=$(mktemp -d "$TMPDIR/m009-work.XXXXXX")
VOL="$WORK/pgdata"
cleanup() {
  docker rm -f "$PG" >/dev/null 2>&1 || true
  docker ps -aq --filter "name=m009-run-$$-" | xargs -r docker rm -f >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

docker rm -f "$PG" >/dev/null 2>&1 || true
mkdir -p "$VOL"
# Run as the invoking user so the $TMPDIR volume stays removable without root.
docker run -d --name "$PG" --user "$(id -u):$(id -g)" -p "127.0.0.1:${PORT}:5432" \
  -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=spike -v "$VOL:/var/lib/postgresql/data" \
  "$PG_IMAGE" >/dev/null
until docker exec "$PG" pg_isready -U postgres -d spike -q 2>/dev/null; do sleep 1; done
sleep 2 # the entrypoint restarts the server once after initdb
until docker exec "$PG" pg_isready -U postgres -d spike -q 2>/dev/null; do sleep 1; done
log "scratch Postgres $PG on 127.0.0.1:$PORT"

SEQ=0
# run_case <set> <memory> <run#> <file> [harness args...]: one container, results appended to <set>.ndjson
run_case() {
  local set=$1 mem=$2 run=$3 file=$4 name out err oom code
  shift 4
  SEQ=$((SEQ + 1))
  name="m009-run-$$-$SEQ"
  out="$WORK/$name.json"
  err="$WORK/$name.err"
  log "$set: $file memory=$mem run=$run $*"
  docker run --name "$name" --cpus=1 --memory="$mem" --memory-swap="$mem" --network host \
    -v "$SPIKE:/spike:ro" -v "$DATA:/data:ro" -v "$DEPS:/deps:ro" "$IMAGE" \
    node /spike/parse-worker.mjs --deps /deps --file "/data/$file" --json "$@" >"$out" 2>"$err" || true
  read -r oom code < <(docker inspect -f '{{.State.OOMKilled}} {{.State.ExitCode}}' "$name")
  docker rm "$name" >/dev/null
  jq -e . "$out" >/dev/null 2>&1 || : >"$out" # a killed container may leave partial JSON
  jq -cn --arg file "$file" --arg mem "$mem" --argjson run "$run" --argjson oom "$oom" \
    --argjson code "$code" --slurpfile r "$out" --rawfile e "$err" --arg args "$*" \
    '{file:$file, memory:$mem, run:$run, args:$args, oom_killed:$oom, exit_code:$code,
      result:($r[0] // null), stderr:(if $e == "" then null else $e[0:2000] end)}' \
    >>"$WORK/$set.ndjson"
}

FILES=(rows-utf8.csv rows-cp1252.csv rows.xlsx)
# Matrix: production-like 1 CPU / 2 GB, three runs each, then the rejected 512 MB plan once.
for run in 1 2 3; do
  for f in "${FILES[@]}"; do run_case runs 2g "$run" "$f"; done
done
for f in "${FILES[@]}"; do run_case runs 512m 1 "$f"; done
# Probes: XLSX sparse mode, the old-generation floor, and concurrent parses in one process.
run_case probes 2g 1 rows.xlsx --xlsx-mode sparse
for m in 48 64; do run_case probes 2g 1 rows.xlsx --max-old-mb "$m"; done
for m in 24 32; do run_case probes 2g 1 rows-utf8.csv --max-old-mb "$m"; done
for c in 2 4; do run_case probes 2g 1 rows.xlsx --concurrency "$c"; done
run_case probes 2g 1 rows-utf8.csv --concurrency 4
run_case probes 512m 1 rows.xlsx --concurrency 2
run_case probes 512m 1 rows.xlsx --concurrency 4
# Insert: parse rows-utf8.csv in the worker, hand the 200-record chunks to the main thread, insert
# each chunk in its own transaction.
run_case insert 2g 1 rows-utf8.csv --pg "postgres://postgres:scratch@127.0.0.1:${PORT}/spike"

PG_VERSION=$(docker exec "$PG" psql -U postgres -d spike -tAc 'SHOW server_version')
FILES_JSON=$(for f in "${FILES[@]}"; do
  jq -cn --arg f "$f" --argjson b "$(stat -c %s "$DATA/$f")" \
    --arg s "$(sha256sum "$DATA/$f" | cut -d' ' -f1)" '{file:$f, bytes:$b, sha256:$s}'
done | jq -cs .)

# Medians and maxima per file x memory over the matrix runs.
SUMMARY=$(node -e '
  const runs = require("fs").readFileSync(process.argv[1], "utf8").trim().split("\n").map(JSON.parse);
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
    return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10; };
  const stat = (xs) => (xs.length ? { median: med(xs), max: Math.max(...xs), n: xs.length } : null);
  const groups = {};
  for (const r of runs) (groups[`${r.file}@${r.memory}`] ??= []).push(r);
  const out = [];
  for (const [key, rs] of Object.entries(groups)) {
    const ok = rs.filter((r) => r.result?.status === "ok").map((r) => r.result);
    const w = ok.map((r) => r.workers[0]);
    const phases = {};
    for (const name of ["start", "read", "decode", "parse", "extract", "records", "chunk"]) {
      const ps = w.map((x) => x.phases[name]).filter(Boolean);
      if (!ps.length) continue;
      phases[name] = {
        ms: stat(ps.map((p) => p.ms).filter((v) => v !== undefined)),
        rss_peak_mb: stat(ps.map((p) => p.rss_peak_mb)),
        worker_heap_peak_mb: stat(ps.map((p) => p.heap_peak_mb)),
      };
    }
    const [file, memory] = key.split("@");
    out.push({ file, memory, runs: rs.length, ok: ok.length,
      oom_killed: rs.filter((r) => r.oom_killed).length,
      worker_wall_ms: stat(w.map((x) => x.wall_ms)),
      rss_peak_mb: stat(ok.map((r) => Math.max(r.rss_peak_mb, r.max_rss_mb))),
      worker_heap_peak_mb: stat(w.map((x) => x.worker_heap_peak_mb)),
      phases });
  }
  console.log(JSON.stringify(out));
' "$WORK/runs.ndjson")

jq -n \
  --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg image "$IMAGE" --arg image_id "$(docker image inspect -f '{{.Id}}' "$IMAGE")" \
  --arg pg_image "$PG_IMAGE" --arg pg_version "$PG_VERSION" \
  --arg docker "$(docker version --format '{{.Server.Version}}')" \
  --argjson host_cpus "$(nproc)" \
  --argjson host_mem_mb "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" \
  --arg deps "$(dep_versions)" \
  --argjson files "$FILES_JSON" --argjson summary "$SUMMARY" \
  --slurpfile runs "$WORK/runs.ndjson" --slurpfile probes "$WORK/probes.ndjson" \
  --slurpfile ins "$WORK/insert.ndjson" \
  '{meta:{date:$date, image:$image, image_id:$image_id, postgres:{image:$pg_image, version:$pg_version},
      docker:$docker, host_cpus:$host_cpus, host_mem_mb:$host_mem_mb, deps:($deps|fromjson),
      container:{cpus:1, memory:["2g","512m"], swap:"none (--memory-swap = --memory)"}},
    files:$files, summary:$summary, runs:$runs, probes:$probes,
    insert:(($ins[0].result.insert // {rows:null}) + {oom_killed:$ins[0].oom_killed,
      parse_wall_ms:$ins[0].result.workers[0].wall_ms})}'
