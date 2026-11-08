import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./tests/member-intake',workers:1,reporter:'list',outputDir:'test-results/member-intake',
  use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure'},
  projects:[{name:'native-postgrest',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'npm run dev -- --host 127.0.0.1',url:'http://127.0.0.1:5173',reuseExistingServer:false,
    env:{VITE_SUPABASE_URL:'https://pro-test.supabase.co',VITE_SUPABASE_ANON_KEY:'synthetic-browser-anon',VITE_AUTH_DRIVER:'supabase'}}});
