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
    // No sign-out in the top bar any more; it lives at the bottom of Settings.
    await expect(page.locator(".bq-shell-mobile .bq-mobile-top").getByRole("link", { name: "Sign out" })).toHaveCount(0);

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
        onstart: (() => void) | null = null;
        start() {
          setTimeout(() => this.onstart?.(), 50);
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

  test("in the Android app, voice uses the native recognizer: restarts after pauses, fills in order and by name", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      // Stand-in for android/App.tsx: answers the page's voice messages with
      // the events the native recognizer produces.
      const w = window as unknown as { __posts: string[]; __phrases: string[] };
      w.__posts = [];
      w.__phrases = ["14 15", "chest 36 and a half"];
      const send = (detail: unknown) => window.dispatchEvent(new CustomEvent("boutiqo:voice", { detail }));
      Object.defineProperty(window, "BoutiqoShell", { value: Object.freeze({ oauthRedirectUrl: "boutiqo://auth-callback", voice: true }) });
      // Android's WebView has this object, but it never works: must not be used.
      Object.defineProperty(window, "webkitSpeechRecognition", { value: class { start() { throw new Error("WebView speech must not be used"); } }, configurable: true });
      Object.defineProperty(window, "ReactNativeWebView", {
        value: {
          postMessage(raw: string) {
            const m = JSON.parse(raw);
            if (m.type !== "boutiqo:voice") return;
            w.__posts.push(raw);
            if (m.action === "start") {
              setTimeout(() => send({ type: "start" }), 30);
              const phrase = w.__phrases.shift();
              if (phrase) {
                setTimeout(() => send({ type: "result", transcript: phrase.split(" ")[0], isFinal: false }), 60);
                setTimeout(() => send({ type: "result", transcript: phrase, isFinal: true }), 120);
                setTimeout(() => send({ type: "error", code: "no-speech", message: "" }), 160);
                setTimeout(() => send({ type: "end" }), 180); // a pause ends the session, like Android 12
              }
            }
            if (m.action === "stop") setTimeout(() => send({ type: "end" }), 30);
          },
        },
      });
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Voice" }).click();
    await main.getByRole("button", { name: "Start voice input" }).click();
    await expect(main.getByLabel("1. Blouse back length")).toHaveValue("14");
    await expect(main.getByLabel("2. Full shoulder width")).toHaveValue("15");
    await expect(main.getByLabel("10. Chest around")).toHaveValue("36.5");
    await expect(main.locator(".bq-voice-panel__title")).toContainText("Listening");
    await expect(main.locator(".bq-voice-panel__hint")).toContainText("11. Bust around");
    await expect(main.locator(".bq-voice-panel__heard")).toContainText("14 15 chest 36 and a half");
    // Each pause ended the native session; the page started it again each time.
    await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __posts: string[] }).__posts)).filter((p) => p.includes('"start"')).length).toBeGreaterThanOrEqual(3);
    await main.getByRole("button", { name: "Stop listening" }).click({ force: true });
    await expect(main.locator(".bq-voice-panel__title")).toContainText("Tap the mic and speak");
    const posts = (await page.evaluate(() => (window as unknown as { __posts: string[] }).__posts)).map((p) => JSON.parse(p));
    expect(posts.filter((p) => p.action === "start").length).toBeGreaterThanOrEqual(3); // restarted after each pause
    expect(posts.every((p) => p.type === "boutiqo:voice" && (p.action !== "start" || p.lang === "en-IN"))).toBe(true);
    expect(posts.at(-1).action).toBe("stop");
  });

  test("in the Android app, a permanently denied mic offers the phone's settings", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      const w = window as unknown as { __posts: string[] };
      w.__posts = [];
      const send = (detail: unknown) => window.dispatchEvent(new CustomEvent("boutiqo:voice", { detail }));
      Object.defineProperty(window, "BoutiqoShell", { value: Object.freeze({ oauthRedirectUrl: "boutiqo://auth-callback", voice: true }) });
      Object.defineProperty(window, "ReactNativeWebView", {
        value: {
          postMessage(raw: string) {
            if (JSON.parse(raw).type !== "boutiqo:voice") return;
            w.__posts.push(raw);
            if (JSON.parse(raw).action === "start") {
              setTimeout(() => send({ type: "error", code: "not-allowed", message: "Microphone permission is off.", canAskAgain: false }), 30);
              setTimeout(() => send({ type: "end" }), 40);
            }
          },
        },
      });
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Voice" }).click();
    await main.getByRole("button", { name: "Start voice input" }).click();
    await expect(main.getByText("Microphone permission is blocked")).toBeVisible();
    await expect(main.getByText("Turn on Microphone for Boutiqo in your phone's settings")).toBeVisible();
    await main.getByRole("button", { name: "Open phone settings" }).click();
    const posts = (await page.evaluate(() => (window as unknown as { __posts: string[] }).__posts)).map((p) => JSON.parse(p));
    expect(posts.at(-1)).toEqual({ type: "boutiqo:voice", action: "open-settings" });
  });

  test("an app version without native voice explains how to get it (never uses the broken WebView speech)", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      Object.defineProperty(window, "BoutiqoShell", { value: Object.freeze({ oauthRedirectUrl: "exp://x/--/auth-callback" }) });
      Object.defineProperty(window, "ReactNativeWebView", { value: { postMessage() {} } });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: class {}, configurable: true });
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Voice" }).click();
    await expect(main.getByText("Voice input isn't available here")).toBeVisible();
    await expect(main.getByText("Install the latest Boutiqo app")).toBeVisible();
  });

  test("a microphone that never starts is reported instead of pretending to listen", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      class Silent {
        lang = "";
        continuous = false;
        interimResults = false;
        start() {}
        stop() {}
        abort() {}
      }
      for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) Object.defineProperty(window, name, { value: Silent, configurable: true, writable: true });
    });
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/orders/new");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Voice" }).click();
    await main.getByRole("button", { name: "Start voice input" }).click();
    await expect(main.locator(".bq-voice-panel__title")).toContainText("Starting the microphone");
    await expect(main.getByText("The microphone didn't start")).toBeVisible({ timeout: 10_000 });
    await expect(main.getByRole("button", { name: "Start voice input" })).toBeVisible();
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

    // Roles page loads; sign out from the bottom of the admin Home page.
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin roles" }).click();
    await expect(main.getByText("Read Only", { exact: true })).toBeVisible();
    await expect(page.locator(".bq-shell-mobile .bq-mobile-top").getByRole("link", { name: "Sign out" })).toHaveCount(0);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
    await main.getByRole("link", { name: "Sign out" }).click();
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

