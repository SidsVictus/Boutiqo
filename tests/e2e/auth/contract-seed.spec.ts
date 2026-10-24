// created by 1v1: black-box acceptance tests, one per contract rule (.1v1/contract.md), frozen at approval.
import { test, expect, devices, type APIRequestContext, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:54321";
const PASSWORD = "correct-horse-1";
const OWNER = "owner@gmail.com";
const OTHER = "other.owner@gmail.com";
const ADMIN = "ops.admin@boutiqo.dev";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function mock(request: APIRequestContext, path: string, body?: unknown) {
  const res = await request.post(`${MOCK}/__mock/${path}`, { data: body ?? {} });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function tables(request: APIRequestContext) {
  return (await request.get(`${MOCK}/__mock/tables`)).json();
}

async function seed(request: APIRequestContext) {
  await mock(request, "seed", {
    users: [
      { email: OWNER, password: PASSWORD },
      { email: OTHER, password: PASSWORD },
      { email: ADMIN, password: PASSWORD },
    ],
    admins: [{ email: ADMIN, name: "Ops Admin", role: "owner_admin" }],
    boutiques: [
      { ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "Tailoring", area: "Banjara Hills", phone: "98480 11111" },
      { ownerEmail: OTHER, name: "Rose Tailors", owner_name: "Rekha", category: "Tailoring", area: "Kondapur", phone: "98480 22222" },
    ],
    customers: [
      { ownerEmail: OWNER, name: "Aisha Fatima", phone: "98480 12345" },
      { ownerEmail: OWNER, name: "Meera Rao", phone: null },
      { ownerEmail: OTHER, name: "Kavya Iyer", phone: "98480 54321" },
    ],
    orders: [
      { ownerEmail: OWNER, customerName: "Aisha Fatima", due_date: "2099-01-10", total_amount: 900, advance_amount: 300, m04_sleeve_length: 14, m10_chest_around: 36.5 },
      { ownerEmail: OTHER, customerName: "Kavya Iyer", due_date: "2099-01-12", total_amount: 700, advance_amount: 0 },
    ],
  });
}

async function login(page: Page, email = OWNER, url = "/owner/login") {
  await page.goto(url);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
}

/** Records, in sessionStorage (it survives navigations in the tab), whether a sign-in control was ever visible. */
async function watchForSignInForm(page: Page) {
  await page.addInitScript(() => {
    const seen = () => {
      for (const el of Array.from(document.querySelectorAll("button, a"))) {
        const name = (el.textContent || "").trim();
        if ((name === "Log in" || name.startsWith("Continue with Google")) && (el as HTMLElement).offsetParent !== null) {
          sessionStorage.setItem("sawSignIn", location.pathname + " " + name);
        }
      }
    };
    const tick = () => { seen(); requestAnimationFrame(tick); };
    new MutationObserver(seen).observe(document, { childList: true, subtree: true });
    requestAnimationFrame(tick);
  });
}

const main = (page: Page) => page.locator(".bq-shell-mobile__content");

test.beforeEach(async ({ request }) => {
  await mock(request, "reset");
  await seed(request);
});

test("R1: a signed-in owner and admin go straight to their dashboards; the sign-in form never shows", async ({ page, browser }) => {
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  await watchForSignInForm(page);
  for (const url of ["/site", "/owner/login"]) {
    await page.goto(url);
    await page.waitForURL("**/owner/dashboard");
    expect(await page.evaluate(() => sessionStorage.getItem("sawSignIn"))).toBeNull();
  }
  // Inside the Android app, the root opens the dashboard.
  await page.addInitScript(() => Object.defineProperty(window, "ReactNativeWebView", { value: { postMessage: () => {} } }));
  await page.goto("/");
  await page.waitForURL("**/owner/dashboard");
  expect(await page.evaluate(() => sessionStorage.getItem("sawSignIn"))).toBeNull();

  // Admin
  const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: "http://localhost:3210" });
  const ap = await ctx.newPage();
  await login(ap, ADMIN, "/admin/login");
  await ap.waitForURL("**/admin/dashboard");
  await watchForSignInForm(ap);
  await ap.goto("/site");
  await ap.waitForURL("**/admin/dashboard");
  expect(await ap.evaluate(() => sessionStorage.getItem("sawSignIn"))).toBeNull();
  await ctx.close();

  // Signed out: the sign-in page is still there.
  const fresh = await browser.newContext({ ...devices["Pixel 7"], baseURL: "http://localhost:3210" });
  const fp = await fresh.newPage();
  await fp.goto("/site");
  await expect(fp.getByRole("link", { name: "Sign in to an existing boutique" })).toBeVisible();
  await fresh.close();
});

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test("R2: with the auth server slow, the dashboard shows the boutique within 3 s", async ({ page }) => {
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.route(`${MOCK}/auth/v1/user*`, async (route) => {
      await new Promise((r) => setTimeout(r, 6000));
      await route.continue().catch(() => {});
    });
    const t0 = Date.now();
    await page.goto("/site", { waitUntil: "commit" });
    await expect(page.getByText("Lotus Boutique").first()).toBeVisible({ timeout: 3000 });
    expect(Date.now() - t0).toBeLessThan(3000);
    await expect(page).toHaveURL(/\/owner\/dashboard$/);
  });
});

