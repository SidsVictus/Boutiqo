import { test, expect } from "@playwright/test";

test("signup -> register -> terms: primary button stays disabled until both boxes are checked", async ({ page }) => {
  await page.goto("/owner/signup");
  await page.getByLabel("Email").fill("new-owner@example-fixture.test");
  await page.getByLabel("Password").fill("anything-1234");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/owner/register");
  await page.getByLabel("Boutique name").fill("Test Boutique");
  await page.getByLabel("Owner name").fill("Test Owner");
  await page.getByLabel("Business category").fill("Ladies tailoring");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.waitForURL("**/owner/terms");
  const continueBtn = page.getByRole("button", { name: "Continue" });
  await expect(continueBtn).toBeDisabled();

  await page.getByLabel("I accept the Terms & conditions").check();
  await expect(continueBtn).toBeDisabled();

  await page.getByLabel("I accept the Privacy policy").check();
  await expect(continueBtn).toBeEnabled();

  await continueBtn.click();
  await page.waitForURL("**/owner/dashboard");
});
