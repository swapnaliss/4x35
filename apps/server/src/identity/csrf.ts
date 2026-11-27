// CSRF (ADR 0013, M1-03): every session has its own random secret (`sessions.csrf_secret`). The
// token the client sends in `X-CSRF-Token` is HMAC-SHA256(CSRF_SECRET, that secret), base64url. It is
// served by `GET /api/v1/me` and required on every non-GET request authenticated by session.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CSRF_HEADER = "X-CSRF-Token";

/** Methods that never change state and are not CSRF-checked. */
export const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/** A new per-session secret: 32 random bytes, base64url. */
export function newCsrfSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function csrfToken(csrfKey: string, sessionCsrfSecret: string): string {
  return createHmac("sha256", csrfKey).update(sessionCsrfSecret).digest("base64url");
}

/** Constant-time check of the header against the session's token. */
export function csrfValid(
  csrfKey: string,
  sessionCsrfSecret: string,
  header: string | undefined,
): boolean {
  if (header === undefined) return false;
  const expected = Buffer.from(csrfToken(csrfKey, sessionCsrfSecret));
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
