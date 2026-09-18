import { test, expect } from "@playwright/test";
import { loginOwner, desktopScope, skipUnlessLive } from "./helpers";

test("updating an order's stage shows the toast and strikes through completed rows", async ({ page }) => {
  skipUnlessLive(test);
  await loginOwner(page);
  const main = desktopScope(page);

  await main.locator(".bq-order-row").first().click();
  await page.waitForURL(/\/owner\/orders\/.+$/);
  await desktopScope(page).getByRole("link", { name: "Update stage" }).click();
  await page.waitForURL(/\/owner\/orders\/.+\/stage/);

  // Move to "Delivered" (the last row) so every earlier row becomes "done".
  await desktopScope(page).getByRole("button", { name: "Delivered" }).click();
  await expect(page.getByText(/moved to delivered\./i)).toBeVisible();

  // Re-open the stage screen to inspect the resulting row states directly
  // (the toast redirect above navigates away before we can inspect this page).
  await page.waitForURL(/\/owner\/orders\/.+$/);
  await desktopScope(page).getByRole("link", { name: "Update stage" }).click();
  await page.waitForURL(/\/owner\/orders\/.+\/stage/);

  const receivedRow = desktopScope(page).getByRole("button", { name: "Received" });
  await expect(receivedRow).toHaveAttribute("data-done", "true");
  await expect(receivedRow.locator(".bq-stage-row__label")).toHaveCSS("text-decoration-line", "line-through");
});
