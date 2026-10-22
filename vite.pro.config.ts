import {createBodyHandler} from "./server/proBodyHttp.ts";
import { createPlanHandler } from "./server/proPlanHttp.ts";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  cacheDir: "node_modules/.vite-pro",
  plugins: [
    {
      name: 'pro-local-api',
      configureServer(server) {
        const env = loadEnv(server.config.mode, process.cwd(), '');
        for (const name of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRO_SERVER_PLANS_ENABLED','PRO_BODY_SCAN_ENABLED','OPENAI_API_KEY','PRO_BODY_SCAN_MODEL']) {
          if (!process.env[name] && env[name]) process.env[name] = env[name];
        }
        const bodyHandler=createBodyHandler();
        server.middlewares.use('/api/pro-body-scan',(req,res)=>{void bodyHandler(req,res)});
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
