import { test, expect } from "@playwright/test";

const VALID_TOKEN = "demo00000000000000000000000000000000000000000000000000000001";

test("customer tracking page renders the safe subset from a valid token", async ({ page }) => {
  await page.goto(`/track/${VALID_TOKEN}`);
  await expect(page.getByText("BQ-1042")).toBeVisible();
  await expect(page.getByText("Lehenga blouse")).toBeVisible();
  await expect(page.getByRole("button", { name: /Message Meera Boutique/i })).toBeVisible();
  // No nav chrome on the tracking page.
  await expect(page.locator(".bq-tabbar")).toHaveCount(0);
  await expect(page.locator(".bq-sidebar")).toHaveCount(0);
});

test("an invalid token gets a generic not-found message", async ({ page }) => {
  await page.goto("/track/this-token-does-not-exist");
  await expect(page.getByText("Tracking link not found")).toBeVisible();
});
