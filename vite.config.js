import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the app is served under a host route, not at the root.
  base: "./",
  server: {
    host: true,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
