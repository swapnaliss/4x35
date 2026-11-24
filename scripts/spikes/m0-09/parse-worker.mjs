#!/usr/bin/env node
// M0-09 load spike: parse one upload in a worker_threads worker with resourceLimits and a wall
// timeout, split the records into chunks, and report per phase: wall time, peak process RSS and
// worker heap. Optionally inserts the chunks into Postgres, one transaction per chunk.
//
// The main thread samples RSS (process-wide) and the worker's V8 heap every --sample-ms while the
// worker runs, and attributes each sample to the phase the worker last announced.
// Outcomes: status "ok" | "oom" (ERR_WORKER_OUT_OF_MEMORY) | "timeout" | "error". The main thread
// survives oom and timeout and exits 0 after reporting; only "error" exits 1.
//
// Usage: node parse-worker.mjs --deps <dir> --file <rows.csv|rows.xlsx> [--json]
//          [--max-old-mb N] [--max-young-mb N] [--timeout-ms N] [--chunk 200]
//          [--xlsx-mode dense|sparse] [--concurrency N] [--pg <postgres url>]
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { parseArgs } from "node:util";
import { getHeapStatistics } from "node:v8";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

const MB = 1024 * 1024;
const mb = (bytes) => Math.round((bytes / MB) * 10) / 10;

// ---------------------------------------------------------------- worker side
function runWorker({ deps, file, chunk, xlsxMode }) {
  const require = createRequire(join(deps, "package.json"));
  const phase = (name) => parentPort.postMessage({ type: "phase", name });
  const timings = {};
  const heap = {};
  const timed = (name, fn) => {
    phase(name);
    const t0 = performance.now();
    const out = fn();
    timings[name] = Math.round(performance.now() - t0);
    heap[name] = mb(getHeapStatistics().used_heap_size);
    return out;
  };

  const buf = timed("read", () => readFileSync(file));
  const isXlsx = file.endsWith(".xlsx");
  let encoding = null;
  let table;
  let parseErrors = 0;
  if (isXlsx) {
    const XLSX = require("xlsx");
    const wb = timed("parse", () =>
      XLSX.read(buf, { type: "buffer", dense: xlsxMode === "dense", cellStyles: false }),
    );
    table = timed("extract", () =>
      XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        raw: false,
        defval: "",
      }),
    );
  } else {
    const Papa = require("papaparse");
    // UTF-8 first (fatal on invalid bytes), else Windows-1252: what M2-01 will detect.
    const text = timed("decode", () => {
      try {
        const t = new TextDecoder("utf-8", { fatal: true }).decode(buf);
        encoding = "utf-8";
        return t;
      } catch {
        encoding = "windows-1252";
        return new TextDecoder("windows-1252").decode(buf);
      }
    });
    const res = timed("parse", () => Papa.parse(text, { header: false, skipEmptyLines: true }));
    parseErrors = res.errors.length;
    table = timed("extract", () => res.data);
  }
  const [header, ...rows] = table;
  const records = timed("records", () =>
    rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))),
  );
  const chunks = timed("chunk", () => {
    const out = [];
    for (let i = 0; i < records.length; i += chunk) out.push(records.slice(i, i + chunk));
    return out;
  });
  parentPort.postMessage({
    type: "done",
    encoding,
    columns: header.length,
    rows: records.length,
    parse_errors: parseErrors,
    chunks: chunks.length,
    timings,
    heap_used_mb: heap,
    heap_limit_mb: mb(getHeapStatistics().heap_size_limit),
  });
  // Hand the chunks to the main thread only when it will insert them.
  if (workerData.emit) parentPort.postMessage({ type: "chunks", chunks });
}

if (!isMainThread) {
  runWorker(workerData);
} else {
  await main();
}

// ---------------------------------------------------------------- main side
function cgroupMemoryLimitMb() {
  try {
    const v = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    return v === "max" ? null : mb(Number(v));
  } catch {
    return null;
  }
}

async function main() {
  const { values: o } = parseArgs({
    options: {
      deps: { type: "string" },
      file: { type: "string" },
      json: { type: "boolean", default: false },
      "max-old-mb": { type: "string", default: "256" },
      "max-young-mb": { type: "string", default: "32" },
      "timeout-ms": { type: "string", default: "60000" },
      chunk: { type: "string", default: "200" },
      "xlsx-mode": { type: "string", default: "dense" },
      concurrency: { type: "string", default: "1" },
      "sample-ms": { type: "string", default: "10" },
      pg: { type: "string" },
    },
  });
  if (!o.deps || !o.file) {
    console.error("usage: parse-worker.mjs --deps <dir> --file <path> [--json] [options]");
    process.exit(2);
  }
  const limits = {
    maxOldGenerationSizeMb: Number(o["max-old-mb"]),
    maxYoungGenerationSizeMb: Number(o["max-young-mb"]),
  };
  const timeoutMs = Number(o["timeout-ms"]);
  const concurrency = Number(o.concurrency);
  const file = resolve(o.file);
  const data = {
    deps: resolve(o.deps),
    file,
    chunk: Number(o.chunk),
    xlsxMode: o["xlsx-mode"],
    emit: Boolean(o.pg),
  };

  const t0 = performance.now();
  const baseRss = process.memoryUsage.rss();
  const results = await Promise.all(
    Array.from({ length: concurrency }, () =>
      runOne(data, limits, timeoutMs, Number(o["sample-ms"])),
    ),
  );
  const report = {
    file,
    bytes: statSync(file).size,
    format: file.endsWith(".xlsx") ? `xlsx-${data.xlsxMode}` : "csv",
    node: process.version,
    cpus: availableParallelism(),
    cgroup_memory_limit_mb: cgroupMemoryLimitMb(),
    limits: { ...limits, timeout_ms: timeoutMs },
    chunk_size: data.chunk,
    concurrency,
    status: results.every((r) => r.status === "ok")
      ? "ok"
      : (results.find((r) => r.status !== "ok")?.status ?? "error"),
    wall_ms: Math.round(performance.now() - t0),
    base_rss_mb: mb(baseRss),
    rss_peak_mb: Math.max(...results.map((r) => r.rss_peak_mb)),
    max_rss_mb: mb(process.resourceUsage().maxRSS * 1024),
    workers: results.map(({ chunk_data, ...r }) => r),
  };
  if (o.pg && results[0].status === "ok")
    report.insert = await insert(o.pg, data, results[0].chunk_data);
  if (o.json) console.log(JSON.stringify(report));
  else console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === "error" ? 1 : 0);
}

