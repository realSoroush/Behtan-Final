import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  plugins: [react(), { name: 'admin-entry', transformIndexHtml: html => html.replace('/src/main.tsx', '/src/admin/main.tsx').replace('<head>', '<head><meta name="robots" content="noindex,nofollow"/>').replace(/<title>.*?<\/title>/, '<title>مدیریت به‌تن</title>') }],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: { port: 5174 },
  build: { outDir: 'dist-admin', emptyOutDir: true },
});