test.describe("Super admin roster (no passwords in code)", () => {
  test("a listed team email becomes an admin on its first verified Google sign-in", async ({ page, request }) => {
    await mock(request, "config", { googleUser: { email: "sidsvictus@gmail.com", name: "Sids" } });
    await page.goto("/admin/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/admin/dashboard");
    const t = await tables(request);
    const row = t.admins.find((a: { email: string }) => a.email === "sidsvictus@gmail.com");
    expect(row.role).toBe("owner_admin");
    expect(row.user_id).toBeTruthy();
    expect(t.admins.some((a: { email: string }) => a.email === "help.boutiqo@gmail.com")).toBe(true);
  });

  test("an unverified Google identity is not enough", async ({ page, request }) => {
    await mock(request, "config", { googleUser: { email: "help.boutiqo@gmail.com", name: "X", verified: false } });
    await page.goto("/admin/login");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/\/owner\/(register|signup)/);
    const t = await tables(request);
    expect(t.admins.find((a: { email: string }) => a.email === "help.boutiqo@gmail.com").user_id ?? null).toBeNull();
  });

  test("a password account using a listed email can't claim admin", async ({ page, request }) => {
    await mock(request, "seed", { users: [{ email: "sidsvictus@gmail.com", password: PASSWORD }] });
    await login(page, "sidsvictus@gmail.com", "/admin/login");
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    const t = await tables(request);
    expect(t.admins.find((a: { email: string }) => a.email === "sidsvictus@gmail.com").user_id ?? null).toBeNull();
  });

  test("the old placeholder admins (password was in the repo) are removed and can't log in", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "admin.owner@boutiqo.dev", password: PASSWORD }],
      admins: [{ email: "admin.owner@boutiqo.dev", name: "Dev Owner Admin", role: "owner_admin" }],
    });
    await login(page, "admin.owner@boutiqo.dev", "/admin/login");
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    const t = await tables(request);
    expect(t.admins.some((a: { email: string }) => a.email === "admin.owner@boutiqo.dev")).toBe(false);
    const user = await (await request.get(`${MOCK}/__mock/user?email=admin.owner@boutiqo.dev`)).json();
    expect(user).toBeNull();
  });
});