function runOne(data, limits, timeoutMs, sampleMs) {
  return new Promise((done) => {
    const started = performance.now();
    const w = new Worker(new URL(import.meta.url), { workerData: data, resourceLimits: limits });
    const phases = {};
    let current = "start";
    let heapPeak = 0;
    let rssPeak = 0;
    let settled = false;
    let doneMsg = null;
    const phaseOf = (name) => {
      if (!phases[name]) phases[name] = { rss_peak_mb: 0, heap_peak_mb: 0 };
      return phases[name];
    };
    const sample = () => {
      const rss = process.memoryUsage.rss();
      rssPeak = Math.max(rssPeak, rss);
      const at = current;
      const p = phaseOf(at);
      p.rss_peak_mb = Math.max(p.rss_peak_mb, mb(rss));
      // worker.getHeapStatistics() is answered by the worker's isolate between JS turns or via an
      // interrupt; a sample that does not arrive before the worker exits is simply lost.
      w.getHeapStatistics()
        .then((h) => {
          heapPeak = Math.max(heapPeak, h.used_heap_size);
          const q = phaseOf(at);
          q.heap_peak_mb = Math.max(q.heap_peak_mb, mb(h.used_heap_size));
          q.heap_samples = (q.heap_samples ?? 0) + 1;
        })
        .catch(() => {});
    };
    const timer = setInterval(sample, sampleMs);
    const wall = setTimeout(() => {
      finish({
        status: "timeout",
        error: { message: `worker exceeded ${timeoutMs} ms; terminated` },
      });
      w.terminate();
    }, timeoutMs);
    const finish = (extra) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      clearTimeout(wall);
      sample();
      for (const [name, ms] of Object.entries(doneMsg?.timings ?? {})) {
        phaseOf(name).ms = ms;
        phases[name].heap_used_end_mb = doneMsg.heap_used_mb[name];
      }
      done({
        status: "ok",
        wall_ms: Math.round(performance.now() - started),
        last_phase: current,
        rss_peak_mb: mb(rssPeak),
        worker_heap_peak_mb: mb(heapPeak),
        ...(doneMsg && {
          encoding: doneMsg.encoding,
          columns: doneMsg.columns,
          rows: doneMsg.rows,
          parse_errors: doneMsg.parse_errors,
          chunk_count: doneMsg.chunks,
          heap_limit_mb: doneMsg.heap_limit_mb,
        }),
        phases,
        ...extra,
      });
    };
    w.on("message", (m) => {
      if (m.type === "phase") {
        sample();
        current = m.name;
        sample();
      } else if (m.type === "done") {
        doneMsg = m;
        current = data.emit ? "transfer" : "done";
        if (!data.emit) finish({});
      } else if (m.type === "chunks") {
        finish({ chunk_data: m.chunks });
      }
    });
    w.on("error", (err) =>
      finish({
        status: err.code === "ERR_WORKER_OUT_OF_MEMORY" ? "oom" : "error",
        error: { code: err.code ?? null, message: err.message },
      }),
    );
    w.on("exit", (code) => {
      if (!settled) finish({ status: "error", error: { message: `worker exited ${code}` } });
    });
  });
}

// One transaction per chunk, one multi-row INSERT per transaction (ADR 0006: chunks <= 200).
async function insert(url, data, chunks) {
  const require = createRequire(join(data.deps, "package.json"));
  const pg = require("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const cols = Object.keys(chunks[0][0]);
  await client.query("DROP TABLE IF EXISTS m009_rows");
  await client.query(
    `CREATE TABLE m009_rows (id bigserial PRIMARY KEY, chunk int NOT NULL, ${cols
      .map((c) => `"${c}" text`)
      .join(", ")})`,
  );
  const per = [];
  const t0 = performance.now();
  for (const [ci, rows] of chunks.entries()) {
    const c0 = performance.now();
    const params = [];
    const tuples = rows.map((r) => {
      const ph = [ci, ...cols.map((c) => r[c])].map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO m009_rows (chunk, ${cols.map((c) => `"${c}"`).join(",")}) VALUES ${tuples.join(",")}`,
      params,
    );
    await client.query("COMMIT");
    per.push(performance.now() - c0);
  }
  const totalMs = performance.now() - t0;
  const { rows } = await client.query("SELECT count(*)::int AS n FROM m009_rows");
  await client.end();
  per.sort((a, b) => a - b);
  return {
    rows: rows[0].n,
    chunks: chunks.length,
    chunk_size: data.chunk,
    total_ms: Math.round(totalMs),
    chunk_ms_median: Math.round(per[Math.floor(per.length / 2)] * 10) / 10,
    chunk_ms_max: Math.round(per[per.length - 1] * 10) / 10,
    rows_per_s: Math.round((rows[0].n / totalMs) * 1000),
  };
}
