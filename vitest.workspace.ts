import { defineConfig } from "vitest/config";

// One vitest run over every workspace (root `npm test`). Each workspace is a project, so it can
// still run alone with `npm run test -w <path>`. vitest 5 has no `workspace` file: the name is
// historic. A workspace with `*.int.test.ts` excludes them in its own vitest.config.ts.
//
// `integration` (M0-06): tests against a real Postgres. Run with `npm run test:integration`
// (`--project integration`). Without DATABASE_URL they skip with a message, except in CI, where
// they fail instead.
export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "apps/*",
      "integrations/*",
      {
        test: {
          name: "integration",
          include: ["{packages,apps,integrations}/*/test/**/*.int.test.ts"],
          globalSetup: ["./vitest.integration-setup.ts"],
          // One shared database: files run one after another.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
