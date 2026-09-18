import { test, expect } from "@playwright/test";
import { skipUnlessLive } from "./helpers";

// Phase 3: points at the real get_order_tracking() RPC via GET /api/track/:token
// — no more fixed mock token. Set TEST_TRACKING_TOKEN (and optionally
// TEST_ORDER_CODE) to a real seeded order's token, e.g. from
// `npm run seed`'s output, to run this for real.
test("customer tracking page renders the safe subset from a valid token", async ({ page }) => {
  skipUnlessLive(test);
  const token = process.env.TEST_TRACKING_TOKEN;
  if (!token) throw new Error("Set TEST_TRACKING_TOKEN to a real seeded order's tracking token to run this test");

  await page.goto(`/track/${token}`);
  if (process.env.TEST_ORDER_CODE) {
    await expect(page.getByText(process.env.TEST_ORDER_CODE)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Message/i })).toBeVisible();
  // No nav chrome on the tracking page.
  await expect(page.locator(".bq-tabbar")).toHaveCount(0);
  await expect(page.locator(".bq-sidebar")).toHaveCount(0);
});

test("an invalid token gets a generic not-found message", async ({ page }) => {
  skipUnlessLive(test);
  await page.goto("/track/this-token-does-not-exist");
  await expect(page.getByText("Tracking link not found")).toBeVisible();
});
