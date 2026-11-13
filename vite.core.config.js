import { defineConfig } from "vite";

/**
 * Headless build: emits `dist/core.js`, the graph rules and prompt builder a
 * host imports (for example Bartleby's architect toolset). No DOM, no React.
 */
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: "src/core.ts",
      formats: ["es"],
      fileName: () => "core.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
