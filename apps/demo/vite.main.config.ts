import { defineConfig } from "vite";

// Builds the Electron main process. The renderer uses vite.config.ts.
// RESIZE_DEADLINE_FORCED=1 at build time bakes in option D's switches, for a
// "patched" package to compare against a baseline one on the same machine.
export default defineConfig({
  define: {
    __RESIZE_DEADLINE_FORCED__: JSON.stringify(Boolean(process.env["RESIZE_DEADLINE_FORCED"])),
  },
  build: {
    ssr: "src/main/main.ts",
    outDir: "dist-electron",
    target: "node24",
    emptyOutDir: true,
    rolldownOptions: {
      external: ["electron"],
      output: { format: "es", entryFileNames: "[name].js" },
    },
  },
});
