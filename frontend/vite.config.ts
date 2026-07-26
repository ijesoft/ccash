import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const permissionPolicy =
  "camera=(self), microphone=(), geolocation=(), clipboard-write=(self), clipboard-read=(), display-capture=()";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8830,
    host: true,
    headers: {
      "Permissions-Policy": permissionPolicy,
    },
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
    headers: {
      "Permissions-Policy": permissionPolicy,
    },
  },
});
