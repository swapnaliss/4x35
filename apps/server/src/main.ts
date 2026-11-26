import { readFileSync } from "node:fs";
import { type LogLevel, readEnv } from "./env.js";
import { startProcess } from "./process.js";

// Process entry point. pino replaces this minimal logger in M1-05.
const env = readEnv(process.env);
const order: readonly LogLevel[] = ["debug", "info", "warn", "error"];
const log = (level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void => {
  if (order.indexOf(level) < order.indexOf(env.LOG_LEVEL)) return;
  process.stdout.write(`${JSON.stringify({ level, msg, ...fields })}\n`);
};

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const info = { version: pkg.version, commit: env.COMMIT };

const handle = await startProcess(env, info, {
  onListening: (port) => log("info", "http listening", { port, mode: env.MODE, ...info }),
  onError: (err) => log("error", "jobs error", { error: err.message }),
});
log("info", "started", {
  mode: env.MODE,
  workers: handle.jobs.workerIds.length,
  http: handle.http !== null,
  ...info,
});

// Graceful stop: HTTP closes, pg-boss stops fetching and lets active jobs finish (up to 25 s).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log("info", "shutting down", { signal });
    handle.stop().then(
      () => process.exit(0),
      (err: unknown) => {
        log("error", "shutdown failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        process.exit(1);
      },
    );
  });
}