test("R3: new-order measurements and amounts start empty and stay empty for any customer; typed values are saved", async ({ page, request }) => {
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  await page.goto("/owner/orders/new");
  const m = main(page);
  const grid = m.getByLabel(/^\d+\. /);
  await expect(grid.first()).toBeVisible();
  const count = await grid.count();
  expect(count).toBe(14);
  for (let i = 0; i < count; i++) await expect(grid.nth(i)).toHaveValue("");
  await m.getByRole("button", { name: "Continue" }).click(); // photos
  await m.getByRole("button", { name: "Continue" }).click(); // work details
  await m.getByLabel(/^Customer/).selectOption({ label: "Aisha Fatima" }); // has an earlier order with measurements
  await m.getByLabel(/^Garment type/).selectOption({ index: 1 });
  await m.getByRole("button", { name: "Back" }).click();
  await m.getByRole("button", { name: "Back" }).click();
  for (let i = 0; i < count; i++) await expect(grid.nth(i)).toHaveValue("");
  await m.getByLabel("2. Full shoulder width").fill("15.5");
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByRole("button", { name: "Continue" }).click(); // delivery date
  await m.locator("button[data-band]").last().click();
  await m.getByRole("button", { name: "Continue" }).click(); // billing
  await expect(m.getByLabel(/^Total amount/)).toHaveValue("");
  await expect(m.getByLabel("Advance received")).toHaveValue("");
  await m.getByLabel(/^Total amount/).fill("1200");
  await m.getByRole("button", { name: "Save order" }).click();
  await page.waitForURL(/\/owner\/orders\/[^/]+\/confirm$/);
  const t = await tables(request);
  const order = t.orders.find((o: { total_amount: number }) => o.total_amount === 1200);
  expect(order.m02_full_shoulder_width).toBe(15.5);
  expect(order.m04_sleeve_length).toBeNull();
  expect(order.m10_chest_around).toBeNull();
  expect(Number(order.advance_amount)).toBe(0);
});

async function ownOrder(request: APIRequestContext) {
  const t = await tables(request);
  const b = t.boutiques.find((x: { name: string }) => x.name === "Lotus Boutique");
  return t.orders.find((o: { boutique_id: string }) => o.boutique_id === b.id);
}

const photos = (page: Page) => main(page).locator('img[alt^="Cloth photo"]');
const uploaded = async (request: APIRequestContext, orderId: string) =>
  (await tables(request)).files.filter((f: { order_id: string; upload_status: string }) => f.order_id === orderId && f.upload_status === "uploaded").length;

test("R4a/e: an order keeps 12 photos across reloads and the tracking page lists them all", async ({ page, request }) => {
  test.setTimeout(180_000);
  const order = await ownOrder(request);
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  await page.goto(`/owner/orders/${order.id}`);
  for (let i = 1; i <= 12; i++) {
    await main(page).locator('input[type="file"]').first().setInputFiles({ name: `cloth-${i}.png`, mimeType: "image/png", buffer: PNG });
    await expect.poll(() => uploaded(request, order.id), { timeout: 20_000 }).toBe(i);
  }
  await page.reload();
  await expect(photos(page)).toHaveCount(12);
  const res = await page.request.get(`/api/track/${order.tracking_token}`);
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const data = body.data ?? body;
  expect(Array.isArray(data.clothPhotoUrls)).toBe(true);
  expect(data.clothPhotoUrls).toHaveLength(12);
  expect(data.clothPhotoUrl).toBe(data.clothPhotoUrls[0]);
});

