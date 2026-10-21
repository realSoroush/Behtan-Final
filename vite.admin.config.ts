import { defineConfig, loadEnv } from 'vite';
import { createProAccountHandler } from './server/proAccountHttp.ts';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  cacheDir: "node_modules/.vite-admin",
  plugins: [
    {name:'admin-pro-account-api',configureServer(server){const env=loadEnv(server.config.mode,process.cwd(),'');for(const name of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','PRO_ADMIN_ACCOUNTS_ENABLED'])if(!process.env[name]&&env[name])process.env[name]=env[name];const handler=createProAccountHandler();server.middlewares.use('/api/pro-account',(req,res)=>{void handler(req,res);});}},
    react(),
    {
      name: 'admin-entry',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html
            .replace('/src/main.tsx', '/src/admin/main.tsx')
            .replace(
              '<head>',
              '<head><meta name="robots" content="noindex,nofollow"/>',
            )
            .replace(
              /<title>.*?<\/title>/,
              '<title>مدیریت به‌تن</title>',
            ),
      },
    },
  ],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  server: { port: 5174 },
  build: {
    outDir: 'dist-admin',
    emptyOutDir: true,
  },
});