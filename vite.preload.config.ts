import { defineConfig } from "vite";

// Builds the preload script. Sandboxed preloads must be a single CommonJS
// file, so it cannot share chunks with the main process build.
export default defineConfig({
  build: {
    ssr: "src/preload/preload.ts",
    outDir: "dist-electron",
    target: "node24",
    emptyOutDir: false,
    rolldownOptions: {
      external: ["electron"],
      output: { format: "cjs", entryFileNames: "[name].cjs" },
    },
  },
});
