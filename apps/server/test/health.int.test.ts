/**
 * Liveness and readiness (M1-05, AC 5) with the real process startup (`startProcess`, MODE=all), a
 * real pg-boss and a real Postgres reached through a TCP proxy, so "Postgres stopped" can be
 * played without stopping the database other test files share:
 *   up          /readyz 200, /healthz 200
 *   stopped     every connection dropped and new ones refused: /readyz 503 within 3 s, /healthz 200,
 *               and the process survives its pools' connection errors
 *   black hole  connections accepted but never answered: /readyz 503 within 3 s (the 2 s budget)
 *   back up     /readyz 200 again
 *   jobs gone   pg-boss stopped in a worker mode: /readyz 503 with `jobs: unavailable`
 */
import { createServer, connect as netConnect, type Server, type Socket } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import { createLogger, type ProcessHandle, readEnv, startProcess } from "../src/index.js";
import { urlFor, waitFor } from "./support.js";

type ProxyMode = "forward" | "blackhole";

/** A TCP proxy in front of Postgres that can forward, black-hole, or be stopped. */
class PgProxy {
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  mode: ProxyMode = "forward";
  constructor(
    private readonly target: { host: string; port: number },
    readonly port: number,
  ) {}

  async start(mode: ProxyMode): Promise<void> {
    this.mode = mode;
    const server = createServer((client) => {
      this.track(client);
      if (this.mode === "blackhole") return; // accept, never answer
      const upstream = netConnect(this.target);
      this.track(upstream);
      client.pipe(upstream).pipe(client);
      const drop = () => {
        client.destroy();
        upstream.destroy();
      };
      client.on("error", drop);
      upstream.on("error", drop);
      client.on("close", drop);
      upstream.on("close", drop);
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.port, "127.0.0.1", () => resolve());
    });
    this.server = server;
  }

  /** Stops listening and drops every open connection: new connections are refused. */
  async stop(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private track(s: Socket): void {
    this.sockets.add(s);
    s.on("close", () => this.sockets.delete(s));
    s.on("error", () => {});
  }
}

/** A free TCP port on 127.0.0.1. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      s.close(() => (typeof addr === "object" && addr ? resolve(addr.port) : reject()));
    });
  });
}

describe.skipIf(!hasDatabase)("health and readiness (real process, Postgres via a proxy)", () => {
  let t: TestDb;
  let proxy: PgProxy;
  let handle: ProcessHandle;
  let base: string;
  const raw: string[] = [];
  const errors: Error[] = [];

  beforeAll(async () => {
    t = await createTestDatabase("health");
    const real = new URL(urlFor(t.name));
    proxy = new PgProxy({ host: real.hostname, port: Number(real.port) }, await freePort());
    await proxy.start("forward");
    const viaProxy = new URL(real);
    viaProxy.hostname = "127.0.0.1";
    viaProxy.port = String(proxy.port);
    const port = await freePort();
    handle = await startProcess(
      readEnv({ MODE: "all", PORT: String(port), DATABASE_URL: viaProxy.toString() }),
      { version: "0.1.0", commit: "test" },
      {
        pollingIntervalSeconds: 0.5,
        logger: createLogger({
          level: "debug",
          destination: {
            write(s: string) {
              raw.push(s);
            },
          },
        }),
        onError: (err) => errors.push(err),
      },
    );
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (proxy && proxy.mode !== "forward") {
      await proxy.stop();
      await proxy.start("forward");
    }
    await handle?.stop();
    await proxy?.stop();
    await t?.dropAndClose();
  });

  /** GET a path; returns status, body and the elapsed milliseconds. */
  async function get(path: string): Promise<{ status: number; body: unknown; ms: number }> {
    const started = performance.now();
    const res = await fetch(`${base}${path}`);
    const body = await res.json();
    return { status: res.status, body, ms: Math.round(performance.now() - started) };
  }

  it("with the stack up: /readyz 200 and /healthz 200", async () => {
    const ready = await get("/readyz");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ready", checks: { database: "ok", jobs: "ok" } });
    const health = await get("/healthz");
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: "ok", version: "0.1.0", commit: "test" });
  });

  it("Postgres stopped: /readyz 503 within 3 s, /healthz 200, the process stays up", async () => {
    await proxy.stop();
    const ready = await get("/readyz");
    console.log(`AC 5: /readyz with Postgres stopped: ${ready.status} in ${ready.ms} ms`);
    expect(ready.status).toBe(503);
    expect(ready.ms).toBeLessThan(3_000);
    expect((ready.body as { checks: { database: string } }).checks.database).not.toBe("ok");
    const health = await get("/healthz");
    expect(health.status).toBe(200);
    // Still answering after the pools saw their connections drop.
    await new Promise((r) => setTimeout(r, 1_000));
    expect((await get("/healthz")).status).toBe(200);
    expect((await get("/readyz")).status).toBe(503);
  });

  it("Postgres black-holed: /readyz 503 within 3 s", async () => {
    await proxy.start("blackhole");
    const ready = await get("/readyz");
    console.log(`AC 5: /readyz with Postgres not answering: ${ready.status} in ${ready.ms} ms`);
    expect(ready.status).toBe(503);
    expect(ready.ms).toBeLessThan(3_000);
    expect(ready.body).toMatchObject({ status: "unavailable" });
    expect((await get("/healthz")).status).toBe(200);
    await proxy.stop();
  });

  it("Postgres back: /readyz 200 again", async () => {
    await proxy.start("forward");
    const back = await waitFor(
      "/readyz to recover",
      async () => {
        const r = await get("/readyz");
        return r.status === 200 ? r : undefined;
      },
      15_000,
    );
    expect(back.body).toEqual({ status: "ready", checks: { database: "ok", jobs: "ok" } });
  });

  it("pg-boss stopped in a worker mode: /readyz 503 with jobs unavailable", async () => {
    await handle.jobs.stop();
    const r = await get("/readyz");
    expect(r.status).toBe(503);
    expect(r.body).toEqual({
      status: "unavailable",
      checks: { database: "ok", jobs: "unavailable" },
    });
    expect((await get("/healthz")).status).toBe(200);
    // Nothing the process logged while the database was gone names a value: classes only.
    for (const line of raw) expect(line).not.toMatch(/postgres:\/\/|password/i);
  });
});
