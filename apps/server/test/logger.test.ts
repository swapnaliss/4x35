// Logger unit tests (M1-05): allow-lists, redaction, error class only, no interpolation.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CENSOR,
  createLogger,
  errorClass,
  JOB_FIELDS,
  REQUEST_FIELDS,
  redact,
  requestIdFrom,
  serializers,
} from "../src/index.js";

/** A logger writing into an array of parsed lines. */
export function capture(level: "debug" | "info" = "debug") {
  const raw: string[] = [];
  const logger = createLogger({
    level,
    destination: {
      write(s: string) {
        raw.push(s);
      },
    },
  });
  const lines = () => raw.map((l) => JSON.parse(l) as Record<string, unknown>);
  return { logger, raw, lines };
}

describe("logger (M1-05)", () => {
  it("writes JSON lines with an ISO time and the level as a label", () => {
    const { logger, lines } = capture();
    logger.info({ mode: "all" }, "started");
    const [line] = lines();
    expect(line).toMatchObject({ level: "info", msg: "started", mode: "all" });
    expect(typeof line?.time).toBe("string");
  });

  it("drops top-level keys outside the allow-list and counts them", () => {
    const { logger, raw, lines } = capture();
    logger.info({ body: "Hauptstraße 5", fileName: "suppliers.csv", mode: "web" }, "x");
    expect(lines()[0]).toEqual(
      expect.objectContaining({ mode: "web", droppedFields: 2, msg: "x" }),
    );
    expect(raw.join("")).not.toContain("Hauptstraße");
    expect(raw.join("")).not.toContain("suppliers.csv");
  });

  it("req and job keep only their allow-listed scalar fields", () => {
    const { logger, raw, lines } = capture();
    logger.info(
      {
        req: {
          method: "POST",
          route: "/api/v1/batches",
          status: 201,
          url: "/api/v1/batches?town=Zürich",
          headers: { cookie: "sid=secret" },
          body: { lines: ["東京都千代田区"] },
          userAgent: "curl/8",
        },
        job: { kind: "parse", jobId: "j1", chunk: 0, payload: { name: "Ramesh" }, ms: 5 },
      },
      "x",
    );
    const line = lines()[0] as { req: unknown; job: unknown };
    expect(line.req).toEqual({
      method: "POST",
      route: "/api/v1/batches",
      status: 201,
      userAgent: "curl/8",
    });
    expect(line.job).toEqual({ kind: "parse", jobId: "j1", chunk: 0, ms: 5 });
    for (const s of ["Zürich", "secret", "東京", "Ramesh"]) expect(raw.join("")).not.toContain(s);
  });

  it("redacts password, token, *.original*, *.lines* and *.name at any depth", () => {
    expect(
      redact(
        {
          password: "p",
          apiToken: "t",
          nested: {
            original: "o",
            originalLines: ["l"],
            lines: ["l"],
            name: "n",
            ok: 1,
            deeper: { name: "n2", kept: true },
          },
        },
        0,
      ),
    ).toEqual({
      password: CENSOR,
      apiToken: CENSOR,
      nested: {
        original: CENSOR,
        originalLines: CENSOR,
        lines: CENSOR,
        name: CENSOR,
        ok: 1,
        deeper: { name: CENSOR, kept: true },
      },
    });
  });

  it("redacts inside allow-listed objects such as checks", () => {
    const { logger, raw } = capture();
    logger.info({ checks: { database: "ok", token: "abc123secret", name: "Priya" } }, "x");
    expect(raw.join("")).not.toContain("abc123secret");
    expect(raw.join("")).not.toContain("Priya");
  });

  it("logs an error by its class only, never its message or stack", () => {
    const { logger, raw, lines } = capture();
    class ParseFailure extends Error {}
    logger.error(new Error("row 3: Müller GmbH, Hauptstraße 5"));
    logger.error({ err: new ParseFailure("मुंबई") }, "failed");
    logger.error({ err: new TypeError("x") }, "failed");
    expect(lines().map((l) => [l.msg, l.err])).toEqual([
      ["error", { type: "Error" }],
      ["failed", { type: "ParseFailure" }],
      ["failed", { type: "TypeError" }],
    ]);
    for (const s of ["Müller", "मुंबई", "stack", "at "]) expect(raw.join("")).not.toContain(s);
  });

  it("never formats printf-style values into the message", () => {
    const { logger, raw } = capture();
    logger.info("parsed %s", "Rua Augusta 10");
    logger.info({ mode: "web" }, "row %s", "Calle Mayor 1");
    expect(raw.join("")).not.toContain("Rua Augusta");
    expect(raw.join("")).not.toContain("Calle Mayor");
  });

  it("errorClass keeps identifiers only", () => {
    expect(errorClass(new RangeError("x"))).toBe("RangeError");
    expect(errorClass({ name: "Bad name with spaces" })).toBe("UnnamedError");
    expect(errorClass("a string")).toBe("NonError");
  });

  it("requestIdFrom accepts 8..64 of [A-Za-z0-9-] and replaces anything else", () => {
    expect(requestIdFrom("abcd-1234")).toBe("abcd-1234");
    for (const bad of [
      "abc\ndefgh",
      "abcdefgh\n",
      "short",
      "a".repeat(65),
      "has space x",
      "üñíçødé-id",
      "abcdefgh;x=1",
      "",
      undefined,
      null,
    ]) {
      const id = requestIdFrom(bad);
      expect(id).not.toBe(bad);
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  // P4: whatever object reaches `req` or `job`, only allow-listed keys come out.
  const extraKey = fc.constantFrom(
    "body",
    "url",
    "query",
    "headers",
    "cookie",
    "fileName",
    "name",
    "lines",
    "original",
    "payload",
    "authorization",
  );
  const value = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.dictionary(fc.string(), fc.string()),
  );
  const input = (fields: readonly string[]) =>
    fc
      .tuple(
        fc.dictionary(fc.constantFrom(...fields), value),
        fc.dictionary(fc.oneof(extraKey, fc.string()), value),
      )
      .map(([allowed, extra]) => ({ ...extra, ...allowed }));
  type Serializer = (raw: unknown) => Record<string, unknown>;
  const allowListOnly = (fields: readonly string[], serialize: Serializer) =>
    fc.property(input(fields), (raw) => {
      const out = serialize(raw);
      for (const k of Object.keys(out)) expect(fields).toContain(k);
      for (const v of Object.values(out)) expect(typeof v).not.toBe("object");
    });

  it("P4 serializers emit only allow-listed fields catches a planted bug (input spread)", () => {
    const spread: Serializer = (raw) => ({ ...(raw as object) });
    const result = fc.check(allowListOnly(REQUEST_FIELDS, spread), { numRuns: 200, seed: 5054 });
    expect(result.failed, "P4: the planted bug was not caught").toBe(true);
    console.log(
      `P4 allow-listed fields: planted bug caught after ${result.numRuns} runs; seed=${result.seed}`,
    );
  });

  it("P4 serializers emit only allow-listed scalar fields (req and job, 1000 runs each)", () => {
    fc.assert(allowListOnly(REQUEST_FIELDS, serializers.req), { numRuns: 1000 });
    fc.assert(allowListOnly(JOB_FIELDS, serializers.job), { numRuns: 1000 });
  });
});
