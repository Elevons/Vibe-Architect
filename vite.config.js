import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so other devices on the local network
    // can open the app (http://<this-machine's-LAN-IP>:5173).
    host: true,
  },
});
