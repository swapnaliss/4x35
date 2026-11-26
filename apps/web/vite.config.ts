import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// Local stacks run side by side in worktrees (M0-06): the dev server sits on 5173 + PORT_OFFSET.
export const DEV_PORT = 5173 + Number(process.env.PORT_OFFSET ?? 0);

export default defineConfig({
  plugins: [tailwindcss()],
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  server: { port: DEV_PORT, strictPort: true },
  build: {
    // Production input is index.html only. The component gallery (dev/gallery.html) is served by the
    // dev server and never bundled; the M1-06 gate searches dist/ for the gallery's marker string.
    rollupOptions: { input: "index.html" },
  },
});
