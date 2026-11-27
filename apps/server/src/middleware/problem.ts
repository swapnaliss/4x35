// RFC 9457 problem details for every auth error (M1-03). One constructor, fixed titles per status, and
// no echo of request content: a body never varies with what the caller sent.
import type { Context } from "hono";

export type ProblemStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422;

export const PROBLEM_TITLES: Readonly<Record<ProblemStatus, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Content",
};

export interface Problem {
  readonly type: "about:blank";
  readonly title: string;
  readonly status: ProblemStatus;
  readonly detail?: string;
}

export function problemBody(status: ProblemStatus, detail?: string): Problem {
  return {
    type: "about:blank",
    title: PROBLEM_TITLES[status],
    status,
    ...(detail === undefined ? {} : { detail }),
  };
}

/** An `application/problem+json` response. `detail` is a constant string, never request content. */
export function problem<S extends ProblemStatus>(c: Context, status: S, detail?: string) {
  return c.json(problemBody(status, detail), status, {
    "content-type": "application/problem+json",
  });
}
