import { test, expect } from "@playwright/test";
import { loginOwner, desktopScope } from "./helpers";

test("full owner new-order flow: A -> E -> save -> confirm", async ({ page }) => {
  await loginOwner(page);
  const main = desktopScope(page);

  await main.getByRole("link", { name: "New order" }).click();
  await page.waitForURL("**/owner/orders/new");

  // Step A: Measurements — leave prefilled values, just confirm the step renders.
  await expect(main.getByText("1. Blouse back length")).toBeVisible();
  await main.getByRole("button", { name: "Continue" }).click();

  // Step B: Cloth photo — skip (optional).
  await expect(main.getByText(/Take \/ choose photo/)).toBeVisible();
  await main.getByRole("button", { name: "Continue" }).click();

  // Step C: Work details.
  await main.getByLabel("Customer").selectOption({ index: 1 });
  await main.getByLabel("Garment type").selectOption("Kurta");
  await main.getByRole("button", { name: "Continue" }).click();

  // Step D: Delivery date — pick the first enabled calendar cell.
  const enabledCell = main.locator(".bq-calendar-cell:not([disabled])").first();
  await enabledCell.click();
  await expect(main.getByText(/other order/i)).toBeVisible();
  await main.getByRole("button", { name: "Continue" }).click();

  // Step E: Billing.
  await main.getByLabel("Total amount").fill("3000");
  await main.getByLabel("Advance received").fill("1000");
  await main.getByRole("button", { name: "Save order" }).click();

  await page.waitForURL(/\/owner\/orders\/.+\/confirm/);
  await expect(main.getByText(/Order BQ-\d{4} created/)).toBeVisible();
});
