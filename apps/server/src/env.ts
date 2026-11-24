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
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses the process environment; throws with every invalid key named. */
export function readEnv(source: Record<string, string | undefined>): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const keys = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`invalid environment: ${keys}`);
  }
  return parsed.data;
}

/** True when this mode serves HTTP. `MODE=worker` starts no listener. */
export function servesHttp(mode: Mode): boolean {
  return mode !== "worker";
}
