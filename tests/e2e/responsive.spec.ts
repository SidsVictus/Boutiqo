import { test, expect } from "@playwright/test";
import { loginOwner } from "./helpers";

test("layout genuinely switches at the 1024px breakpoint (not just one fixed layout)", async ({ page }) => {
  await loginOwner(page);

  // Below the breakpoint: bottom tab bar visible, sidebar absent.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".bq-tabbar")).toBeVisible();
  await expect(page.locator(".bq-sidebar")).toBeHidden();

  // At/above the breakpoint: sidebar visible, tab bar absent.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator(".bq-sidebar")).toBeVisible();
  await expect(page.locator(".bq-tabbar")).toBeHidden();
});
