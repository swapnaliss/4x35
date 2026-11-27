// Passwords (ADR 0013, M1-03): argon2id through @node-rs/argon2 with the OWASP Password Storage
// Cheat Sheet parameters (m = 19 MiB, t = 2, p = 1), set explicitly so a library default change can
// never weaken them. The encoded `$argon2id$v=19$m=…` string carries its own salt and parameters.
import { hash, verify } from "@node-rs/argon2";

/** `Algorithm.Argon2id` (a const enum, which `verbatimModuleSyntax` cannot import). */
const ARGON2ID = 2;

export const ARGON2 = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordCheck = "ok" | "too_short" | "equals_email";

/** Minimum 12 characters (code points, NFC), and not the account email (case-insensitive). */
export function checkPassword(password: string, email: string): PasswordCheck {
  const p = password.normalize("NFC");
  if ([...p].length < MIN_PASSWORD_LENGTH) return "too_short";
  if (p.trim().toLowerCase() === email.normalize("NFC").trim().toLowerCase()) {
    return "equals_email";
  }
  return "ok";
}

export function hashPassword(password: string): Promise<string> {
  return hash(password.normalize("NFC"), ARGON2);
}

/** False for a wrong password and for a malformed hash (never throws on input). */
export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  try {
    return await verify(encoded, password.normalize("NFC"));
  } catch {
    return false;
  }
}

// A real argon2id hash, computed once, so an unknown email costs the same verify as a known one.
let dummy: Promise<string> | undefined;

/** One verify with the same parameters, result discarded: login for an unknown email. */
export async function burnVerify(password: string): Promise<void> {
  dummy ??= hash("4x35 timing equaliser, not a credential", ARGON2);
  await verifyPassword(await dummy, password);
}
