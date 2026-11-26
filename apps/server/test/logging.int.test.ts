/**
 * Logs (M1-05) against a real Postgres, a real pg-boss and the real app with a capturing logger:
 *   AC 1  P1 P-logs-carry-no-content: request bodies, query strings, path params, headers, cookies,
 *         file names and job payloads carry fast-check markers (Latin with diacritics, CJK,
 *         Devanagari); no captured line contains one. Planted bug first (a raw URL logged as route).
 *   AC 2  every line of a request carries the X-Request-Id it answered with; the job it enqueued
 *         logs the same requestId and its own jobId.
 *   AC 3  P2: an incoming X-Request-Id is echoed only when well formed (planted bug first); one
 *         carrying a newline is replaced, in the app and on the wire.
 * Every value is synthetic.
 */
import { randomUUID } from "node:crypto";
import { request as httpRequest, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { withTx } from "@4x35/db";
import { serve } from "@hono/node-server";
import fc from "fast-check";
import { type Context, Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import {
  type AppEnv,
  createApp,
  createLogger,
  currentContext,
  defineJob,
  enqueueInTx,
  type JobRuntime,
  REQUEST_ID_HEADER,
  startBoss,
} from "../src/index.js";
import { urlFor, waitFor } from "./support.js";

// ── markers ──────────────────────────────────────────────────────────────────────────────────
const chars = (s: string) => fc.constantFrom(...[...s]);
const scriptWord = fc
  .array(
    fc.oneof(
      chars("ÄÖÜäöüßÉÈÊéèêÇçÑñÅåØøŁłŚśŽžĞğİıŐőŰű"),
      chars("東京都千代田区丸の内一丁目二番地上海市浦东新区北京路大阪府"),
      chars("मुंबईनगरदिल्लीमार्गक्षत्रज्ञ"),
    ),
    { minLength: 1, maxLength: 12 },
  )
  .map((a) => a.join(""));
/** 10 letters that never occur in a UUID, a timestamp or a level: the leak detector's anchor. */
const tag = fc
  .array(chars("GHJKLMNPQRSTVWXYZ"), { minLength: 10, maxLength: 10 })
  .map((a) => a.join(""));

interface Marker {
  readonly text: string; // the full marker: script word + tag
  readonly tag: string; // ASCII part, safe in a header
}
const marker: fc.Arbitrary<Marker> = fc
  .tuple(scriptWord, tag, fc.boolean())
  .map(([w, t, nfd]) => ({ text: (nfd ? w.normalize("NFD") : w) + t, tag: t }));

/** One request's markers, one per place content could leak from. */
interface Scenario {
  readonly body: Marker;
  readonly query: Marker;
  readonly path: Marker;
  readonly header: Marker;
  readonly cookie: Marker;
  readonly fileName: Marker;
  readonly payload: Marker;
  readonly error: Marker;
  readonly multipart: boolean;
  readonly throws: boolean;
}
const scenario: fc.Arbitrary<Scenario> = fc.record({
  body: marker,
  query: marker,
  path: marker,
  header: marker,
  cookie: marker,
  fileName: marker,
  payload: marker,
  error: marker,
  multipart: fc.boolean(),
  throws: fc.boolean(),
});

const markersOf = (s: Scenario): Marker[] => [
  s.body,
  s.query,
  s.path,
  s.header,
  s.cookie,
  s.fileName,
  s.payload,
  s.error,
];

/** The forms a marker could take in a JSON log line. */
function leaks(line: string, m: Marker): boolean {
  return (
    line.includes(m.tag) ||
    line.includes(m.text) ||
    line.includes(m.text.normalize("NFC")) ||
    line.includes(JSON.stringify(m.text).slice(1, -1)) ||
    line.includes(encodeURIComponent(m.text))
  );
}

// ── the job the test routes enqueue ─────────────────────────────────────────────────────────
const ProbePayload = z.object({
  name: z.string(),
  lines: z.array(z.string()),
  original: z.string(),
});
defineJob({
  kind: "test.log-probe",
  schema: ProbePayload,
  async handler({ payload }) {
    const log = currentContext()?.log;
    // What a careless handler might log: every one of these is dropped or redacted.
    log?.info({ name: payload.name, lines: payload.lines, payload }, "probe received");
    log?.debug({ checks: { name: payload.name, original: payload.original } }, "probe nested");
  },
});

describe.skipIf(!hasDatabase)("logs (real Postgres + pg-boss + app)", () => {
  let t: TestDb;
  let jobs: JobRuntime;
  const raw: string[] = [];
  const logger = createLogger({
    level: "debug",
    destination: {
      write(s: string) {
        raw.push(s);
      },
    },
  });
  const parsed = (from = 0) =>
    raw.slice(from).map((l) => JSON.parse(l) as Record<string, unknown> & { msg: string });
  let app: Hono<AppEnv>;

  /** Test routes; `leaky` plants the bug P1 must catch: the raw URL logged as the route. */
  const handler = (leaky: boolean) => async (c: Context<AppEnv>) => {
    const log = c.var.log;
    let fields: Record<string, unknown>;
    let fileName: string | undefined;
    if ((c.req.header("content-type") ?? "").startsWith("multipart/")) {
      const form = await c.req.parseBody();
      const file = form.file;
      fileName = file instanceof File ? file.name : undefined;
      fields = JSON.parse(String(form.json));
    } else {
      fields = await c.req.json();
    }
    // What a careless route might log: all dropped (not allow-listed) or redacted.
    log.info(
      { body: fields, query: c.req.query(), fileName, headers: c.req.header(), url: c.req.url },
      "upload received",
    );
    log.debug(
      { checks: { name: fields.name, lines: fields.lines, token: fields.token } },
      "nested",
    );
    if (leaky) log.info({ req: { method: c.req.method, route: c.req.url } }, "leaky");
    const batchId = randomUUID();
    const jobId = await withTx(t.db, (tx) =>
      enqueueInTx(
        tx,
        "test.log-probe",
        {
          name: String(fields.payload),
          lines: [String(fields.payload)],
          original: String(fields.payload),
        },
        { batchId, packRef: "synthetic-pack@1.0.0", step: "probe", chunk: 0 },
      ),
    );
    if (fields.throws === true) throw new Error(`row 1: ${String(fields.error)}`);
    return c.json({ jobId });
  };

  beforeAll(async () => {
    t = await createTestDatabase("logging");
    jobs = await startBoss({
      connectionString: urlFor(t.name),
      mode: "all",
      db: t.db,
      logger,
      pollingIntervalSeconds: 0.5,
    });
    app = createApp({ version: "0.1.0", commit: "test" }, { db: t.db, logger });
    app.post("/test/records/:id", handler(false));
    app.post("/test/leaky/:id", handler(true));
    app.get("/test/ping", (c) => {
      c.var.log.debug("ping one");
      c.var.log.info({ mode: "web" }, "ping two");
      return c.text("pong");
    });
  });

  afterAll(async () => {
    await jobs?.stop();
    await t?.dropAndClose();
  });

  /** Sends one scenario's request; returns the response and the job it enqueued. */
  async function send(route: "records" | "leaky", s: Scenario) {
    const fields = {
      name: s.body.text,
      lines: [s.body.text, `Postfach ${s.body.text}`],
      original: s.body.text,
      token: s.body.tag,
      password: s.body.tag,
      payload: s.payload.text,
      error: s.error.text,
      throws: s.throws,
    };
    const headers: Record<string, string> = {
      "x-supplier": s.header.tag,
      authorization: `Bearer ${s.header.tag}`,
      cookie: `sid=${s.cookie.tag}`,
      "user-agent": "vitest-synthetic",
    };
    let body: FormData | string;
    if (s.multipart) {
      const form = new FormData();
      form.set("json", JSON.stringify(fields));
      form.set("file", new File([s.body.text], `${s.fileName.text}.csv`, { type: "text/csv" }));
      body = form;
    } else {
      headers["content-type"] = "application/json";
      body = JSON.stringify(fields);
    }
    const url = `/test/${route}/${encodeURIComponent(s.path.text)}?town=${encodeURIComponent(s.query.text)}`;
    return app.request(url, { method: "POST", headers, body });
  }

  /** Waits until the job's attempt is logged (it has a `job_timings` row then, too). */
  const jobLogged = (jobId: string) =>
    waitFor(`job ${jobId} logged`, async () =>
      parsed().some((l) => l.jobId === jobId && l.msg === "job attempt") ? true : undefined,
    );

  /** P1 over a route: the request (and its job) leave no marker in any captured line. */
  const noContent = (route: "records" | "leaky") =>
    fc.asyncProperty(scenario, async (s) => {
      const from = raw.length;
      const res = await send(route, s);
      expect(res.status).toBe(s.throws ? 500 : 200);
      // The job was enqueued before any throw (its transaction committed): wait for its attempt,
      // found by the request id it carries.
      const requestId = res.headers.get(REQUEST_ID_HEADER);
      await waitFor("the request's job attempt", async () =>
        parsed(from).some((l) => l.msg === "job attempt" && l.requestId === requestId)
          ? true
          : undefined,
      );
      for (const line of raw.slice(from)) {
        for (const m of markersOf(s)) {
          expect(leaks(line, m), `marker leaked: ${line}`).toBe(false);
        }
      }
    });

  const P1_RUNS = 50;
  const SLOW = 180_000;

  it(
    "P1 P-logs-carry-no-content catches a planted bug (the raw URL logged as the route)",
    async () => {
      const result = await fc.check(noContent("leaky"), {
        numRuns: P1_RUNS,
        seed: 5051,
        endOnFailure: true,
      });
      expect(result.failed, "P-logs-carry-no-content: the planted bug was not caught").toBe(true);
      console.log(
        `P-logs-carry-no-content: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample query marker=${JSON.stringify(result.counterexample?.[0]?.query.text)}`,
      );
    },
    SLOW,
  );

  it(
    `P1 P-logs-carry-no-content: no log line carries a body, query, path, header, cookie, file name, payload or error marker (${P1_RUNS} runs)`,
    async () => {
      await fc.assert(noContent("records"), { numRuns: P1_RUNS });
    },
    SLOW,
  );

  it("AC 2: every line of a request carries its X-Request-Id; its job logs the same requestId and its jobId", async () => {
    const from = raw.length;
    const incoming = "synthetic-req-0001";
    const s = fc.sample(scenario, { numRuns: 1, seed: 7 })[0] as Scenario;
    const res = await app.request(`/test/records/x?town=y`, {
      method: "POST",
      headers: { "content-type": "application/json", [REQUEST_ID_HEADER]: incoming },
      body: JSON.stringify({ name: "n", lines: [], payload: s.payload.text, throws: false }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe(incoming);
    const { jobId } = (await res.json()) as { jobId: string };
    await jobLogged(jobId);
    const lines = parsed(from);
    const requestLines = lines.filter((l) => l.jobId === undefined);
    const jobLines = lines.filter((l) => l.jobId === jobId);
    expect(requestLines.map((l) => l.msg)).toEqual([
      "upload received",
      "nested",
      "request completed",
    ]);
    for (const l of requestLines) expect(l.requestId).toBe(incoming);
    expect(jobLines.map((l) => l.msg)).toEqual(["probe received", "probe nested", "job attempt"]);
    for (const l of jobLines) {
      expect(l.requestId).toBe(incoming);
      expect(l.jobId).toBe(jobId);
    }
    const attempt = jobLines.at(-1) as unknown as { job: Record<string, unknown> };
    expect(attempt.job).toMatchObject({
      kind: "test.log-probe",
      jobId,
      chunk: 0,
      attempt: 1,
      outcome: "completed",
    });
    // The request line: allow-listed fields only (no user-agent was sent, no user or workspace yet).
    const completed = requestLines.at(-1) as unknown as { req: Record<string, unknown> };
    expect(completed.req).toMatchObject({
      method: "POST",
      route: "/test/records/:id",
      status: 200,
    });
    expect(Object.keys(completed.req).sort()).toEqual(["durationMs", "method", "route", "status"]);
  });

  // ── AC 3 / P2 ──────────────────────────────────────────────────────────────────────────────
  const idChar = chars("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-");
  const wellFormed = fc.array(idChar, { minLength: 8, maxLength: 64 }).map((a) => a.join(""));
  /** Header-legal values (no CR/LF: fetch refuses them) that break the pattern. */
  const malformed = fc.oneof(
    fc.array(idChar, { minLength: 1, maxLength: 7 }).map((a) => a.join("")),
    fc.array(idChar, { minLength: 65, maxLength: 90 }).map((a) => a.join("")),
    fc
      .tuple(wellFormed, chars(" ;:,=<>\"'/\\{}[]%.!_~\t"), wellFormed)
      .map(([a, c, b]) => `${a}${c}${b}`),
  );
  const incomingId = fc.oneof(
    fc.constant(undefined),
    wellFormed.map((v) => ({ v, ok: true })),
    malformed.map((v) => ({ v, ok: false })),
  );

  const roundTrip = (target: () => Hono<AppEnv> | Hono) =>
    fc.asyncProperty(incomingId, async (incoming) => {
      const from = raw.length;
      const res = await target().request("/test/ping", {
        headers: incoming === undefined ? {} : { [REQUEST_ID_HEADER]: incoming.v },
      });
      expect(res.status).toBe(200);
      const echoed = res.headers.get(REQUEST_ID_HEADER);
      expect(echoed).toMatch(/^[A-Za-z0-9-]{8,64}$/);
      if (incoming?.ok) expect(echoed).toBe(incoming.v);
      else expect(echoed).not.toBe(incoming?.v);
      const lines = parsed(from);
      expect(lines.map((l) => l.msg)).toEqual(["ping one", "ping two", "request completed"]);
      for (const l of lines) expect(l.requestId).toBe(echoed);
    });

  it("P2 request id round trip catches a planted bug (the incoming header echoed verbatim)", async () => {
    const buggy = new Hono();
    buggy.use(async (c, next) => {
      await next();
      const h = c.req.header(REQUEST_ID_HEADER);
      if (h !== undefined) c.res.headers.set(REQUEST_ID_HEADER, h);
    });
    buggy.route("/", app);
    const result = await fc.check(
      roundTrip(() => buggy),
      {
        numRuns: 200,
        seed: 5052,
        endOnFailure: true,
      },
    );
    expect(result.failed, "P2: the planted bug was not caught").toBe(true);
    console.log(
      `P2 request id round trip: planted bug caught after ${result.numRuns} runs; seed=${result.seed}; counterexample=${JSON.stringify(result.counterexample?.[0])}`,
    );
  });

  it("P2 request id round trip: well-formed ids are echoed, others replaced, every line carries the echoed id (200 runs)", async () => {
    await fc.assert(
      roundTrip(() => app),
      { numRuns: 200 },
    );
  });

  it("AC 3: an X-Request-Id containing a newline is replaced, not echoed (in the app)", async () => {
    // fetch's Headers refuse a newline, so the request carries headers that return one verbatim,
    // as a lenient proxy in front of the app might.
    const req = new Request("http://localhost/test/ping");
    const real = req.headers;
    const rawHeaders = new Proxy(real, {
      get(target, prop) {
        if (prop === "get") {
          return (name: string) =>
            name.toLowerCase() === "x-request-id" ? "abcdefgh\nX-Injected: 1" : target.get(name);
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    Object.defineProperty(req, "headers", { value: rawHeaders });
    const from = raw.length;
    const res = await app.fetch(req);
    const echoed = res.headers.get(REQUEST_ID_HEADER) ?? "";
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/);
    expect(echoed).not.toContain("abcdefgh");
    expect(res.headers.get("x-injected")).toBeNull();
    for (const l of raw.slice(from)) expect(l).not.toContain("Injected");
  });

  it("AC 3: on the wire, a folded X-Request-Id never comes back", async () => {
    const server = await new Promise<Server>((resolve) => {
      const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, () =>
        resolve(s as Server),
      );
    });
    try {
      const { port } = server.address() as AddressInfo;
      const answer = await new Promise<{ status: number; id: string | undefined }>(
        (resolve, reject) => {
          const r = httpRequest({ port, host: "127.0.0.1", path: "/test/ping" }, (res) => {
            res.resume();
            resolve({ status: res.statusCode ?? 0, id: res.headers["x-request-id"] as string });
          });
          r.on("error", reject);
          // A raw request with an obs-folded (newline-continued) header value.
          r.setHeader(REQUEST_ID_HEADER, "abcdefgh");
          r.end();
        },
      );
      expect(answer.status).toBe(200);
      expect(answer.id).toBe("abcdefgh");
      const reply = await new Promise<string>((resolve, reject) => {
        const sock = connect({ port, host: "127.0.0.1" }, () => {
          sock.write(
            "GET /test/ping HTTP/1.1\r\nHost: x\r\nX-Request-Id: abcdefgh\r\n X-Injected: 1\r\nConnection: close\r\n\r\n",
          );
        });
        let out = "";
        sock.on("data", (d) => {
          out += d.toString("latin1");
        });
        sock.on("end", () => resolve(out));
        sock.on("error", reject);
      });
      expect(reply).not.toMatch(/x-request-id:\s*abcdefgh/i);
      expect(reply).not.toMatch(/X-Injected/i);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
