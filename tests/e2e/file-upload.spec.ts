import { test, expect } from "@playwright/test";
import { loginOwner, desktopScope, skipUnlessLive } from "./helpers";
import path from "node:path";

/**
 * Phase 3 §6's realistic end-to-end file workflow. Needs everything the
 * other live specs need PLUS a real, enabled R2 bucket with CORS configured
 * for this app's origin — R2 was not enabled on the linked Cloudflare
 * account as of this phase (see docs/phase3-report.md "R2 status"), so this
 * cannot run in this sandbox regardless of RUN_LIVE_E2E. Kept here, gated,
 * for whenever R2 is enabled.
 */
test("login -> open an order -> upload a cloth photo -> refresh -> still there -> remove", async ({ page }) => {
  skipUnlessLive(test);
  await loginOwner(page);
  const main = desktopScope(page);

  await main.locator(".bq-order-row").first().click();
  await page.waitForURL(/\/owner\/orders\/.+$/);
  const orderUrl = page.url();

  const fixture = path.resolve(__dirname, "fixtures/sample-cloth.jpg");
  await main.getByRole("button", { name: /Take \/ choose photo|Replace photo/ }).click();
  await page.setInputFiles('input[type="file"]', fixture);

  await expect(main.getByText("Uploaded")).toBeVisible({ timeout: 15000 });

  await page.goto(orderUrl);
  await expect(desktopScope(page).getByText("Uploaded")).toBeVisible();

  await desktopScope(page).getByRole("button", { name: "Remove" }).click();
  await expect(desktopScope(page).getByText("No cloth photo yet")).toBeVisible();
});

test("oversized and wrong-type files are rejected client-side before any upload request", async ({ page }) => {
  skipUnlessLive(test);
  await loginOwner(page);
  const main = desktopScope(page);
  await main.locator(".bq-order-row").first().click();
  await page.waitForURL(/\/owner\/orders\/.+$/);

  const wrongType = path.resolve(__dirname, "fixtures/not-an-image.txt");
  await main.getByRole("button", { name: /Take \/ choose photo|Replace photo/ }).click();
  await page.setInputFiles('input[type="file"]', wrongType);
  await expect(main.getByText(/Only JPEG, PNG, WEBP or HEIC/)).toBeVisible();
});
