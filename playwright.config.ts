import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  reporter: process.env.CI === "true" ? "dot" : "list",
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    acceptDownloads: true,
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: [
    {
      command: "npm run e2e:api",
      port: 8080,
      reuseExistingServer: false,
      timeout: 20_000,
    },
    {
      command: "npm run dev --workspace apps/web -- --host 0.0.0.0 --port 5173",
      port: 5173,
      reuseExistingServer: false,
      timeout: 20_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
