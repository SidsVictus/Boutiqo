import { test, expect } from "@playwright/test";
import { skipUnlessLive } from "./helpers";

test("signup -> register -> terms: primary button stays disabled until both boxes are checked", async ({ page }) => {
  skipUnlessLive(test);
  const uniqueEmail = `e2e-owner-${Date.now()}@example.com`;

  await page.goto("/owner/signup");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill("Playwright-Test-1234!");
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
  // Requires the Supabase project's "Confirm email" setting to be off, or
  // signUp() won't return a usable session for POST /api/auth/register to
  // authenticate with — see docs/phase3-report.md "Email confirmation".
  await page.waitForURL("**/owner/dashboard");
});
