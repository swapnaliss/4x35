import { readFileSync } from "node:fs";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { type LogLevel, readEnv, servesHttp } from "./env.js";

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

const stops: Array<() => void> = [];

if (servesHttp(env.MODE)) {
  const server = serve({ fetch: createApp(info).fetch, port: env.PORT }, (addr) =>
    log("info", "http listening", { port: addr.port, mode: env.MODE, ...info }),
  );
  stops.push(() => server.close());
}

if (env.MODE !== "web") {
  // Worker: no jobs until pg-boss lands (M0-06 / M1). Keep the process alive without a listener.
  const tick = setInterval(() => undefined, 60_000);
  stops.push(() => clearInterval(tick));
  log("info", "worker started", { mode: env.MODE, ...info });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    log("info", "shutting down", { signal });
    for (const stop of stops) stop();
  });
}
