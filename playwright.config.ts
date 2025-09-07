import { defineConfig } from "@playwright/test";
export default defineConfig({
  timeout: 30000,
  webServer: { command: "pnpm build && pnpm start", port: 3000, reuseExistingServer: !process.env.CI },
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" }
});
