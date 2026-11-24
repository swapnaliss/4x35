// Global setup of the `integration` vitest project (M0-06). It runs in the main process, so its
// message is printed even when every test file is skipped. Presence check only: never the value.
export default function setup(): void {
  if ((process.env.DATABASE_URL ?? "") !== "") return;
  if (process.env.CI) {
    // CI always provides Postgres to this project: a skip there would hide a broken job.
    throw new Error(
      "integration: DATABASE_URL is not set in CI; the integration job must provide it",
    );
  }
  console.warn(
    "\nintegration: DATABASE_URL is not set, so the Postgres tests are SKIPPED.\n" +
      "  Run `make up`, export DATABASE_URL (README, How to run), then `npm run test:integration`.\n",
  );
}
