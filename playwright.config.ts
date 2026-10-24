import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

// Use the sandbox's pre-installed Chromium when there is one (PLAYWRIGHT_CHROMIUM_PATH
// overrides); otherwise leave it to Playwright's own browser download.
const CHROMIUM_CANDIDATES = [process.env.PLAYWRIGHT_CHROMIUM_PATH, "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"];
const executablePath = CHROMIUM_CANDIDATES.find((p): p is string => !!p && fs.existsSync(p));

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["auth/**"], // offline auth suite has its own config: playwright.auth.config.ts
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3200",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } },
    },
  ],
  webServer: {
    command: "npm run build && npm run start -- -p 3200",
    url: "http://localhost:3200",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