test("R4b: the new-order wizard uploads several photos", async ({ page, request }) => {
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  await page.goto("/owner/orders/new");
  const m = main(page);
  await m.getByRole("button", { name: "Continue" }).click();
  await m.locator('input[type="file"]').first().setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: PNG },
    { name: "b.png", mimeType: "image/png", buffer: PNG },
    { name: "c.png", mimeType: "image/png", buffer: PNG },
  ]);
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByLabel(/^Customer/).selectOption({ label: "Meera Rao" });
  await m.getByLabel(/^Garment type/).selectOption({ index: 1 });
  await m.getByRole("button", { name: "Continue" }).click();
  await m.locator("button[data-band]").last().click();
  await m.getByRole("button", { name: "Continue" }).click();
  await m.getByLabel(/^Total amount/).fill("800");
  await m.getByRole("button", { name: "Save order" }).click();
  await page.waitForURL(/\/owner\/orders\/[^/]+\/confirm$/);
  const id = page.url().split("/orders/")[1].split("/")[0];
  await expect.poll(() => uploaded(request, id), { timeout: 20_000 }).toBe(3);
  await page.goto(`/owner/orders/${id}`);
  await expect(photos(page)).toHaveCount(3);
});

test("R4c: no size limit: presign accepts 30 MB and 2 GB, and a 25 MB photo uploads", async ({ page, request }) => {
  const order = await ownOrder(request);
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  for (const sizeBytes of [30_000_000, 2_000_000_000]) {
    const res = await page.request.post("/api/uploads/presign", { data: { kind: "cloth_photo", orderId: order.id, mimeType: "image/jpeg", sizeBytes } });
    expect(res.status(), `presign ${sizeBytes}`).toBe(200);
  }
  const big = Buffer.alloc(25 * 1024 * 1024, 7);
  big.set([0xff, 0xd8, 0xff, 0xe0], 0);
  await page.goto(`/owner/orders/${order.id}`);
  await main(page).locator('input[type="file"]').first().setInputFiles({ name: "big.jpg", mimeType: "image/jpeg", buffer: big });
  await expect.poll(() => uploaded(request, order.id), { timeout: 60_000 }).toBe(1);
  await page.reload();
  await expect(photos(page)).toHaveCount(1);
});

