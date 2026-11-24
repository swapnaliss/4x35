import { describe, expect, it } from "vitest";
import { createApp, readEnv, servesHttp } from "../src/index.js";

describe("hello server", () => {
  const app = createApp({ version: "0.1.0", commit: "abc1234" });

  it("GET /healthz answers 200 with status, version and commit", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "0.1.0", commit: "abc1234" });
  });

  it("GET /readyz answers 200", async () => {
    const res = await app.request("/readyz");
    expect(res.status).toBe(200);
  });

  it("reads MODE, PORT, LOG_LEVEL and NODE_ENV with defaults", () => {
    expect(readEnv({})).toEqual({
      NODE_ENV: "development",
      MODE: "all",
      PORT: 8080,
      LOG_LEVEL: "info",
      COMMIT: "unknown",
    });
    const env = readEnv({ MODE: "worker", PORT: "9000", NODE_ENV: "production", COMMIT: "f00" });
    expect(env.MODE).toBe("worker");
    expect(env.PORT).toBe(9000);
  });

  it("rejects an unknown MODE and names the key", () => {
    expect(() => readEnv({ MODE: "batch" })).toThrow(/MODE/);
  });

  it("MODE=worker serves no HTTP; web and all do", () => {
    expect(servesHttp("worker")).toBe(false);
    expect(servesHttp("web")).toBe(true);
    expect(servesHttp("all")).toBe(true);
  });
});
