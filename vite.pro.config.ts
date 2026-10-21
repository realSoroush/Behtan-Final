import { createPlanHandler } from "./server/proPlanHttp.ts";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
    {
      name: 'pro-local-api',
      configureServer(server) {
        const env = loadEnv(server.config.mode, process.cwd(), '');
        for (const name of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRO_SERVER_PLANS_ENABLED']) {
          if (!process.env[name] && env[name]) process.env[name] = env[name];
        }
        const handler = createPlanHandler();
        server.middlewares.use('/api/pro-plan', (req, res) => { void handler(req, res); });
      },
    },
    react(),
    {
      name: "professional-entry",
      transformIndexHtml: {
        order: "pre",
        handler: (html) =>
          html
            .replace("/src/main.tsx", "/src/professional/main.tsx")
            .replace(
              "<head>",
              '<head><meta name="robots" content="noindex,nofollow"/>',
            )
            .replace(/<title>.*?<\/title>/, "<title>به‌تن حرفه‌ای</title>"),
      },
    },
  ],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: { port: 5175 },
  build: { outDir: "dist-pro", emptyOutDir: true },
});
