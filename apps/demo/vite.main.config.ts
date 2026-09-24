import { defineConfig } from "vite";

// Builds the Electron main process. The renderer uses vite.config.ts.
export default defineConfig({
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
