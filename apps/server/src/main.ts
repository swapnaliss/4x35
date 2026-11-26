import { readFileSync } from "node:fs";
import { readEnv } from "./env.js";
import { createLogger } from "./obs/logger.js";
import { startProcess } from "./process.js";

// Process entry point. Logs are pino JSON lines on stdout (ADR 0015, M1-05): allow-listed fields
// only, never content, and an error by its class only.
const env = readEnv(process.env);
const logger = createLogger({ level: env.LOG_LEVEL });

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};
const info = { version: pkg.version, commit: env.COMMIT };

const handle = await startProcess(env, info, {
  logger,
  onListening: (port) => logger.info({ port, mode: env.MODE, ...info }, "http listening"),
  onError: (err) => logger.error({ err }, "jobs error"),
});
logger.info(
  {
    mode: env.MODE,
    workers: handle.jobs.workerIds.length,
    http: handle.http !== null,
    ...info,
  },
  "started",
);

// Graceful stop: HTTP closes, pg-boss stops fetching and lets active jobs finish (up to 25 s).
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    logger.info({ signal }, "shutting down");
    handle.stop().then(
      () => process.exit(0),
      (err: unknown) => {
        logger.error({ err }, "shutdown failed");
        process.exit(1);
      },
    );
  });
}
