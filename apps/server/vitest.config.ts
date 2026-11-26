import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only. `*.int.test.ts` need Postgres and run in the root `integration` project.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "**/*.int.test.ts"],
  },
});