test("R4d: a failed storage upload shows an error and is not listed after reload", async ({ page, request }) => {
  const order = await ownOrder(request);
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  await page.route(`${MOCK}/s3/**`, (route) => (route.request().method() === "PUT" ? route.fulfill({ status: 403, body: "denied" }) : route.continue()));
  await page.goto(`/owner/orders/${order.id}`);
  await main(page).locator('input[type="file"]').first().setInputFiles({ name: "x.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(/(photo|upload)[^.]{0,60}(fail|reject|couldn.t|could not)|(fail|reject|couldn.t|could not)[^.]{0,60}(photo|upload|storage)/i).first()).toBeVisible();
  expect(await uploaded(request, order.id)).toBe(0);
  await page.unroute(`${MOCK}/s3/**`);
  await page.reload();
  await expect(photos(page)).toHaveCount(0);
});

test("R4f/g: another boutique's order and other file types are refused", async ({ page, request }) => {
  const t = await tables(request);
  const rose = t.boutiques.find((x: { name: string }) => x.name === "Rose Tailors");
  const theirs = t.orders.find((o: { boutique_id: string }) => o.boutique_id === rose.id);
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  const res = await page.request.post("/api/uploads/presign", { data: { kind: "cloth_photo", orderId: theirs.id, mimeType: "image/png", sizeBytes: 100 } });
  expect([403, 404]).toContain(res.status());
  const mine = await ownOrder(request);
  const pdf = await page.request.post("/api/uploads/presign", { data: { kind: "cloth_photo", orderId: mine.id, mimeType: "application/pdf", sizeBytes: 100 } });
  expect(pdf.status()).toBe(400);
  expect(JSON.stringify(await pdf.json())).toMatch(/jpe?g/i);
});

test("R5: customers can be edited from the list and the customer page; PATCH is scoped and validated", async ({ page, request }) => {
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  await page.goto("/owner/customers");
  await expect(main(page).getByRole("button", { name: "Edit customer" })).toHaveCount(2);
  const t = await tables(request);
  const aisha = t.customers.find((c: { name: string }) => c.name === "Aisha Fatima");
  const kavya = t.customers.find((c: { name: string }) => c.name === "Kavya Iyer");
  await page.goto(`/owner/customers/${aisha.id}`);
  await main(page).getByRole("button", { name: "Edit customer" }).click();
  await expect(main(page).getByLabel(/^Name/)).toHaveValue("Aisha Fatima");
  await expect(main(page).getByLabel(/^Phone/)).toHaveValue("98480 12345");
  await main(page).getByLabel(/^Phone/).fill("12");
  await main(page).getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Enter a valid phone number").first()).toBeVisible();
  expect((await tables(request)).customers.find((c: { id: string }) => c.id === aisha.id).phone).toBe("98480 12345");
  await main(page).getByLabel(/^Name/).fill("Aisha F. Khan");
  await main(page).getByLabel(/^Phone/).fill("98480 99999");
  await main(page).getByLabel(/^Address/).fill("Road 12, Banjara Hills");
  await main(page).getByLabel(/^Instagram/).fill("@aisha.k");
  await main(page).getByRole("button", { name: /^Save/ }).click();
  await expect.poll(async () => (await tables(request)).customers.find((c: { id: string }) => c.id === aisha.id).name).toBe("Aisha F. Khan");
  await page.reload();
  await expect(main(page).getByText("Aisha F. Khan").first()).toBeVisible();
  await expect(main(page).getByText("98480 99999").first()).toBeVisible();
  await page.goto("/owner/customers");
  await expect(main(page).getByText("Aisha F. Khan").first()).toBeVisible();

  const ok = await page.request.patch(`/api/customers/${aisha.id}`, { data: { address: "Road 1" } });
  expect(ok.status()).toBe(200);
  const after = (await tables(request)).customers.find((c: { id: string }) => c.id === aisha.id);
  expect(after.address).toBe("Road 1");
  expect(after.name).toBe("Aisha F. Khan"); // fields not sent are kept
  expect((await page.request.patch(`/api/customers/${aisha.id}`, { data: { phone: "abc" } })).status()).toBe(400);
  expect((await page.request.patch(`/api/customers/${kavya.id}`, { data: { name: "Hacked" } })).status()).toBe(404);
  expect((await tables(request)).customers.find((c: { id: string }) => c.id === kavya.id).name).toBe("Kavya Iyer");
  expect((await page.request.patch(`/api/customers/00000000-0000-4000-8000-000000000000`, { data: { name: "X" } })).status()).toBe(404);
  const anon = await page.context().browser()!.newContext({ baseURL: "http://localhost:3210" });
  expect((await anon.request.patch(`/api/customers/${aisha.id}`, { data: { name: "X" } })).status()).toBe(401);
  await anon.close();
});

test("R6: display, body and monospace fonts are Playfair Display, Inter and JetBrains Mono, and no request 404s", async ({ page }) => {
  const missing: string[] = [];
  page.on("response", (r) => { if (r.status() === 404 && r.url().startsWith("http://localhost:3210")) missing.push(r.url()); });
  for (const url of ["/", "/site"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
    const v = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      const clean = (x: string) => x.trim().replace(/^["']/, "");
      return [clean(s.getPropertyValue("--font-display")), clean(s.getPropertyValue("--font-sans")), clean(s.getPropertyValue("--font-mono"))];
    });
    expect(v[0].startsWith("Playfair Display"), `--font-display on ${url}: ${v[0]}`).toBe(true);
    expect(v[1].startsWith("Inter"), `--font-sans on ${url}: ${v[1]}`).toBe(true);
    expect(v[2].startsWith("JetBrains Mono"), `--font-mono on ${url}: ${v[2]}`).toBe(true);
  }
  expect(missing).toEqual([]);
});

test("R7: the main owner and admin flows raise no page errors, console errors or 5xx responses", async ({ page, browser, request }) => {
  test.setTimeout(180_000);
  const problems: string[] = [];
  const watch = (p: Page) => {
    p.on("pageerror", (e) => problems.push(`pageerror ${p.url()}: ${e.message}`));
    p.on("console", (m) => { if (m.type() === "error") problems.push(`console ${p.url()}: ${m.text()}`); });
    p.on("response", (r) => { if (r.status() >= 500 && r.url().startsWith("http://localhost:3210")) problems.push(`${r.status()} ${r.url()}`); });
  };
  watch(page);
  const order = await ownOrder(request);
  await login(page);
  await page.waitForURL("**/owner/dashboard");
  for (const url of ["/owner/dashboard", "/owner/customers", "/owner/customers/new", "/owner/orders/new", `/owner/orders/${order.id}`,
    `/owner/orders/${order.id}/stage`, "/owner/calendar", "/owner/billing", "/owner/settings", `/track/${order.tracking_token}`]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle");
  }
  const ctx = await browser.newContext({ ...devices["Pixel 7"], baseURL: "http://localhost:3210" });
  const ap = await ctx.newPage();
  watch(ap);
  await login(ap, ADMIN, "/admin/login");
  await ap.waitForURL("**/admin/dashboard");
  const t = await tables(request);
  for (const url of ["/admin/dashboard", "/admin/boutiques", `/admin/boutiques/${t.boutiques[0].id}`]) {
    await ap.goto(url);
    await ap.waitForLoadState("networkidle");
  }
  await ctx.close();
  expect(problems).toEqual([]);
});
