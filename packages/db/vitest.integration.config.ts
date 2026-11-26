import { defineConfig } from "vitest/config";

// `npm run test:integration -w packages/db`: this workspace's Postgres tests only. The root
// `npm run test:integration` runs the same files through the `integration` project of
// vitest.workspace.ts. Each file gets its own database from test/harness.ts.
export default defineConfig({
  test: {
    name: "db-integration",
    include: ["test/**/*.int.test.ts"],
    globalSetup: ["../../vitest.integration-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
