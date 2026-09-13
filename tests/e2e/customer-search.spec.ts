import { test, expect } from "@playwright/test";
import { loginOwner, desktopScope, skipUnlessLive } from "./helpers";

test("customer search filters live as you type", async ({ page }) => {
  skipUnlessLive(test);
  await loginOwner(page);
  const main = desktopScope(page);
  await main.getByRole("link", { name: "Customers" }).click();
  await page.waitForURL("**/owner/customers");

  await expect(main.getByText("Aisha Fatima")).toBeVisible();
  await expect(main.getByText("Meghana Reddy")).toBeVisible();

  await main.getByRole("textbox", { name: "Search customers" }).fill("Aisha");
  await expect(main.getByText("Aisha Fatima")).toBeVisible();
  await expect(main.getByText("Meghana Reddy")).not.toBeVisible();

  await main.getByRole("textbox", { name: "Search customers" }).fill("zzz-no-match");
  await expect(main.getByText("No customers found")).toBeVisible();
});
