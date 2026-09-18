import { test, expect } from "@playwright/test";
import { loginOwner, desktopScope, skipUnlessLive } from "./helpers";

test("calendar cells render all three thermal bands from seeded load data", async ({ page }) => {
  skipUnlessLive(test);
  await loginOwner(page);
  const main = desktopScope(page);
  await main.getByRole("link", { name: "Calendar" }).click();
  await page.waitForURL("**/owner/calendar");

  const free = main.locator('.bq-calendar-cell[data-band="free"]').first();
  const low = main.locator('.bq-calendar-cell[data-band="low"]').first();
  const busy = main.locator('.bq-calendar-cell[data-band="busy"]').first();

  await expect(low).toBeVisible();
  await expect(busy).toBeVisible();

  await expect(free).toHaveCSS("background-color", "rgb(226, 243, 234)"); // --green-100
  await expect(low).toHaveCSS("background-color", "rgb(253, 241, 222)"); // --amber-100
  await expect(busy).toHaveCSS("background-color", "rgb(255, 37, 76)"); // --signal-500
});
