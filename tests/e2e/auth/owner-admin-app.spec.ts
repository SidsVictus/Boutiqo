import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// The signed-in app end to end (owner + super admin), on a phone-sized screen,
// against the in-memory Supabase/R2 stand-in (supabase-mock.mjs).
const MOCK = "http://127.0.0.1:54321";
const PASSWORD = "correct-horse-1";
const OWNER = "owner@gmail.com";
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

const alertBox = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function seedOwner(request: APIRequestContext, opts: { boutiquePhone?: string | null; customerPhone?: string | null } = {}) {
  await mock(request, "seed", {
    users: [{ email: OWNER, password: PASSWORD }],
    boutiques: [{ ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "Tailoring", area: "Banjara Hills", phone: "boutiquePhone" in opts ? opts.boutiquePhone : "98480 11111" }],
    customers: [{ ownerEmail: OWNER, name: "Aisha Fatima", phone: opts.customerPhone ?? null }],
  });
}

async function login(page: Page, email = OWNER, url = "/owner/login") {
  await page.goto(url);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.beforeEach(async ({ request }) => {
  await mock(request, "reset");
});

test.describe("Owner app", () => {
  test("mobile: tab bar is at the top, sign out is reachable from the top bar and from Settings", async ({ page, request }) => {
    await seedOwner(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");

    const tabs = page.getByRole("navigation", { name: "Main" }).first();
    await expect(tabs).toBeVisible();
    const tabsBox = (await tabs.boundingBox())!;
    const title = page.locator(".bq-shell-mobile .bq-appbar__title");
    expect(tabsBox.y).toBeLessThan(5); // at the very top, under the status bar
    expect((await title.boundingBox())!.y).toBeGreaterThan(tabsBox.y); // title row below it
    await expect(page.locator(".bq-shell-mobile").getByRole("link", { name: "Sign out" })).toBeVisible();

    await tabs.getByRole("link", { name: "Settings" }).click();
    await page.waitForURL("**/owner/settings");
    await page.locator(".bq-shell-mobile__content").getByRole("link", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Signed out" })).toBeVisible();
    await page.goto("/owner/dashboard");
    await page.waitForURL("**/owner/login");
  });

  test("Settings: edit boutique details, validated, saved", async ({ page, request }) => {
    await seedOwner(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/settings");
    const main = page.locator(".bq-shell-mobile__content");
    await expect(main.getByLabel("Boutique name")).toHaveAttribute("readonly", "");
    await main.getByRole("button", { name: "Edit details" }).click();
    await main.getByLabel(/^Boutique name/).fill("Lotus Couture");
    await main.getByLabel("GST number").fill("123");
    await main.getByRole("button", { name: "Save changes" }).click();
    await expect(main.getByText("GST number must be 15 characters")).toBeVisible();
    await main.getByLabel("GST number").fill("36aabcu9603r1zm");
    await expect(main.getByLabel("GST number")).toHaveValue("36AABCU9603R1ZM");
    await main.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Boutique details saved.")).toBeVisible();
    const t = await tables(request);
    expect(t.boutiques[0].name).toBe("Lotus Couture");
    expect(t.boutiques[0].gst_number).toBe("36AABCU9603R1ZM");
    expect(t.boutiques[0].status).toBe("active");
  });

  test("new order: voice fills measurements, cloth photo uploads, tracking link goes to WhatsApp, tracking page works", async ({ page, request }) => {
    await seedOwner(request, { customerPhone: null });
    // Fake Web Speech API: says one phrase when started.
    await page.addInitScript(() => {
      class FakeRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        onresult: ((e: unknown) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        onend: (() => void) | null = null;
        start() {
          setTimeout(() => {
            const result = Object.assign([{ transcript: "sleeve length 14, chest 36 and a half" }], { isFinal: true });
            this.onresult?.({ resultIndex: 0, results: [result] });
          }, 300);
        }
        stop() {
          this.onend?.();
        }
        abort() {}
      }
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
        Object.defineProperty(window, name, { value: FakeRecognition, configurable: true, writable: true });
      }
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "New order" }).click();
    await page.waitForURL("**/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");

    // A: voice
    await main.getByRole("button", { name: "Voice" }).click();
    const mic = main.getByRole("button", { name: "Start voice input" });
    await mic.click();
    await expect(main.getByRole("button", { name: "Stop listening" })).toHaveAttribute("data-listening", "true");
    await expect(main.locator(".bq-voice-mic__ring").first()).toBeVisible();
    await expect(main.locator(".bq-voice-panel__title")).toContainText("Listening");
    await expect(main.getByLabel("Captured measurements")).toContainText("Sleeve length: 14");
    await expect(main.getByLabel("4. Sleeve length")).toHaveValue("14");
    await expect(main.getByLabel("10. Chest around")).toHaveValue("36.5");
    await main.getByRole("button", { name: "Stop listening" }).click({ force: true }); // it pulses while listening, so never "stable"
    await main.getByRole("button", { name: "Continue" }).click();

    // B: cloth photo
    await main.locator('input[type="file"]').setInputFiles({ name: "cloth.png", mimeType: "image/png", buffer: PNG });
    await expect(main.getByText("Selected — uploads with the order")).toBeVisible();
    await main.getByRole("button", { name: "Continue" }).click();

    // C: work details
    await main.getByLabel(/^Customer/).selectOption({ label: "Aisha Fatima" });
    await main.getByLabel(/^Garment type/).selectOption({ index: 1 });
    await main.getByRole("button", { name: "Continue" }).click();

    // D: delivery date
    await main.locator("button[data-band]").last().click();
    await main.getByRole("button", { name: "Continue" }).click();

    // E: billing
    await main.getByLabel(/^Total amount/).fill("1500");
    await main.getByLabel("Advance received").fill("500");
    await expect(main.getByText("₹1,000")).toBeVisible();
    await main.getByRole("button", { name: "Save order" }).click();
    await page.waitForURL(/\/owner\/orders\/[^/]+\/confirm$/);
    await expect(page.getByText(/cloth photo failed to upload/)).toHaveCount(0);

    let t = await tables(request);
    const order = t.orders[0];
    expect(order.m04_sleeve_length).toBe(14);
    expect(order.m10_chest_around).toBe(36.5);
    expect(order.cloth_photo_file_id).toBeTruthy();
    expect(t.files[0].upload_status).toBe("uploaded");

    // Tracking link: customer has no phone, so it asks for one; then WhatsApp.
    await expect(main.getByText("Aisha Fatima has no phone number yet.")).toBeVisible();
    await expect(main.getByText(`/track/${order.tracking_token}`)).toBeVisible();
    await main.getByLabel("Customer's WhatsApp number").fill("123");
    await main.getByRole("button", { name: "Save number" }).click();
    await expect(main.getByText("Enter a valid mobile number")).toBeVisible();
    await main.getByLabel("Customer's WhatsApp number").fill("98480 12345");
    await main.getByRole("button", { name: "Save number" }).click();
    const wa = main.getByRole("link", { name: "Send tracking link on WhatsApp" });
    await expect(wa).toBeVisible();
    const href = (await wa.getAttribute("href"))!;
    expect(href.startsWith("https://wa.me/919848012345?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain(`/track/${order.tracking_token}`);
    t = await tables(request);
    expect(t.customers[0].phone).toBe("98480 12345");

    // Order record: mark paid, update stage.
    await main.getByRole("link", { name: "View order record" }).click();
    await page.waitForURL(`**/owner/orders/${order.id}`);
    await expect(main.locator("img[alt='Cloth photo preview'], img[alt='Cloth photo']").first()).toBeVisible().catch(() => {});
    await main.getByRole("button", { name: "Mark paid" }).click();
    await expect(page.getByText(`Order ${order.order_code} marked paid.`)).toBeVisible();
    await expect(main.getByText("Paid in full")).toBeVisible();
    await main.getByRole("link", { name: "Update stage" }).click();
    await page.waitForURL(`**/owner/orders/${order.id}/stage`);
    await main.getByRole("button", { name: /Stitching/ }).click();
    await page.waitForURL(`**/owner/orders/${order.id}`);
    t = await tables(request);
    expect(t.orders[0].stage).toBe("stitching");
    expect(t.orders[0].paid).toBe(true);

    // Customer's tracking page (no login): progress, photo, message boutique.
    const customer = await page.context().browser()!.newContext({ baseURL: "http://localhost:3210" });
    const cp = await customer.newPage();
    await cp.goto(`/track/${order.tracking_token}`);
    await expect(cp.getByText(order.order_code)).toBeVisible();
    await expect(cp.getByText("Your order is at: Stitching.")).toBeVisible();
    const photo = cp.locator("img[alt='Cloth photo']");
    await expect(photo).toBeVisible();
    expect(await photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
    const message = cp.getByRole("link", { name: "Message Lotus Boutique" });
    expect((await message.getAttribute("href"))!.startsWith("https://wa.me/919848011111?text=")).toBe(true);
    await customer.close();
  });

  test("voice input explains a blocked microphone", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      class Denied {
        onerror: ((e: unknown) => void) | null = null;
        onresult = null;
        onend = null;
        lang = "";
        continuous = false;
        interimResults = false;
        start() {
          setTimeout(() => this.onerror?.({ error: "not-allowed" }), 50);
        }
        stop() {}
        abort() {}
      }
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, name, { value: Denied, configurable: true, writable: true });
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Voice" }).click();
    await main.getByRole("button", { name: "Start voice input" }).click();
    await expect(main.getByText("Microphone permission is blocked")).toBeVisible();
  });

  test("voice input falls back clearly where speech recognition doesn't exist (Android app WebView)", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Voice" }).click();
    await expect(main.getByText("Voice input isn't available here")).toBeVisible();
    await expect(main.getByLabel("4. Sleeve length")).toBeVisible();
  });

  test("tracking page hides 'Message boutique' when the boutique has no phone; bad token is a clean 404", async ({ page, request }) => {
    await seedOwner(request, { boutiquePhone: null });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    // Create an order through the real API.
    const t0 = await tables(request);
    const res = await page.request.post("/api/orders", {
      data: { customerId: t0.customers[0].id, garmentType: "Blouse", dueDate: "2099-01-01", totalAmount: 100, advanceAmount: 0, measurements: {} },
    });
    expect(res.ok()).toBeTruthy();
    const order = (await res.json()).data;
    await page.goto(`/track/${order.tracking_token}`);
    await expect(page.getByText(order.order_code)).toBeVisible();
    await expect(page.getByRole("link", { name: /^Message/ })).toHaveCount(0);
    await page.goto(`/track/${"0".repeat(64)}`);
    await expect(page.getByRole("heading", { name: "Tracking link not found" })).toBeVisible();
  });

  test("a failed photo upload says why", async ({ page, request }) => {
    await seedOwner(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    const t0 = await tables(request);
    const res = await page.request.post("/api/orders", {
      data: { customerId: t0.customers[0].id, garmentType: "Blouse", dueDate: "2099-01-01", totalAmount: 100, advanceAmount: 0, measurements: {} },
    });
    const order = (await res.json()).data;
    await page.route("**/s3/**", (route) => route.fulfill({ status: 403, body: "" }));
    await page.goto(`/owner/orders/${order.id}`);
    await page.locator(".bq-shell-mobile__content input[type='file']").setInputFiles({ name: "c.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("Photo storage rejected the upload (error 403). Try again.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry upload" })).toBeVisible();
  });
});

test.describe("Super admin", () => {
  async function seedAdmins(request: APIRequestContext) {
    await mock(request, "seed", {
      users: [
        { email: "owner.admin@boutiqo.dev", password: PASSWORD },
        { email: "viewer@boutiqo.dev", password: PASSWORD },
        { email: "suspended@boutiqo.dev", password: PASSWORD },
        { email: OWNER, password: PASSWORD },
      ],
      admins: [
        { email: "owner.admin@boutiqo.dev", name: "Ops Owner", role: "owner_admin" },
        { email: "viewer@boutiqo.dev", name: "Read Only", role: "viewer" },
        { email: "suspended@boutiqo.dev", name: "Gone", role: "support_admin", active: false },
      ],
      boutiques: [{ ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "Tailoring", area: "Banjara Hills" }],
    });
  }

  test("admin login page: success, wrong password, owner account rejected, suspended account", async ({ page, request }) => {
    await seedAdmins(request);
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill("owner.admin@boutiqo.dev");
    await page.getByLabel(/^Password/).fill("wrong-pass");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Incorrect email or password")).toBeVisible();

    await login(page, OWNER, "/admin/login"); // a boutique owner is not an admin
    await expect(page.getByText("Incorrect email or password")).toBeVisible();

    await login(page, "suspended@boutiqo.dev", "/admin/login");
    await expect(page.getByText("This admin account has been suspended.")).toBeVisible();

    await login(page, "owner.admin@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Boutiques" })).toBeVisible();
  });

  test("admins can also sign in from the owner login page; suspended admins can't", async ({ page, request }) => {
    await seedAdmins(request);
    await login(page, "owner.admin@boutiqo.dev");
    await page.waitForURL("**/admin/dashboard");
    await page.goto("/admin/signout");
    await expect(page.getByRole("heading", { name: "Signed out" })).toBeVisible();
    await login(page, "suspended@boutiqo.dev");
    await expect(alertBox(page)).toContainText("suspended");
  });

  test("owner admin: boutiques, add boutique on mobile, put on hold, reactivate, sign out", async ({ page, request }) => {
    await seedAdmins(request);
    await login(page, "owner.admin@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    const main = page.locator(".bq-shell-mobile__content");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Boutiques" }).click();
    await page.waitForURL("**/admin/boutiques");
    await expect(main.getByText("Lotus Boutique")).toBeVisible();

    // Add boutique is reachable on mobile and works.
    await main.getByRole("link", { name: "Add boutique" }).click();
    await page.waitForURL("**/admin/boutiques/new");
    await main.getByLabel(/^Boutique name/).fill("Rangoli");
    await main.getByLabel(/^Owner name/).fill("Meena");
    await main.getByLabel(/^Owner email/).fill("meena@gmail.com");
    await main.getByLabel(/^Category/).fill("Tailoring");
    await main.getByRole("button", { name: /Add boutique|Create/ }).click();
    await page.waitForURL(/\/admin\/boutiques\/[0-9a-f-]+$/);
    await expect(main.getByText("Rangoli").first()).toBeVisible();

    // Status changes on the original boutique.
    await page.goto("/admin/boutiques");
    await main.getByRole("link", { name: /Lotus Boutique/ }).click();
    await main.getByRole("link", { name: /access/i }).click();
    await page.waitForURL(/\/access$/);
    await main.getByRole("button", { name: /hold/i }).click();
    await expect(page.getByText("Lotus Boutique is now on hold.")).toBeVisible();
    await main.getByRole("button", { name: /Reactivate|Activate/i }).click();
    await expect(page.getByText("Lotus Boutique is now active.")).toBeVisible();
    expect((await tables(request)).boutiques.find((b: { name: string }) => b.name === "Lotus Boutique").status).toBe("active");

    // Roles page loads; sign out from the mobile top bar.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin roles" }).click();
    await expect(main.getByText("Read Only", { exact: true })).toBeVisible();
    await page.locator(".bq-shell-mobile").getByRole("link", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Signed out" })).toBeVisible();
    await page.goto("/admin/dashboard");
    await page.waitForURL("**/admin/login");
  });

  test("viewer admin: Add boutique is disabled and doesn't navigate; status buttons disabled", async ({ page, request }) => {
    await seedAdmins(request);
    await login(page, "viewer@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    await page.goto("/admin/boutiques");
    const main = page.locator(".bq-shell-mobile__content");
    const add = main.getByRole("button", { name: "Add boutique" });
    await expect(add).toBeDisabled();
    await expect(main.getByRole("link", { name: "Add boutique" })).toHaveCount(0);
    await main.getByRole("link", { name: /Lotus Boutique/ }).click();
    await main.getByRole("link", { name: /access/i }).click();
    await page.waitForURL(/\/access$/);
    for (const b of await main.getByRole("button").all()) await expect(b).toBeDisabled();
  });

  test("an owner can't open the admin console", async ({ page, request }) => {
    await seedAdmins(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/admin/dashboard");
    await page.waitForURL("**/admin/login");
  });
});
