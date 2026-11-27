import { z } from "zod";

export const Mode = z.enum(["web", "worker", "all"]);
export type Mode = z.infer<typeof Mode>;

export const LogLevel = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof LogLevel>;

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MODE: Mode.default("all"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  LOG_LEVEL: LogLevel.default("info"),
  /** Short git SHA baked into the image by the Docker build arg `COMMIT`. */
  COMMIT: z.string().min(1).default("unknown"),
  /** Postgres for the app and pg-boss. Required to start the process (startProcess); never logged. */
  DATABASE_URL: z.string().min(1).optional(),
  /** Keys the stored hash of session ids (M1-03). Required to serve HTTP; never logged. */
  SESSION_SECRET: z.string().min(32).optional(),
  /** Keys the per-session CSRF token (M1-03). Required to serve HTTP; never logged. */
  CSRF_SECRET: z.string().min(32).optional(),
  /** Public origin of the web app, for invite and reset links (`bootstrap:admin`). */
  APP_BASE_URL: z.url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses the process environment; throws with every invalid key named. */
export function readEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    // Key names only: environment values are never printed.
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`invalid environment: ${keys}`);
  }
  return parsed.data;
}

/** Session and CSRF keys for an HTTP process; throws (key names only) when either is missing. */
export function authConfig(env: Env): { sessionSecret: string; csrfSecret: string; secureCookie: boolean } {
  const missing = (["SESSION_SECRET", "CSRF_SECRET"] as const).filter((k) => env[k] === undefined);
  if (env.SESSION_SECRET === undefined || env.CSRF_SECRET === undefined) {
    throw new Error(`invalid environment: ${missing.join(", ")} not set`);
  }
  if (env.SESSION_SECRET === env.CSRF_SECRET) {
    throw new Error("invalid environment: SESSION_SECRET and CSRF_SECRET must differ");
  }
  return {
    sessionSecret: env.SESSION_SECRET,
    csrfSecret: env.CSRF_SECRET,
    secureCookie: env.NODE_ENV !== "development",
  };
}

/** True when this mode serves HTTP. `MODE=worker` starts no listener. */
export function servesHttp(mode: Mode): boolean {
  return mode !== "worker";
}