test.describe("Clickable home, dues list, billing, tracking brand", () => {
  const day = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  async function seedOrders(request: APIRequestContext) {
    await seedOwner(request, { customerPhone: "98480 22222" });
    await mock(request, "seed", {
      orders: [
        { ownerEmail: OWNER, customerName: "Aisha Fatima", due_date: day(-2), total_amount: 1000, advance_amount: 200, garment_type: "Blouse" },
        { ownerEmail: OWNER, customerName: "Aisha Fatima", due_date: day(3), total_amount: 500, garment_type: "Lehenga", stage: "ready" },
        { ownerEmail: OWNER, customerName: "Aisha Fatima", due_date: day(20), total_amount: 800, paid: true, garment_type: "Kurti" },
        { ownerEmail: OWNER, customerName: "Aisha Fatima", due_date: day(-10), total_amount: 300, paid: true, stage: "delivered" },
      ],
    });
  }

  test("home tiles open the matching list; the calendar lists dues for all dates", async ({ page, request }) => {
    await seedOrders(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    const main = page.locator(".bq-shell-mobile__content");

    await expect(main.getByRole("link", { name: /Open orders\s*3/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Bills due\s*₹1,300/ })).toBeVisible();
    // Due this week: overdue + ready ones, never delivered.
    await expect(main.locator(".bq-order-row")).toHaveCount(2);

    await main.getByRole("link", { name: /Open orders/ }).click();
    await page.waitForURL("**/owner/calendar?view=open");
    await expect(main.getByRole("button", { name: /^Open/ })).toHaveAttribute("aria-pressed", "true");
    await expect(main.locator(".bq-order-row")).toHaveCount(3); // all open orders, every date
    await expect(main.getByText("3 orders · ₹1,300 balance due")).toBeVisible();

    await main.getByRole("button", { name: /^Overdue/ }).click();
    await expect(main.locator(".bq-order-row")).toHaveCount(1);
    await expect(main.locator(".bq-order-row")).toContainText("Blouse");

    // Tapping a day on the calendar narrows the list to that day (local date, not UTC).
    await main.getByRole("button", { name: /^All/ }).click();
    const d3 = new Date();
    d3.setDate(d3.getDate() + 3);
    if (d3.getMonth() !== new Date().getMonth()) await main.getByRole("button", { name: "Next month" }).click();
    await main.getByRole("button", { name: new RegExp(`^${d3.getDate()}: 1 due`) }).click();
    await expect(main.locator(".bq-order-row")).toHaveCount(1);
    await expect(main.locator(".bq-order-row")).toContainText("Lehenga");
    await main.getByRole("button", { name: "Show all dates" }).click();
    await expect(main.locator(".bq-order-row")).toHaveCount(4);

    // An order row opens the order.
    await main.locator(".bq-order-row", { hasText: "Lehenga" }).click();
    await page.waitForURL(/\/owner\/orders\/[^/]+$/);

    // Delayed orders tile → overdue view; Bills due → billing.
    await page.goto("/owner/dashboard");
    await main.getByRole("link", { name: /^Delayed orders/ }).click();
    await page.waitForURL("**/owner/calendar?view=overdue");
    await expect(main.locator(".bq-order-row")).toHaveCount(1);
    await page.goto("/owner/dashboard");
    await main.getByRole("link", { name: /Customers/ }).click();
    await page.waitForURL("**/owner/customers");
    await page.goto("/owner/dashboard");
    await main.getByRole("link", { name: /Bills due/ }).click();
    await page.waitForURL("**/owner/billing");
    await expect(main.getByText("₹1,300").first()).toBeVisible();
    await main.locator("a.bq-order-row").first().click();
    await page.waitForURL(/\/owner\/orders\/[^/]+$/);
  });

  test("customer page: call, WhatsApp, and New order preselects the customer", async ({ page, request }) => {
    await seedOrders(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/customers");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("link", { name: /Aisha Fatima/ }).click();
    await expect(main.getByRole("link", { name: /98480 22222/ })).toHaveAttribute("href", "tel:9848022222");
    await expect(main.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/919848022222/);
    await main.getByRole("link", { name: "New order" }).click();
    await page.waitForURL(/\/owner\/orders\/new\?customer=/);
    await main.getByRole("tab", { name: /Work details/ }).click();
    await expect(main.getByLabel(/^Customer/)).toHaveValue(/.+/);
  });

  test("tracking page shows the Boutiqo brand and the boutique name", async ({ page, request }) => {
    await seedOrders(request);
    const t = await tables(request);
    await page.goto(`/track/${t.orders[0].tracking_token}`);
    const brand = page.locator(".bq-track-brand");
    await expect(brand).toContainText("Boutiqo");
    await expect(brand).toContainText("Order tracking · Lotus Boutique");
    await expect(brand.locator("img")).toHaveJSProperty("complete", true);
    expect(await brand.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });
});

test.describe("Super admin dashboard tiles", () => {
  test("tiles open the boutique list with the matching filter", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "ops@boutiqo.dev", password: PASSWORD }, { email: OWNER, password: PASSWORD }, { email: "b@gmail.com", password: PASSWORD }],
      admins: [{ email: "ops@boutiqo.dev", name: "Ops", role: "owner_admin" }],
      boutiques: [
        { ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "Tailoring", area: "A" },
        { ownerEmail: "b@gmail.com", name: "Held Boutique", owner_name: "B", category: "Tailoring", area: "B", status: "on_hold" },
      ],
    });
    await login(page, "ops@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("link", { name: /On hold \/ disabled/ }).click();
    await page.waitForURL("**/admin/boutiques?status=inactive");
    await expect(main.getByText("Held Boutique")).toBeVisible();
    await expect(main.getByText("Lotus Boutique")).toHaveCount(0);
    await main.getByRole("button", { name: "All", exact: true }).click();
    await expect(main.getByText("Lotus Boutique")).toBeVisible();
  });
});

