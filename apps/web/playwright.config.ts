import { defineConfig } from "@playwright/test";

// Gallery a11y and design-review screenshots (M1-06), later the app e2e suites. The dev server
// serves dev/gallery.html; ports follow PORT_OFFSET so parallel worktrees never collide.
const port = 5173 + Number(process.env.PORT_OFFSET ?? 0);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: [["list"]],
  use: {
    baseURL,
    // P-30: the installed Google Chrome, the same engine the reviewer screenshots come from.
    channel: process.env.PW_CHANNEL ?? "chrome",
    reducedMotion: "reduce",
  },
  webServer: {
    command: `npx vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/dev/gallery.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
