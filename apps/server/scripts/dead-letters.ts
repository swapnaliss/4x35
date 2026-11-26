// `npm run jobs:dead-letters -w apps/server` (M1-05): prints the dead-lettered jobs, newest first, one
// tab-separated line each: kind, job id, batch id, attempts, error class. Never a payload or an error
// message. Reads `DATABASE_URL` (never printed). Optional argument: the limit (default 100).
// Runs the built code (the npm script builds first) with Node's own type stripping.
import { createDb, createPool, databaseUrl, withTx } from "@4x35/db";
import { formatDeadLetters, listDeadLetters } from "../dist/obs/dead-letters.js";

const limit = process.argv[2] === undefined ? 100 : Number(process.argv[2]);
const pool = createPool({ connectionString: databaseUrl(), max: 1 });
try {
  const list = await withTx(createDb(pool), (tx) => listDeadLetters(tx, { limit }));
  process.stdout.write(formatDeadLetters(list));
  process.stderr.write(`dead letters: ${list.length}\n`);
} catch (err) {
  // The class only: a database error can quote a value.
  process.stderr.write(`dead letters: failed (${err instanceof Error ? err.name : "error"})\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
