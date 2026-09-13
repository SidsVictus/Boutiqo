import type { Page } from "@playwright/test";

/**
 * Both the mobile and web layout trees are always present in the DOM
 * (toggled by a CSS media query, not conditional rendering — see
 * docs/phase2-report.md §5), so an unscoped text/role query matches twice at
 * any viewport. Tests that don't specifically exercise responsiveness should
 * scope queries to whichever tree is actually visible at the current
 * viewport. Default Playwright viewport is desktop-width, hence "web" here.
 */
export function desktopScope(page: Page) {
  return page.locator(".bq-shell-web");
}

export async function loginOwner(page: Page) {
  await page.goto("/owner/login");
  await page.getByText("Fill demo owner credentials").click();
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/owner/dashboard");
}

export async function loginAdmin(page: Page) {
  await page.goto("/admin/login");
  await page.getByText("Fill demo owner-admin credentials").click();
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/admin/dashboard");
}