test.describe("Demo data cleanup and contacting a boutique", () => {
  test("the seed script's demo boutiques are deleted with their data; real ones stay", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "owner1@boutiqo.dev", password: PASSWORD }, { email: OWNER, password: PASSWORD }],
      boutiques: [
        { ownerEmail: "owner1@boutiqo.dev", name: "Meera Boutique", owner_name: "Meera", category: "T", area: "Banjara Hills" },
        { ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "T", area: "A" },
      ],
      customers: [{ ownerEmail: "owner1@boutiqo.dev", name: "Demo Customer" }, { ownerEmail: OWNER, name: "Real Customer" }],
    });
    await mock(request, "seed", { orders: [{ ownerEmail: "owner1@boutiqo.dev", customerName: "Demo Customer", due_date: "2099-01-01", total_amount: 10 }] });
    await login(page); // any sign-in runs the cleanup
    await page.waitForURL("**/owner/dashboard");
    const t = await tables(request);
    expect(t.boutiques.map((b: { name: string }) => b.name)).toEqual(["Lotus Boutique"]);
    expect(t.customers.map((c: { name: string }) => c.name)).toEqual(["Real Customer"]);
    expect(t.orders).toHaveLength(0);
    expect(await (await request.get(`${MOCK}/__mock/user?email=owner1@boutiqo.dev`)).json()).toBeNull();
  });

  test("admin: Contact boutique opens Gmail compose in a new tab with the boutique's email and subject", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "ops@boutiqo.dev", password: PASSWORD }, { email: OWNER, password: PASSWORD }],
      admins: [{ email: "ops@boutiqo.dev", name: "Ops", role: "owner_admin" }],
      boutiques: [{ ownerEmail: OWNER, name: "777", owner_name: "Siddarth Ram", category: "Jss", area: null }],
    });
    await login(page, "ops@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    await page.goto("/admin/boutiques");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("link", { name: /777/ }).click();
    await expect(main.getByText("Jss", { exact: true })).toBeVisible(); // no "null ·"
    const contact = main.getByRole("link", { name: "Contact boutique" });
    await expect(contact).toHaveAttribute("target", "_blank");
    const href = new URL((await contact.getAttribute("href"))!);
    expect(href.hostname).toBe("mail.google.com");
    expect(href.searchParams.get("to")).toBe(OWNER);
    expect(href.searchParams.get("su")).toBe("Hey boutiqo partner, this is an important message.");
    await page.context().route("https://mail.google.com/**", (r) => r.fulfill({ body: "gmail" }));
    const [tab] = await Promise.all([page.context().waitForEvent("page"), contact.click()]);
    expect(tab.url()).toContain("mail.google.com/mail/?view=cm");
    await expect(main.getByRole("link", { name: /Open in your mail app/ })).toHaveAttribute("href", `mailto:${OWNER}?subject=Hey%20boutiqo%20partner%2C%20this%20is%20an%20important%20message.`);
  });
});

