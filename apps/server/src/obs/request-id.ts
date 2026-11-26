// Request correlation (M1-05): every request gets a request id, echoed in `X-Request-Id`, and a
// child logger bound to it. The id and logger also live in an AsyncLocalStorage context, so a job
// enqueued while handling the request carries the same id (`enqueueInTx` reads it), and a job's
// handler runs in a context with the job's originating request id.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";
import type { Logger } from "./logger.js";

export const REQUEST_ID_HEADER = "X-Request-Id";
/** An incoming request id is accepted only in this shape; anything else is replaced, never echoed. */
export const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;

/** The incoming id when it is well formed, otherwise a fresh UUID. */
export function requestIdFrom(header: string | undefined | null): string {
  return typeof header === "string" && REQUEST_ID.test(header) ? header : randomUUID();
}

export interface RequestContext {
  /** The originating request's id; null in a job no request enqueued (e.g. a scheduled one). */
  readonly requestId: string | null;
  readonly log: Logger;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The request (or job) context of the current async call chain, if any. */
export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

/** Runs `fn` with `ctx` as the current context. */
export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/** Variables the middleware sets; `userId` and `workspaceId` are set by auth (M1-03). */
export interface ObsEnv {
  Variables: {
    requestId: string;
    log: Logger;
    userId?: string;
    workspaceId?: string;
  };
}

/**
 * Assigns the request id, echoes it, binds a child logger, and writes one `request completed` line
 * with the allow-listed request fields: method, route pattern (never the raw path or query), status,
 * duration, ids and user-agent.
 */
export function requestLogging(logger: Logger): MiddlewareHandler<ObsEnv> {
  return async (c, next) => {
    const started = performance.now();
    const requestId = requestIdFrom(c.req.header(REQUEST_ID_HEADER));
    const log = logger.child({ requestId });
    c.set("requestId", requestId);
    c.set("log", log);
    await runWithContext({ requestId, log }, () => next());
    c.header(REQUEST_ID_HEADER, requestId);
    const route =
      c.res.status === 404 && routePath(c, -1) === "*" ? "(unmatched)" : routePath(c, -1);
    log.info(
      {
        req: {
          method: c.req.method,
          route,
          status: c.res.status,
          durationMs: Math.round((performance.now() - started) * 10) / 10,
          userId: c.get("userId"),
          workspaceId: c.get("workspaceId"),
          userAgent: c.req.header("user-agent"),
        },
      },
      "request completed",
    );
  };
}
