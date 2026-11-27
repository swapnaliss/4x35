// `npm run bootstrap:admin -w apps/server` (M1-03): creates the first workspace and an owner invite
// for `BOOTSTRAP_ADMIN_EMAIL`, and prints the one-time invite URL to stdout, once. Run again, it
// changes nothing and prints that the invite is pending (or that the owner exists).
//
// Reads `DATABASE_URL`, `BOOTSTRAP_ADMIN_EMAIL` and `APP_BASE_URL` from the environment. Locally,
// any of the three that is not set is taken from the repo's `.env` (the main checkout's when run
// from a git worktree); a variable already set always wins, and no other key is loaded. The email
// is never printed; the URL goes to stdout only, never to a logger. Errors print their class only.
// Runs the built code (the npm script builds first) with Node's own type stripping.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { createDb, createPool, databaseUrl } from "@4x35/db";
import { z } from "zod";
import { bootstrapAdmin } from "../dist/identity/bootstrap.js";

const KEYS = ["DATABASE_URL", "BOOTSTRAP_ADMIN_EMAIL", "APP_BASE_URL"] as const;

/** The `.env` of this checkout, or of the main checkout when this is a git worktree. */
function envFile(): string | undefined {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  if (existsSync(join(root, ".env"))) return join(root, ".env");
  try {
    const common = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    const main = join(dirname(common), ".env");
    return existsSync(main) ? main : undefined;
  } catch {
    return undefined;
  }
}

const file = envFile();
if (file !== undefined) {
  const values = parseEnv(readFileSync(file, "utf8"));
  for (const k of KEYS) {
    if ((process.env[k] ?? "") === "" && values[k] !== undefined) process.env[k] = values[k];
  }
}

const Env = z.object({
  BOOTSTRAP_ADMIN_EMAIL: z.email(),
  APP_BASE_URL: z.url().optional(),
});

const parsed = Env.safeParse({
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  APP_BASE_URL: process.env.APP_BASE_URL === "" ? undefined : process.env.APP_BASE_URL,
});
if (!parsed.success) {
  // Key names only, never values.
  const keys = [...new Set(parsed.error.issues.map((i) => i.path.join(".")))].join(", ");
  process.stderr.write(`bootstrap:admin: invalid environment: ${keys}\n`);
  process.exit(1);
}

const pool = createPool({ connectionString: databaseUrl(), max: 1 });
try {
  const r = await bootstrapAdmin(createDb(pool), {
    email: parsed.data.BOOTSTRAP_ADMIN_EMAIL,
    baseUrl: parsed.data.APP_BASE_URL,
  });
  switch (r.kind) {
    case "invited":
      process.stdout.write(`owner invite (one-time, 72 h): ${r.url}\n`);
      if (parsed.data.APP_BASE_URL === undefined) {
        process.stderr.write("bootstrap:admin: APP_BASE_URL is not set; the link is relative\n");
      }
      break;
    case "pending":
      process.stdout.write(
        "pending owner invite exists for the bootstrap admin; nothing created\n",
      );
      break;
    case "owner_exists":
      process.stdout.write("bootstrap admin is already an owner; nothing created\n");
      break;
  }
} catch (err) {
  process.stderr.write(`bootstrap:admin: failed (${err instanceof Error ? err.name : "error"})\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
