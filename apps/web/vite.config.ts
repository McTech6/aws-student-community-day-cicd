import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Same shape as production, where CloudFront sends /api/* to the API.
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
