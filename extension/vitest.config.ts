import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts (which loads @crxjs/vite-plugin) because the
// crx plugin expects a full extension build context; Vitest only needs plain
// TS/JSX transform + jsdom.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    globals: false,
  },
});
