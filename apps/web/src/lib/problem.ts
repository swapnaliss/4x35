/** One field-level error inside a problem body (the API's validation errors). */
export interface ProblemFieldError {
  detail: string;
  /** JSON pointer or field name the error refers to. */
  pointer?: string;
}

/** RFC 9457 problem details, as the API returns them with `application/problem+json`. */
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  /** The request's trace id (the API puts it in `instance`). */
  instance?: string;
  errors?: ProblemFieldError[];
  /** Seconds to wait, for 429 (from the body or the Retry-After header). */
  retryAfter?: number;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Reads a problem+json body (or anything thrown) into ProblemDetails. Unknown shapes return an
 * empty object, so the caller falls back to its generic copy instead of showing raw text.
 */
export function toProblem(input: unknown): ProblemDetails {
  if (typeof input !== "object" || input === null || input instanceof Error) return {};
  const o = input as Record<string, unknown>;
  const out: ProblemDetails = {};
  const type = str(o.type);
  const title = str(o.title);
  const detail = str(o.detail);
  const instance = str(o.instance) ?? str(o.traceId);
  if (type) out.type = type;
  if (title) out.title = title;
  if (detail) out.detail = detail;
  if (instance) out.instance = instance;
  if (typeof o.status === "number" && Number.isInteger(o.status)) out.status = o.status;
  if (typeof o.retryAfter === "number" && o.retryAfter >= 0) out.retryAfter = o.retryAfter;
  if (Array.isArray(o.errors)) {
    const errors: ProblemFieldError[] = [];
    for (const e of o.errors) {
      if (typeof e !== "object" || e === null) continue;
      const r = e as Record<string, unknown>;
      const d = str(r.detail) ?? str(r.message);
      if (!d) continue;
      const pointer = str(r.pointer) ?? str(r.field);
      errors.push(pointer ? { detail: d, pointer } : { detail: d });
    }
    if (errors.length > 0) out.errors = errors;
  }
  return out;
}
