import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs so the packaged renderer loads over file://.
  base: "./",
  plugins: [react(), tailwindcss()],
});
