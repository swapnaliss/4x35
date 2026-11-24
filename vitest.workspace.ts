import { defineConfig } from "vitest/config";

// One vitest run over every workspace (root `npm test`). Each workspace is a project, so it can
// still run alone with `npm run test -w <path>`. M0-06 adds an integration project here.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*", "integrations/*"],
  },
});
