import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8830,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8831",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/ws": {
        target: "ws://localhost:8831",
        ws: true,
      },
    },
  },
  preview: {
    port: 8830,
    host: true,
    allowedHosts: true,
  },
});