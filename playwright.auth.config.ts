import { defineConfig, devices } from "@playwright/test";

// Offline end-to-end tests for every sign-in flow (tests/e2e/auth): the real
// app and the real supabase-js client, against an in-memory stand-in for
// Supabase Auth/PostgREST (tests/e2e/auth/supabase-mock.mjs). Unlike the
// live suite (playwright.config.ts) this needs no network or real accounts.
//   npm run test:e2e:auth
const MOCK = "http://127.0.0.1:54321";

export default defineConfig({
  testDir: "./tests/e2e/auth",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // one shared mock backend
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3210",
    trace: "retain-on-failure",
    ...devices["Pixel 7"],
    launchOptions: { executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" },
  },
  webServer: [
    {
      command: "node tests/e2e/auth/supabase-mock.mjs",
      url: `${MOCK}/`,
      reuseExistingServer: !!process.env.REUSE_SERVERS,
      timeout: 20_000,
    },
    {
      command: "npm run build && npx next start -p 3210",
      url: "http://localhost:3210/privacy",
      reuseExistingServer: !!process.env.REUSE_SERVERS,
      timeout: 300_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: MOCK,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        // Photo storage: the mock's S3 stand-in (rejects checksum-mismatched PUTs like R2).
        R2_ACCOUNT_ID: "test",
        R2_ACCESS_KEY_ID: "test-key",
        R2_SECRET_ACCESS_KEY: "test-secret",
        R2_BUCKET_NAME: "boutiqo-test",
        R2_ENDPOINT: `${MOCK}/s3`,
      },
    },
  ],
});
