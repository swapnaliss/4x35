import { defineConfig } from "vitest/config";

// `npm run test:integration -w apps/server`: this workspace's Postgres + pg-boss tests only. The root
// `npm run test:integration` runs the same files through the `integration` project of
// vitest.workspace.ts. Each file gets its own database from packages/db/test/harness.ts.
export default defineConfig({
  test: {
    name: "server-integration",
    include: ["test/**/*.int.test.ts"],
    globalSetup: ["../../vitest.integration-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
