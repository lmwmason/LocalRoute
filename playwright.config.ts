import { defineConfig } from "@playwright/test";
const built = process.env.E2E_PRODUCTION === "true";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    locale: "ko-KR",
    baseURL: built ? "http://127.0.0.1:3101" : "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "mobile-390",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
  ],
  webServer: {
    command: built ? "node scripts/e2e-built.mjs" : "npm run dev",
    url: built ? "http://127.0.0.1:3101" : "http://127.0.0.1:5173",
    reuseExistingServer: !process.env.CI,
    env: { VITE_DATA_MODE: "demo" },
    timeout: built ? 180000 : 30000,
  },
});
