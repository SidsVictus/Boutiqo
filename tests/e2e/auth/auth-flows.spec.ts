import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Every sign-in flow, end to end: the real app + real supabase-js against the
// in-memory Supabase stand-in (supabase-mock.mjs). See playwright.auth.config.ts.
const MOCK = "http://127.0.0.1:54321";
const PASSWORD = "correct-horse-1";

async function mock(request: APIRequestContext, path: string, body?: unknown) {
  const res = await request.post(`${MOCK}/__mock/${path}`, { data: body ?? {} });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function seedOwner(request: APIRequestContext, email: string, extra: Record<string, unknown> = {}) {
  await mock(request, "seed", {
    users: [{ email, password: PASSWORD, ...extra }],
    boutiques: [{ ownerEmail: email, name: "Lotus Boutique", owner_name: "Anitha", category: "Tailoring" }],
  });
}

async function lastEmail(request: APIRequestContext, to: string): Promise<{ link: string; type: string }> {
  const res = await request.get(`${MOCK}/__mock/outbox?to=${encodeURIComponent(to)}`);
  const mails = await res.json();
  expect(mails.length).toBeGreaterThan(0);
  return mails[mails.length - 1];
}

/** The page's own alert banner (Next.js also renders an empty role="alert" route announcer). */
const alertBox = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

async function fillRegistration(page: Page) {
  const owner = page.getByLabel("Owner name");
  if (!(await owner.inputValue())) await owner.fill("Anitha Rao"); // Google prefills it; email signup doesn't
  await page.getByLabel("Boutique name").fill("Rangoli Designs");
  await page.getByLabel("Business category").fill("Ladies tailoring");
}

async function acceptTermsAndFinish(page: Page) {
  await page.waitForURL("**/owner/terms");
  await page.getByRole("checkbox", { name: "I accept the Terms & conditions" }).check({ force: true });
  await page.getByRole("checkbox", { name: "I accept the Privacy policy" }).check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/owner/dashboard");
}

test.beforeEach(async ({ request }) => {
  await mock(request, "reset");
});

test.describe("Google sign-in", () => {
  test("new user: lands on registration (not back on signup), survives a reload, completes signup", async ({ page }) => {
    await page.goto("/owner/signup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await expect(page.getByRole("heading", { name: "Tell us about your boutique" })).toBeVisible();
    await expect(page.getByLabel("Owner name")).toHaveValue("Priya Sharma");
    await expect(page.getByText("Signed in as priya.google@gmail.com")).toBeVisible();

    // The old bug: any full page load here bounced back to /owner/signup.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Tell us about your boutique" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/owner/register");

    await fillRegistration(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await acceptTermsAndFinish(page);
  });

  test("from the home page too", async ({ page }) => {
    await page.goto("/site");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL((u) => u.pathname === "/owner/register");
  });

  test("existing owner goes straight to the dashboard", async ({ page, request }) => {
    await seedOwner(request, "priya.google@gmail.com", { name: "Priya Sharma", password: null });
    await page.goto("/site");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/owner/dashboard");
  });

  test("cancelled at Google: back on login with a clear message", async ({ page, request }) => {
    await mock(request, "config", { googleCancel: true });
    await page.goto("/owner/signup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/owner/login?error=oauth");
    await expect(alertBox(page)).toContainText("Google sign-in was cancelled");
  });

  test("disabled boutique is signed straight back out", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "priya.google@gmail.com", name: "Priya Sharma" }],
      boutiques: [{ ownerEmail: "priya.google@gmail.com", name: "Old", owner_name: "Priya", category: "X", status: "disabled" }],
    });
    await page.goto("/site");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.waitForURL("**/owner/login?error=disabled");
    await expect(alertBox(page)).toContainText("disabled");
  });

  test("Android app is recognised by its bridge + user agent even without the injected object", async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: "http://localhost:3210", userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36 BoutiqoAndroid/1.0.0" });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const sent: string[] = [];
      (window as unknown as { __sent: string[] }).__sent = sent;
      (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = { postMessage: (m: string) => { if (!m.includes("boutiqo:statusbar")) sent.push(m); } };
    });
    await page.goto("/owner/signup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.length)).toBe(1);
    expect(new URL(page.url()).pathname).toBe("/owner/signup"); // did not navigate to Google itself
    const message = JSON.parse(await page.evaluate(() => (window as unknown as { __sent: string[] }).__sent[0]));
    expect(new URL(message.url).pathname).toBe("/auth/v1/authorize");
    await ctx.close();
  });

  test("Android app: returns through /auth/app-callback (no custom scheme on Supabase's allow-list needed)", async ({ page }) => {
    await page.addInitScript(() => {
      const sent: string[] = [];
      (window as unknown as { __sent: string[] }).__sent = sent;
      (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = { postMessage: (m: string) => { if (!m.includes("boutiqo:statusbar")) sent.push(m); } };
      (window as unknown as { BoutiqoShell: unknown }).BoutiqoShell = Object.freeze({ oauthRedirectUrl: "exp://192.168.1.3:8081/--/auth-callback" });
    });
    await page.goto("/owner/signup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.length)).toBe(1);
    const { url } = JSON.parse(await page.evaluate(() => (window as unknown as { __sent: string[] }).__sent[0]));

    // What the shell does: point Supabase at the hand-off route (withAppRedirect + appReturnUrl).
    const authorize = new URL(url);
    authorize.searchParams.set("redirect_to", `http://localhost:3210/auth/app-callback?app=${encodeURIComponent("exp://192.168.1.3:8081/--/auth-callback")}`);
    const fromSupabase = await page.request.get(authorize.toString(), { maxRedirects: 0 });
    const handoff = fromSupabase.headers()["location"];
    expect(handoff).toContain("/auth/app-callback?app=");
    const fromHandoff = await page.request.get(handoff, { maxRedirects: 0 });
    expect(fromHandoff.status()).toBe(302);
    const backToApp = fromHandoff.headers()["location"];
    expect(backToApp).toMatch(/^exp:\/\/192\.168\.1\.3:8081\/--\/auth-callback\?code=/);

    const code = new URL(backToApp.replace(/^exp:/, "http:")).searchParams.get("code")!;
    await page.goto(`/auth/callback?code=${encodeURIComponent(code)}`);
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await expect(page.getByLabel("Owner name")).toHaveValue("Priya Sharma");
  });

  test("/auth/app-callback only forwards to the app's own schemes", async ({ page }) => {
    const res = await page.request.get("/auth/app-callback?app=https%3A%2F%2Fevil.example%2F&code=x", { maxRedirects: 0 });
    expect(res.status()).toBe(307);
    expect(res.headers()["location"]).toContain("/owner/login?error=oauth");
    const ok = await page.request.get("/auth/app-callback?app=boutiqo%3A%2F%2Fauth-callback&code=abc", { maxRedirects: 0 });
    expect(ok.headers()["location"]).toBe("boutiqo://auth-callback?code=abc");
  });

  test("Android app: hands the sign-in URL to the shell and completes from its redirect", async ({ page }) => {
    // What android/App.tsx injects before each page load, plus a stand-in for
    // the native postMessage bridge that records what the page sends.
    await page.addInitScript(() => {
      (window as unknown as { BoutiqoShell: unknown }).BoutiqoShell = Object.freeze({ oauthRedirectUrl: "boutiqo://auth-callback" });
      const sent: string[] = [];
      (window as unknown as { __sent: string[] }).__sent = sent;
      (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = { postMessage: (m: string) => { if (!m.includes("boutiqo:statusbar")) sent.push(m); } };
    });
    await page.goto("/owner/signup");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sent: string[] }).__sent.length)).toBe(1);
    expect(new URL(page.url()).pathname).toBe("/owner/signup"); // the WebView itself didn't navigate to Google

    const message = JSON.parse(await page.evaluate(() => (window as unknown as { __sent: string[] }).__sent[0]));
    expect(message.type).toBe("boutiqo:oauth");
    const authorize = new URL(message.url);
    expect(authorize.pathname).toBe("/auth/v1/authorize");
    expect(authorize.searchParams.get("redirect_to")).toBe("boutiqo://auth-callback");

    // The shell's secure browser tab: follow Google/Supabase to the app redirect…
    const res = await page.request.get(message.url, { maxRedirects: 0 });
    const redirect = res.headers()["location"];
    expect(redirect).toMatch(/^boutiqo:\/\/auth-callback\?code=/);
    // …then load the web callback in the WebView, as callbackUrlFor() does.
    const code = new URL(redirect).searchParams.get("code")!;
    await page.goto(`/auth/callback?code=${encodeURIComponent(code)}`);
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await expect(page.getByLabel("Owner name")).toHaveValue("Priya Sharma");
  });
});