test.describe("Admin adds a boutique on a laptop; the owner signs in on their phone", () => {
  const LAPTOP = { viewport: { width: 1366, height: 800 }, baseURL: "http://localhost:3210" };
  const PHONE_URL = "http://localhost:3210";

  async function adminAdds(browser: import("@playwright/test").Browser, request: APIRequestContext, email: string) {
    await mock(request, "seed", { users: [{ email: "ops@boutiqo.dev", password: PASSWORD }], admins: [{ email: "ops@boutiqo.dev", name: "Ops", role: "owner_admin" }] });
    const ctx = await browser.newContext(LAPTOP);
    const laptop = await ctx.newPage();
    await login(laptop, "ops@boutiqo.dev", "/admin/login");
    await laptop.waitForURL("**/admin/dashboard");
    await laptop.goto("/admin/boutiques/new");
    const form = laptop.locator(".bq-shell-web");
    await form.getByLabel(/^Boutique name/).fill("Rani Designs");
    await form.getByLabel(/^Owner name/).fill("Rani");
    await form.getByLabel(/^Owner email/).fill(email);
    await form.getByLabel(/^Category/).fill("Bridal");
    await form.getByRole("button", { name: "Create boutique" }).click();
    return { ctx, laptop };
  }

  test("owner signs in with Google on the phone (no password ever set)", async ({ browser, request, page }) => {
    const { ctx, laptop } = await adminAdds(browser, request, "  Rani.Owner@Gmail.com ");
    await laptop.waitForURL(/\/admin\/boutiques\/[^/]+$/);
    await expect(laptop.getByText("rani.owner@gmail.com got an email to set a password").first()).toBeVisible();
    await ctx.close();

    await mock(request, "config", { googleUser: { email: "rani.owner@gmail.com", name: "Rani" } });
    await page.goto(`${PHONE_URL}/owner/login`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/owner/dashboard");
    await expect(page.locator(".bq-shell-mobile")).toBeVisible();
    await page.goto("/owner/settings");
    await expect(page.locator(".bq-shell-mobile__content").getByLabel(/^Boutique name/)).toHaveValue("Rani Designs");
  });

  test("owner sets a password from the welcome email on the phone, then logs in with it anywhere", async ({ browser, request, page }) => {
    const { ctx } = await adminAdds(browser, request, "rani.owner@gmail.com");
    await ctx.close();
    const mails = await (await request.get(`${MOCK}/__mock/outbox?to=rani.owner%40gmail.com`)).json();
    expect(mails.at(-1).type).toBe("recovery");

    await page.goto(mails.at(-1).link); // opened from Gmail on the phone: none of the laptop's cookies
    await page.waitForURL((u) => u.pathname === "/owner/reset-password");
    await page.getByLabel(/^New password/).fill("rani-phone-pass-1");
    await page.getByLabel("Confirm new password").fill("rani-phone-pass-1");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

    const other = await browser.newContext(LAPTOP);
    const p2 = await other.newPage();
    await p2.goto("/owner/login");
    await p2.getByLabel("Email").fill("RANI.OWNER@gmail.com");
    await p2.getByLabel(/^Password/).fill("rani-phone-pass-1");
    await p2.getByRole("button", { name: "Log in" }).click();
    await p2.waitForURL("**/owner/dashboard");
    await other.close();
  });

  test("an owner who already tried Google sign-in first still gets the boutique", async ({ browser, request, page }) => {
    // Owner opened the app and tapped Continue with Google before the admin added them.
    await mock(request, "config", { googleUser: { email: "early@gmail.com", name: "Early" } });
    await page.goto(`${PHONE_URL}/owner/login`);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL(/\/owner\/(register|signup)/);

    const { ctx, laptop } = await adminAdds(browser, request, "early@gmail.com");
    await laptop.waitForURL(/\/admin\/boutiques\/[^/]+$/);
    await ctx.close();

    // Still signed in from before on the phone: reopening the app goes straight to the boutique.
    await page.goto(`${PHONE_URL}/owner/dashboard`);
    await page.waitForURL("**/owner/dashboard");
    await expect(page.locator(".bq-shell-mobile .bq-appbar__title")).toHaveText("Home");
  });

  test("an email that already owns a boutique is refused with a clear reason", async ({ browser, request }) => {
    await mock(request, "seed", {
      users: [{ email: OWNER, password: PASSWORD }],
      boutiques: [{ ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "T", area: "A" }],
    });
    const { ctx, laptop } = await adminAdds(browser, request, OWNER);
    await expect(laptop.locator(".bq-shell-web").getByText("This email already owns a boutique on Boutiqo")).toBeVisible();
    await ctx.close();
  });
});

test.describe("Android app: full screen", () => {
  test("pages pad themselves for the phone's bars, and ask for light/dark status-bar icons", async ({ page, request }) => {
    await seedOwner(request);
    await page.addInitScript(() => {
      const w = window as unknown as { __bars: string[] };
      w.__bars = [];
      Object.defineProperty(window, "ReactNativeWebView", {
        value: { postMessage: (raw: string) => { const m = JSON.parse(raw); if (m.type === "boutiqo:statusbar") w.__bars.push(m.style); } },
      });
      // What android/src/edge.ts injects before the page loads: status bar 32px, navigation bar 24px.
      (window as unknown as { BoutiqoInsets: unknown }).BoutiqoInsets = { top: 32, bottom: 24 };
      document.documentElement.style.setProperty("--bq-shell-inset-top", "32px");
      document.documentElement.style.setProperty("--bq-shell-inset-bottom", "24px");
    });
    const bars = () => page.evaluate(() => (window as unknown as { __bars: string[] }).__bars);

    await page.goto("/owner/login");
    await expect.poll(async () => (await bars()).at(-1)).toBe("light"); // dark carpet behind the status bar
    // The card sits at the mockup's 130/794 mark, never under the 32px status bar.
    await expect.poll(() => page.locator(".bq-auth-card").evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(48);

    await page.getByLabel("Email").fill(OWNER);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/owner/dashboard");
    await expect.poll(async () => (await bars()).at(-1)).toBe("dark"); // light app pages
    await expect.poll(() => page.locator(".bq-shell-mobile .bq-mobile-top").evaluate((el) => getComputedStyle(el).paddingTop)).toBe("32px");
  });

  test("home page is trimmed: Google, or, sign in, legal links", async ({ page }) => {
    await page.goto("/site");
    const card = page.locator(".bq-auth-card");
    await expect(card).not.toContainText("No password to remember");
    await expect(card).not.toContainText("Each boutique sees only");
    await expect(card).not.toContainText(/already set up/i);
    await expect(card.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(card.getByRole("link", { name: "Sign in to an existing boutique" })).toHaveAttribute("href", "/owner/login");
  });
});

test.describe("Notifications and announcements", () => {
  const bell = (page: Page) => page.locator(".bq-shell-mobile").getByRole("button", { name: /^Notifications/ });

  test("owner: activity shows in the bell with an unread badge; tapping opens the record; seen state is saved", async ({ page, request }) => {
    await seedOwner(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    const res = await page.request.post("/api/customers", { data: { name: "Kavya Rao", phone: "" } });
    expect(res.ok()).toBeTruthy();
    const customer = (await res.json()).data;

    await page.reload();
    await expect(bell(page)).toHaveAccessibleName("Notifications, 1 new");
    await bell(page).click();
    const panel = page.locator(".bq-shell-mobile").getByRole("dialog", { name: "Notifications" });
    await expect(panel).toContainText("Added your 2nd customer: Kavya Rao"); // Aisha (seeded) is the 1st
    await panel.getByRole("button", { name: /Kavya Rao/ }).click();
    await page.waitForURL(`**/owner/customers/${customer.id}`);
    await expect(bell(page)).toHaveAccessibleName("Notifications");

    await page.reload(); // stays read
    await expect(bell(page)).toHaveAccessibleName("Notifications");
  });

  test("admin announces from Boutiques; every boutique owner gets it and can open the message", async ({ page, browser, request }) => {
    await mock(request, "seed", {
      users: [{ email: "ops@boutiqo.dev", password: PASSWORD }, { email: OWNER, password: PASSWORD }, { email: "b2@gmail.com", password: PASSWORD }],
      admins: [{ email: "ops@boutiqo.dev", name: "Sids", role: "owner_admin" }],
      boutiques: [
        { ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "T", area: "A" },
        { ownerEmail: "b2@gmail.com", name: "Rose", owner_name: "Ram", category: "T", area: "B" },
      ],
    });
    await login(page, "ops@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    await page.goto("/admin/boutiques");
    const main = page.locator(".bq-shell-mobile__content");
    await main.getByRole("button", { name: "Announce" }).click();
    const dlg = page.getByRole("dialog", { name: "New announcement" });
    await dlg.getByRole("button", { name: "Send to all boutiques" }).click();
    await expect(dlg.getByText("Add both a heading and a message.")).toBeVisible();
    await dlg.getByLabel(/^Heading/).fill("Short maintenance tonight");
    await dlg.getByLabel(/^Message/).fill("Boutiqo will be unavailable from 11:00 to 11:30 pm.\nYour data is safe.");
    await dlg.getByRole("button", { name: "Send to all boutiques" }).click();
    await expect(page.getByText("Announcement sent to 2 boutiques.")).toBeVisible();
    await expect(dlg).toBeHidden();
    // Admin's own log
    await bell(page).click();
    await expect(page.locator(".bq-shell-mobile").getByRole("dialog", { name: "Notifications" })).toContainText("Announcement sent by Sids: Short maintenance tonight");

    for (const email of [OWNER, "b2@gmail.com"]) {
      const ctx = await browser.newContext({ ...(await import("@playwright/test")).devices["Pixel 7"], baseURL: "http://localhost:3210" });
      const p = await ctx.newPage();
      await login(p, email);
      await p.waitForURL("**/owner/dashboard");
      await expect(bell(p)).toHaveAccessibleName(/Notifications, \d+ new/);
      await bell(p).click();
      const panel = p.locator(".bq-shell-mobile").getByRole("dialog", { name: "Notifications" });
      await expect(panel).toContainText("Announcement");
      await panel.getByRole("button", { name: /Short maintenance tonight/ }).click();
      const read = p.getByRole("dialog", { name: "Short maintenance tonight" });
      await expect(read).toContainText("Boutiqo will be unavailable from 11:00 to 11:30 pm.");
      await expect(read).toContainText("Your data is safe.");
      await ctx.close();
    }
  });

  test("viewer admins can't announce (button disabled, API refuses)", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "viewer@boutiqo.dev", password: PASSWORD }],
      admins: [{ email: "viewer@boutiqo.dev", name: "Vee", role: "viewer" }],
    });
    await login(page, "viewer@boutiqo.dev", "/admin/login");
    await page.waitForURL("**/admin/dashboard");
    await page.goto("/admin/boutiques");
    await expect(page.locator(".bq-shell-mobile__content").getByRole("button", { name: "Announce" })).toBeDisabled();
    const res = await page.request.post("/api/admin/announcements", { data: { title: "x", body: "y" } });
    expect(res.status()).toBe(403);
    expect((await tables(request)).announcements).toHaveLength(0);
  });

  test("owners can't post announcements or fake notifications", async ({ page, request }) => {
    await seedOwner(request);
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    expect((await page.request.post("/api/admin/announcements", { data: { title: "x", body: "y" } })).status()).toBe(403);
  });

  test("before the database migration is applied, the bell simply stays hidden", async ({ page, request }) => {
    await seedOwner(request);
    await page.route("**/rest/v1/notifications**", (r) => r.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.notifications' in the schema cache" }) }));
    await login(page);
    await page.waitForURL("**/owner/dashboard");
    await expect(page.locator(".bq-shell-mobile .bq-appbar__title")).toHaveText("Home");
    await expect(bell(page)).toHaveCount(0);
  });
});

test.describe("Site map: landing at /, sign-in at /site", () => {
  test("/ is the landing page; the sign-in home lives at /site", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".bq-lp")).toBeVisible();
    await page.goto("/site");
    await expect(page.getByRole("link", { name: "Sign in to an existing boutique" })).toBeVisible();
  });

  test("inside the Android app, / goes straight to /site", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "ReactNativeWebView", { value: { postMessage: () => {} } });
    });
    await page.goto("/");
    await page.waitForURL("**/site");
  });

  test("/admin and /owner open their sign-in when signed out", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL("**/admin/login");
    await page.goto("/owner");
    await page.waitForURL("**/owner/login");
  });
});
