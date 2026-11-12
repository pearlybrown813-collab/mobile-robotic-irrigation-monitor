import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During development the dashboard runs on port 5173 and forwards /api calls
// to the Express server on port 4000. allowedHosts lets GitHub Codespaces'
// forwarded address (https://<name>-5173.app.github.dev) reach the dev server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: { "/api": "http://localhost:4000" },
  },
});
