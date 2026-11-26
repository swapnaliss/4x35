// Structured logs (ADR 0015, M1-05): pino JSON with request and job correlation ids and no file
// content. Addresses are personal data (R8), so a log line carries only allow-listed fields:
//   - top level: only the keys in LOGGED_FIELDS; any other key is dropped (a count is kept)
//   - `req` and `job`: serializers that build a new object from their allow-list, never a spread
//   - `err`: the error class only; a message can carry content
//   - redaction: `password`, `token`, `*.original*`, `*.lines*` and `*.name` at any depth
// Bodies, query strings, headers other than user-agent, cookies and file names are never logged.
// Adding a logged field means adding it to an allow-list here, never logging a body. Messages are
// constant strings: never build a message from data.
import { type DestinationStream, type Logger, type LoggerOptions, pino } from "pino";
import type { LogLevel } from "../env.js";

export type { Logger } from "pino";

/** The value that replaces a redacted field. */
export const CENSOR = "[redacted]";

/** Request fields a log line may carry (`req` serializer). */
export const REQUEST_FIELDS = [
  "method",
  "route",
  "status",
  "durationMs",
  "requestId",
  "userId",
  "workspaceId",
  "userAgent",
] as const;

/** Job fields a log line may carry (`job` serializer). */
export const JOB_FIELDS = [
  "kind",
  "jobId",
  "batchId",
  "chunk",
  "attempt",
  "outcome",
  "ms",
] as const;

/** Top-level keys a log line may carry. Any other key is dropped before the line is written. */
export const LOGGED_FIELDS: ReadonlySet<string> = new Set([
  "req",
  "job",
  "err",
  "requestId",
  "jobId",
  "kind",
  "mode",
  "port",
  "workers",
  "http",
  "version",
  "commit",
  "signal",
  "checks",
  "count",
]);

/** An error is logged by its class name only (an identifier), never its message or stack. */
export function errorClass(err: unknown): string {
  const name =
    err instanceof Error
      ? err.name !== "Error"
        ? err.name
        : err.constructor.name
      : typeof err === "object" &&
          err !== null &&
          typeof (err as { name?: unknown }).name === "string"
        ? (err as { name: string }).name
        : "NonError";
  return /^[A-Za-z_$][\w$]{0,63}$/.test(name) ? name : "UnnamedError";
}

function pick<K extends string>(fields: readonly K[], raw: unknown): Partial<Record<K, unknown>> {
  const out: Partial<Record<K, unknown>> = {};
  if (typeof raw !== "object" || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const f of fields) {
    const v = source[f];
    // Scalars only: an allow-listed field never smuggles a nested object into a line.
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[f] = v;
  }
  return out;
}

export const serializers = {
  req: (raw: unknown) => pick(REQUEST_FIELDS, raw),
  job: (raw: unknown) => pick(JOB_FIELDS, raw),
  err: (raw: unknown) => ({ type: errorClass(raw) }),
};

const REDACT_KEY = /^(?:.*password.*|.*token.*|original.*|lines.*)$/i;
const MAX_DEPTH = 8;

/** Redacts `password`, `token`, `*.original*`, `*.lines*` and `*.name` keys, at any depth. */
export function redact(value: unknown, depth = 0): unknown {
  if (typeof value !== "object" || value === null) return value;
  if (depth >= MAX_DEPTH) return CENSOR;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = REDACT_KEY.test(k) || (depth > 0 && k === "name") ? CENSOR : redact(v, depth + 1);
  }
  return out;
}

/** Keys whose serializer builds the logged value from an allow-list (they see the raw value). */
const SERIALIZED: ReadonlySet<string> = new Set(Object.keys(serializers));

/** Keeps the allow-listed top-level keys (redacted), and counts the dropped ones. */
function allowListed(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let dropped = 0;
  for (const [k, v] of Object.entries(obj)) {
    if (!LOGGED_FIELDS.has(k)) dropped++;
    else out[k] = SERIALIZED.has(k) ? v : redact(v, 1);
  }
  if (dropped > 0) out.droppedFields = dropped;
  return out;
}

/**
 * Every call is reduced to `(fields, message)`: an Error becomes `{ err }` with the constant message
 * "error" (pino would otherwise log its message), and printf-style values are never formatted in.
 */
function logMethod(this: Logger, args: unknown[], method: (...a: unknown[]) => void): void {
  const [first, second] = args;
  if (typeof first === "string") {
    method.apply(this, [first]);
    return;
  }
  const fields =
    first instanceof Error
      ? { err: first }
      : typeof first === "object" && first !== null
        ? first
        : {};
  const message = typeof second === "string" ? second : "err" in fields ? "error" : "";
  method.apply(this, [fields, message]);
}

export interface LoggerConfig {
  /** `LOG_LEVEL`, or `silent` for a logger that writes nothing. */
  readonly level: LogLevel | "silent";
  /** Where lines go. Default: stdout. Tests pass a capturing stream. */
  readonly destination?: DestinationStream;
}

/** The process logger: JSON lines (in every NODE_ENV), ISO timestamps, level as a label. */
export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    level: config.level,
    base: null,
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers,
    hooks: { logMethod },
    formatters: {
      level: (label) => ({ level: label }),
      bindings: (bindings) => allowListed(bindings),
      log: (obj) => allowListed(obj),
    },
  };
  return config.destination ? pino(options, config.destination) : pino(options);
}

/** A logger that writes nothing (the default when no logger is wired, e.g. unit tests). */
export function silentLogger(): Logger {
  return createLogger({ level: "silent" });
}
