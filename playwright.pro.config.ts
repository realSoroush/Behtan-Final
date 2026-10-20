import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/pro",
  timeout: 20000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "test-results/pro",
  use: {
    baseURL: "http://127.0.0.1:5175",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.PRO_BROWSER_EXECUTABLE || undefined,
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev:pro -- --host 127.0.0.1",
    url: "http://127.0.0.1:5175",
    reuseExistingServer: false,
    env: {
      VITE_PRO_SANDBOX_ENABLED: "true",
      VITE_SUPABASE_URL: "https://pro-test.supabase.co",
      VITE_SUPABASE_ANON_KEY: "synthetic-test-anon-key",
      VITE_AUTH_DRIVER: "supabase",
    },
  },
});
