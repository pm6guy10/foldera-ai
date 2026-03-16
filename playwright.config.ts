import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  webServer: {
    command: "npm run build && npm run start",
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
  use: { baseURL: process.env.BASE_URL || "http://localhost:3000", trace: "retain-on-failure" }
});
