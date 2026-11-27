// `Idempotency-Key` on POSTs (ADR 0005, M1-04). Applied to every POST by default (createApp).
//   first request      runs the handler, stores (key, workspace, request hash, response) for 24 h
//   same key and body  replays the stored status and body; the handler does not run again
//   same key, new body 422 problem+json
//   same key in flight 409 problem+json (the first request has not finished)
// A request without the header, or without a resolved workspace (an unauthenticated POST such as
// sign-in), passes through. 5xx responses and thrown errors are not stored, so a retry runs again.
import { createHash } from "node:crypto";
import { type Database, forWorkspace } from "@4x35/db";
import type { Context, MiddlewareHandler } from "hono";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
/** Set on a replayed response. */
export const REPLAYED_HEADER = "Idempotent-Replayed";
export const IDEMPOTENCY_TTL_HOURS = 24;

/** Variables the middleware reads: the requesting workspace, set by the auth middleware (M1-03). */
export interface IdempotencyEnv {
  Variables: { workspaceId?: string };
}

export interface OptOut {
  /**
   * Request path, e.g. `/api/v1/auth/login`; a `{param}` segment matches any one segment
   * (`/api/v1/workspaces/{id}/invites`).
   */
  readonly path: string;
  /** Why this route must not be replayed (ticket handoff: every opt-out says why). */
  readonly reason: string;
}

export interface IdempotencyOptions {
  readonly db: Database;
  /** The workspace of the request. Default: the `workspaceId` variable. */
  readonly workspaceOf?: (c: Context<IdempotencyEnv>) => string | undefined;
  /** POST routes that are never stored or replayed. */
  readonly optOut?: readonly OptOut[];
}

/** The stored replay: status, content type and body text. */
interface StoredResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly body: string;
}
const PENDING = { pending: true } as const;
const isStored = (v: unknown): v is StoredResponse =>
  typeof v === "object" && v !== null && typeof (v as StoredResponse).status === "number";

/** Printable ASCII, 1 to 255 characters. */
const KEY = /^[\x21-\x7e]{1,255}$/;

function problem(c: Context, status: 400 | 409 | 422, title: string, detail: string): Response {
  return c.body(JSON.stringify({ type: "about:blank", title, status, detail }), status, {
    "content-type": "application/problem+json",
  });
}

/** sha256 over method, path and body bytes: the request a key was first used for. */
async function requestHash(c: Context): Promise<string> {
  const body = new Uint8Array(await c.req.arrayBuffer());
  return createHash("sha256").update(`${c.req.method}\n${c.req.path}\n`).update(body).digest("hex");
}

/** A matcher for `path`, where each `{param}` segment matches one non-empty segment. */
export function pathMatcher(path: string): (actual: string) => boolean {
  const want = path.split("/");
  return (actual) => {
    const got = actual.split("/");
    return (
      got.length === want.length &&
      want.every((w, i) => (/^\{[^/]+\}$/.test(w) ? (got[i] ?? "") !== "" : w === got[i]))
    );
  };
}

export function idempotency(options: IdempotencyOptions): MiddlewareHandler<IdempotencyEnv> {
  const { db } = options;
  const workspaceOf = options.workspaceOf ?? ((c) => c.get("workspaceId"));
  const optedOut = (options.optOut ?? []).map((o) => pathMatcher(o.path));

  return async (c, next) => {
    const key = c.req.header(IDEMPOTENCY_HEADER);
    if (c.req.method !== "POST" || key === undefined || optedOut.some((m) => m(c.req.path))) {
      return next();
    }
    const workspaceId = workspaceOf(c);
    if (workspaceId === undefined) return next();
    if (!KEY.test(key)) {
      return problem(c, 400, "Invalid Idempotency-Key", "Use 1 to 255 printable ASCII characters.");
    }
    const hash = await requestHash(c);
    const keys = forWorkspace({ workspaceId }, db).idempotencyKeys;

    // An entry older than 24 h no longer counts: drop it, then claim the key.
    await keys.dropExpired(key, IDEMPOTENCY_TTL_HOURS);
    const claimed = await keys.claim(key, hash, PENDING);

    if (!claimed) {
      const row = await keys.get(key);
      if (row && row.requestHash !== hash) {
        return problem(
          c,
          422,
          "Idempotency-Key reused",
          "This Idempotency-Key was used with a different request body or path.",
        );
      }
      if (!row || !isStored(row.response)) {
        return problem(
          c,
          409,
          "Request in progress",
          "A request with this Idempotency-Key has not finished yet. Retry later.",
        );
      }
      const r = row.response;
      const headers = new Headers({ [REPLAYED_HEADER]: "true" });
      if (r.contentType) headers.set("content-type", r.contentType);
      const noBody = r.status === 204 || r.status === 205 || r.status === 304;
      return new Response(noBody ? null : r.body, { status: r.status, headers });
    }

    try {
      await next();
    } catch (err) {
      await keys.release(key);
      throw err;
    }
    if (c.error !== undefined || c.res.status >= 500) {
      await keys.release(key);
      return;
    }
    const stored: StoredResponse = {
      status: c.res.status,
      contentType: c.res.headers.get("content-type"),
      body: await c.res.clone().text(),
    };
    await keys.store(key, stored);
  };
}
