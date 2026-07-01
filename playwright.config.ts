import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 8080);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 900 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Assumes `npm run dev` is running. Uncomment to auto-start:
  // webServer: {
  //   command: "npm run dev",
  //   url: BASE_URL,
  //   reuseExistingServer: true,
  //   timeout: 120_000,
  // },
});
