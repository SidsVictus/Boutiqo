import type { Page, TestType } from "@playwright/test";

/**
 * Phase 3: these E2E specs now exercise the REAL integrated app (real
 * Supabase Auth, real RLS, real Postgres) — there is no more mock-session
 * fixture-fill button to click. That means every test in this directory
 * needs: real network access to *.supabase.co, real seeded dev accounts
 * (see docs/phase1-report.md §12 for the account list), and — for the file
 * upload spec — a real, enabled R2 bucket.
 *
 * This session's sandbox blocks outbound network to *.supabase.co entirely
 * (see docs/phase3-report.md "Known limitations" — same policy Phase 1 hit),
 * so these specs cannot be executed here. They're written and reviewed for
 * correctness, gated behind `RUN_LIVE_E2E=1` so a normal development
 * environment can run them once TEST_OWNER_EMAIL/TEST_OWNER_PASSWORD and
 * TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD (real dev credentials) are set.
 */
export const RUN_LIVE_E2E = process.env.RUN_LIVE_E2E === "1";

/** Call as the first line of a test body: `skipUnlessLive(test);`. */
export function skipUnlessLive(t: TestType<object, object>) {
  t.skip(!RUN_LIVE_E2E, "Needs real Supabase network + seeded dev accounts — set RUN_LIVE_E2E=1. See tests/e2e/helpers.ts.");
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} — required when RUN_LIVE_E2E=1`);
  return v;
}

export async function loginOwner(page: Page) {
  await page.goto("/owner/login");
  await page.getByLabel("Email").fill(requiredEnv("TEST_OWNER_EMAIL"));
  await page.getByLabel("Password").fill(requiredEnv("TEST_OWNER_PASSWORD"));
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/owner/dashboard");
}

export async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(requiredEnv("TEST_ADMIN_EMAIL"));
  await page.getByLabel("Password").fill(requiredEnv("TEST_ADMIN_PASSWORD"));
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/admin/dashboard");
}

/**
 * Both the mobile and web layout trees are always present in the DOM
 * (toggled by a CSS media query, not conditional rendering — see
 * docs/phase2-report.md §5), so an unscoped text/role query matches twice at
 * any viewport. Tests that don't specifically exercise responsiveness should
 * scope queries to whichever tree is actually visible at the current
 * viewport. Default Playwright viewport is desktop-width, hence "web" here.
 */
export function desktopScope(page: Page) {
  return page.locator(".bq-shell-web");
}
