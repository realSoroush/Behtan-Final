import { defineConfig, loadEnv } from "vite";

import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    {
      name: "member-local-api",
      async configureServer(server) {
        const env = loadEnv(server.config.mode, process.cwd(), "");
        for (const name of [
          "VITE_SUPABASE_URL",
          "VITE_SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
          "MEMBER_RELEASE_ENABLED",
        ])
          if (!process.env[name] && env[name]) process.env[name] = env[name];
        const module = await server.ssrLoadModule("/server/member/http.ts");
        const handler = module.memberHandler();
        server.middlewares.use("/api/member", (req, res) => {
          void handler(req, res);
        });
      },
    },
    react(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    manifest: true,
    // Raise the warning threshold a bit (Supabase + Framer Motion are heavy)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: { app: resolve(__dirname, "index.html"), marketing: resolve(__dirname, "site.html") },
      output: {
        manualChunks: {
          // Vendor: React core
          "vendor-react": ["react", "react-dom"],
          // Vendor: Animation
          "vendor-motion": ["framer-motion"],
          // Vendor: Supabase
          "vendor-supabase": ["@supabase/supabase-js"],
          // Vendor: UI utilities
          "vendor-ui": ["lucide-react", "zustand"],
        },
      },
    },
  },
});
