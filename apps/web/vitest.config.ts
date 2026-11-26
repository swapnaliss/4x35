import { defineConfig } from "vitest/config";

// Component tests run in jsdom. Playwright specs (e2e/) are not vitest tests.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    name: "web",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    setupFiles: ["./test/setup.ts"],
  },
});
