import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `npm run dev` (outside Docker), proxy /api to the gateway so the
// SPA behaves the same as in production. In the container the built static
// assets are served by NGINX and /api is handled by the gateway.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  server: {
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