test.describe("Email signup", () => {
  test("instant signup → register → terms → dashboard", async ({ page }) => {
    await page.goto("/owner/signup");
    await page.getByLabel("Email").fill("new.owner@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await fillRegistration(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await acceptTermsAndFinish(page);
  });

  test("with email confirmation: shows check-your-email, and the emailed link continues to registration", async ({ page, request }) => {
    await mock(request, "config", { confirmEmail: true });
    await page.goto("/owner/signup");
    await page.getByLabel("Email").fill("confirm.me@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText("confirm.me@gmail.com")).toBeVisible();

    const mail = await lastEmail(request, "confirm.me@gmail.com");
    expect(mail.type).toBe("signup");
    await page.goto(mail.link);
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await fillRegistration(page);
    await page.getByRole("button", { name: "Continue" }).click();
    await acceptTermsAndFinish(page);
  });

  test("confirmation link opened in a different browser still continues to registration", async ({ page, browser, request }) => {
    await mock(request, "config", { confirmEmail: true });
    await page.goto("/owner/signup");
    await page.getByLabel("Email").fill("other.device@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    const mail = await lastEmail(request, "other.device@gmail.com");
    const other = await browser.newContext({ baseURL: "http://localhost:3210" });
    const phone = await other.newPage();
    await phone.goto(mail.link);
    await phone.waitForURL((u) => u.pathname === "/owner/register");
    await expect(phone.getByText("Signed in as other.device@gmail.com")).toBeVisible();
    await other.close();
  });

  test("validates email and password length before calling Supabase", async ({ page }) => {
    await page.goto("/owner/signup");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();

    await page.getByLabel("Email").fill("ok@gmail.com");
    await page.getByLabel(/^Password/).fill("short");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/owner/signup");
  });

  for (const confirmEmail of [false, true]) {
    test(`existing email is told to log in (confirmation ${confirmEmail ? "on" : "off"})`, async ({ page, request }) => {
      await mock(request, "config", { confirmEmail });
      await seedOwner(request, "taken@gmail.com");
      await page.goto("/owner/signup");
      await page.getByLabel("Email").fill("taken@gmail.com");
      await page.getByLabel(/^Password/).fill(PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(alertBox(page)).toContainText("already exists");
      await expect(alertBox(page).getByRole("link", { name: "Log in" })).toBeVisible();
    });
  }

  test("registration fields are validated on the form, GST is uppercased", async ({ page }) => {
    await page.goto("/owner/signup");
    await page.getByLabel("Email").fill("gst@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Boutique name is required")).toBeVisible();

    await fillRegistration(page);
    await page.getByLabel("Owner name").fill("Anitha");
    await page.getByLabel("Phone").fill("abc");
    await page.getByLabel("GST number").fill("36aabcu9603r1zm");
    await expect(page.getByLabel("GST number")).toHaveValue("36AABCU9603R1ZM");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Enter a valid phone number")).toBeVisible();
    await page.getByLabel("Phone").fill("+91 98480 12345");
    await page.getByRole("button", { name: "Continue" }).click();
    await acceptTermsAndFinish(page);
  });
});

test.describe("Log in", () => {
  test("wrong password, then right password", async ({ page, request }) => {
    await seedOwner(request, "owner@gmail.com");
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("owner@gmail.com");
    await page.getByLabel(/^Password/).fill("wrong-password");
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/owner/dashboard");

    // Already signed in: the login page forwards to the dashboard.
    await page.goto("/owner/login");
    await page.waitForURL("**/owner/dashboard");
  });

  test("unconfirmed email gets a clear notice, not 'incorrect password'", async ({ page, request }) => {
    await mock(request, "seed", { users: [{ email: "pending@gmail.com", password: PASSWORD, confirmed: false }] });
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("pending@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(alertBox(page)).toContainText("Confirm your email first");
  });

  test("account without a boutique continues registration", async ({ page, request }) => {
    await mock(request, "seed", { users: [{ email: "halfway@gmail.com", password: PASSWORD }] });
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("halfway@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL((u) => u.pathname === "/owner/register");
    await expect(page.getByText("Signed in as halfway@gmail.com")).toBeVisible();
  });

  test("admins land on the admin dashboard", async ({ page, request }) => {
    await mock(request, "seed", {
      users: [{ email: "admin@boutiqo.dev", password: PASSWORD }],
      admins: [{ email: "admin@boutiqo.dev", name: "Ops", role: "owner_admin" }],
    });
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("admin@boutiqo.dev");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/admin/dashboard");
  });

  test("password visibility toggle", async ({ page }) => {
    await page.goto("/owner/login");
    const field = page.getByLabel(/^Password/);
    await field.fill("secret-pass");
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await expect(field).toHaveValue("secret-pass");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(field).toHaveAttribute("type", "password");
  });

  test("sign out, then protected pages redirect to login", async ({ page, request }) => {
    await seedOwner(request, "owner@gmail.com");
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("owner@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/owner/dashboard");
    await page.goto("/owner/signout");
    await expect(page.getByRole("heading", { name: "Signed out" })).toBeVisible();
    await page.goto("/owner/dashboard");
    await page.waitForURL("**/owner/login");
  });
});

test.describe("Forgot / reset password", () => {
  test("full reset: request → email link → new password → log in with it", async ({ page, request }) => {
    await seedOwner(request, "forgetful@gmail.com");
    await page.goto("/owner/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await page.waitForURL("**/owner/forgot-password");
    await page.getByLabel("Email").fill("forgetful@gmail.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

    const mail = await lastEmail(request, "forgetful@gmail.com");
    expect(mail.type).toBe("recovery");
    await page.goto(mail.link);
    await page.waitForURL((u) => u.pathname === "/owner/reset-password");
    await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();

    await page.getByLabel(/^New password/).fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();

    await page.getByLabel(/^New password/).fill(PASSWORD);
    await page.getByLabel("Confirm new password").fill(PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Choose a password different from your current one")).toBeVisible();

    await page.getByLabel(/^New password/).fill("brand-new-pass-9");
    await page.getByLabel("Confirm new password").fill("brand-new-pass-0");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Passwords don't match")).toBeVisible();

    await page.getByLabel("Confirm new password").fill("brand-new-pass-9");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/owner/dashboard");

    await page.goto("/owner/signout");
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("forgetful@gmail.com");
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    await page.getByLabel(/^Password/).fill("brand-new-pass-9");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/owner/dashboard");
  });

  test("default reset email link works in a different browser than the one that asked (the reported bug)", async ({ page, browser, request }) => {
    await seedOwner(request, "forgetful@gmail.com");
    await page.goto("/owner/forgot-password");
    await page.getByLabel("Email").fill("forgetful@gmail.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    const mail = await lastEmail(request, "forgetful@gmail.com");

    // E.g. asked from the Android app, then opened from Gmail in Chrome: none of the first browser's cookies.
    const other = await browser.newContext({ baseURL: "http://localhost:3210" });
    const phone = await other.newPage();
    await phone.goto(mail.link);
    await phone.waitForURL((u) => u.pathname === "/owner/reset-password");
    expect(phone.url()).not.toContain("access_token"); // tokens are stripped from the address bar
    await phone.getByLabel(/^New password/).fill("from-gmail-pass-1");
    await phone.getByLabel("Confirm new password").fill("from-gmail-pass-1");
    await phone.getByRole("button", { name: "Save new password" }).click();
    await expect(phone.getByRole("heading", { name: "Password updated" })).toBeVisible();
    await other.close();

    // And the new password works for logging in.
    await page.goto("/owner/login");
    await page.getByLabel("Email").fill("forgetful@gmail.com");
    await page.getByLabel(/^Password/).fill("from-gmail-pass-1");
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/owner/dashboard");
  });

  test("token_hash reset link (recommended email template) works on a different device", async ({ page, browser, request }) => {
    await seedOwner(request, "forgetful@gmail.com");
    await page.goto("/owner/forgot-password");
    await page.getByLabel("Email").fill("forgetful@gmail.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    const res = await request.get(`${MOCK}/__mock/outbox?to=forgetful%40gmail.com`);
    const { tokenHash } = (await res.json()).at(-1);

    // A fresh browser with none of the first one's cookies (e.g. the email opened in Chrome after asking from the app).
    const other = await browser.newContext({ baseURL: "http://localhost:3210" });
    const phone = await other.newPage();
    await phone.goto(`/auth/callback?token_hash=${tokenHash}&type=recovery&next=/owner/reset-password`);
    await phone.waitForURL((u) => u.pathname === "/owner/reset-password");
    await phone.getByLabel(/^New password/).fill("another-pass-77");
    await phone.getByLabel("Confirm new password").fill("another-pass-77");
    await phone.getByRole("button", { name: "Save new password" }).click();
    await expect(phone.getByRole("heading", { name: "Password updated" })).toBeVisible();
    await other.close();
  });

  test("unknown email gets the same confirmation (no account enumeration)", async ({ page }) => {
    await page.goto("/owner/forgot-password");
    await page.getByLabel("Email").fill("nobody@gmail.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  test("used or invalid reset link → forgot-password with an explanation", async ({ page, request }) => {
    await seedOwner(request, "forgetful@gmail.com");
    await page.goto("/owner/forgot-password");
    await page.getByLabel("Email").fill("forgetful@gmail.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    const mail = await lastEmail(request, "forgetful@gmail.com");
    await page.goto(mail.link);
    await page.waitForURL((u) => u.pathname === "/owner/reset-password");
    await page.goto("/owner/signout");
    await page.goto(mail.link); // second use
    await page.waitForURL("**/owner/forgot-password?error=reset_link");
    await expect(alertBox(page)).toContainText("invalid or has expired");
  });

  test("reset page without a reset link says the link expired", async ({ page }) => {
    await page.goto("/owner/reset-password");
    await expect(page.getByRole("heading", { name: "Link expired" })).toBeVisible();
  });
});

test.describe("Auth callback hardening", () => {
  test("a bogus code goes to login with an error", async ({ page }) => {
    await page.goto("/auth/callback?code=not-a-real-code");
    await page.waitForURL("**/owner/login?error=link");
    await expect(alertBox(page)).toContainText("invalid or has expired");
  });

  test("`next` can't be used as an open redirect", async ({ page }) => {
    await page.goto("/auth/callback?code=x&next=https://evil.example/");
    await page.waitForURL("**/owner/login?error=link");
  });
});
