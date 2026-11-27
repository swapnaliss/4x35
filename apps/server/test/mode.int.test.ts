/**
 * Startup by MODE (M1-04, AC 4), with the real process startup (`startProcess`, used by main.ts),
 * a real Postgres and a real pg-boss:
 *   MODE=web     listens on PORT and starts no pg-boss worker (an enqueued job stays queued)
 *   MODE=worker  starts the workers (the queued job runs) and does not listen on PORT
 */
import { connect, createServer } from "node:net";
import { withTx } from "@4x35/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createTestDatabase, hasDatabase, type TestDb } from "../../../packages/db/test/harness.js";
import { defineJob, enqueueInTx, type ProcessHandle, readEnv, startProcess } from "../src/index.js";
import { jobState, TEST_KEYS, urlFor, waitFor } from "./support.js";

const ran: string[] = [];
defineJob({
  kind: "test.mode-probe",
  schema: z.object({}),
  async handler({ jobId }) {
    ran.push(jobId);
  },
});

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

/** Resolves true when something accepts a TCP connection on the port, false when refused. */
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe.skipIf(!hasDatabase)("startup by MODE (real Postgres + pg-boss)", () => {
  let t: TestDb;
  let port: number;
  let handle: ProcessHandle | null = null;
  let probeJob: string;
  const info = { version: "0.1.0", commit: "test" };
  const env = (mode: string) =>
    readEnv({
      MODE: mode,
      PORT: String(port),
      DATABASE_URL: urlFor(t.name),
      LOG_LEVEL: "error",
      ...TEST_KEYS,
    });

  beforeAll(async () => {
    t = await createTestDatabase("mode");
    port = await freePort();
  });
  afterAll(async () => {
    await handle?.stop();
    await t?.dropAndClose();
  });

  it("refuses to start without DATABASE_URL, naming the key only", async () => {
    await expect(startProcess(readEnv({ MODE: "web" }), info)).rejects.toThrow(
      "invalid environment: DATABASE_URL is not set",
    );
  });

  it("MODE=web listens on PORT and starts no pg-boss worker", async () => {
    handle = await startProcess(env("web"), info, { pollingIntervalSeconds: 0.5 });
    expect(handle.http).not.toBeNull();
    expect(await listening(port)).toBe(true);
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
    expect(handle.jobs.runsWorkers).toBe(false);
    expect(handle.jobs.workerIds).toEqual([]);
    // It can enqueue, but nothing runs the job: after 3 s (6 poll intervals) it is still queued.
    probeJob = (await withTx(t.db, (tx) =>
      enqueueInTx(
        tx,
        "test.mode-probe",
        {},
        {
          batchId: "6f1c1f4e-2d0b-4a53-9f63-3c1f8a7f0001",
          packRef: "synthetic-pack@1.0.0",
          step: "probe",
          chunk: 0,
        },
      ),
    )) as string;
    await new Promise((r) => setTimeout(r, 3000));
    expect(await jobState(t.db, probeJob)).toBe("created");
    expect(ran).toEqual([]);
    await handle.stop();
    handle = null;
    expect(await listening(port)).toBe(false);
  });

  it("MODE=worker runs the workers and does not listen on PORT", async () => {
    handle = await startProcess(env("worker"), info, { pollingIntervalSeconds: 0.5 });
    expect(handle.http).toBeNull();
    expect(handle.jobs.runsWorkers).toBe(true);
    expect(handle.jobs.workerIds.length).toBeGreaterThan(0);
    await waitFor("the queued probe job to run", async () =>
      (await jobState(t.db, probeJob)) === "completed" ? true : undefined,
    );
    expect(ran).toEqual([probeJob]);
    expect(await listening(port)).toBe(false);
    await handle.stop();
    handle = null;
  });
});
