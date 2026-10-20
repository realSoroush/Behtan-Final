import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  plugins: [
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
