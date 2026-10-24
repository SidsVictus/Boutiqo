import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

// Deleting cloth photos, against the in-memory Supabase/R2 stand-in (supabase-mock.mjs).
const MOCK = "http://127.0.0.1:54321";
const PASSWORD = "correct-horse-1";
const OWNER = "owner@gmail.com";
const OTHER = "other.owner@gmail.com";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const main = (page: Page) => page.locator(".bq-shell-mobile__content");
const photos = (page: Page) => main(page).locator('img[alt^="Cloth photo"]');

async function mock(request: APIRequestContext, path: string, body?: unknown) {
  const res = await request.post(`${MOCK}/__mock/${path}`, { data: body ?? {} });
  expect(res.ok()).toBeTruthy();
}
const tables = async (request: APIRequestContext) => (await request.get(`${MOCK}/__mock/tables`)).json();

test.beforeEach(async ({ request }) => {
  await mock(request, "reset");
  await mock(request, "seed", {
    users: [
      { email: OWNER, password: PASSWORD },
      { email: OTHER, password: PASSWORD },
    ],
    boutiques: [
      { ownerEmail: OWNER, name: "Lotus Boutique", owner_name: "Anitha", category: "Tailoring", phone: "98480 11111" },
      { ownerEmail: OTHER, name: "Rose Tailors", owner_name: "Rekha", category: "Tailoring", phone: "98480 22222" },
    ],
    customers: [
      { ownerEmail: OWNER, name: "Aisha Fatima", phone: null },
      { ownerEmail: OTHER, name: "Kavya Iyer", phone: null },
    ],
    orders: [
      { ownerEmail: OWNER, customerName: "Aisha Fatima", due_date: "2099-01-10", total_amount: 900 },
      { ownerEmail: OTHER, customerName: "Kavya Iyer", due_date: "2099-01-12", total_amount: 700 },
    ],
  });
});

async function login(page: Page, email = OWNER) {
  await page.goto("/owner/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/owner/dashboard");
}

async function upload(page: Page, request: APIRequestContext, orderId: string, count: number) {
  await page.goto(`/owner/orders/${orderId}`);
  for (let i = 1; i <= count; i++) {
    await main(page).locator('input[type="file"]').first().setInputFiles({ name: `c${i}.png`, mimeType: "image/png", buffer: PNG });
    await expect.poll(async () => (await tables(request)).files.filter((f: { upload_status: string }) => f.upload_status === "uploaded").length).toBe(i);
  }
}

test("deleting a photo asks first, removes it everywhere, and moves the cover to the next one", async ({ page, request }) => {
  const t0 = await tables(request);
  const order = t0.orders.find((o: { customer_id: string }) => o.customer_id === t0.customers.find((c: { name: string }) => c.name === "Aisha Fatima").id);
  await login(page);
  await upload(page, request, order.id, 3);
  await page.reload();
  await expect(photos(page)).toHaveCount(3);

  const before = await tables(request);
  const photosOf = before.files.filter((f: { order_id: string }) => f.order_id === order.id);
  const cover = before.orders.find((o: { id: string }) => o.id === order.id).cloth_photo_file_id;
  expect(cover).toBe(photosOf[0].id); // the first photo is the cover

  // Keep leaves it alone.
  await main(page).getByRole("button", { name: "Delete photo 1" }).click();
  await main(page).getByRole("button", { name: "Keep" }).click();
  await expect(photos(page)).toHaveCount(3);

  // Delete the cover.
  await main(page).getByRole("button", { name: "Delete photo 1" }).click();
  await expect(main(page).getByText("Delete this photo?")).toBeVisible();
  await main(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(photos(page)).toHaveCount(2);

  const after = await tables(request);
  expect(after.files.filter((f: { order_id: string }) => f.order_id === order.id)).toHaveLength(2);
  expect(after.files.some((f: { id: string }) => f.id === cover)).toBe(false);
  expect(after.orders.find((o: { id: string }) => o.id === order.id).cloth_photo_file_id).toBe(photosOf[1].id);

  await page.reload();
  await expect(photos(page)).toHaveCount(2);
  const track = await (await page.request.get(`/api/track/${order.tracking_token}`)).json();
  expect(track.data.clothPhotoUrls).toHaveLength(2);

  // Deleting the rest leaves an order with no cover.
  for (let left = 2; left > 0; left--) {
    await main(page).getByRole("button", { name: "Delete photo 1" }).click();
    await main(page).getByRole("button", { name: "Delete", exact: true }).click();
    await expect(photos(page)).toHaveCount(left - 1);
  }
  expect((await tables(request)).orders.find((o: { id: string }) => o.id === order.id).cloth_photo_file_id).toBeNull();
});

test("DELETE /api/files/:id is scoped to the owner's own boutique and needs a sign-in", async ({ page, request, browser }) => {
  const t0 = await tables(request);
  const rose = t0.boutiques.find((b: { name: string }) => b.name === "Rose Tailors");
  const theirs = t0.orders.find((o: { boutique_id: string }) => o.boutique_id === rose.id);

  // Rose Tailors uploads a photo.
  const other = await browser.newContext({ baseURL: "http://localhost:3210" });
  const op = await other.newPage();
  await login(op, OTHER);
  await upload(op, request, theirs.id, 1);
  const theirFile = (await tables(request)).files[0];
  await other.close();

  await login(page);
  expect((await page.request.delete(`/api/files/${theirFile.id}`)).status()).toBe(404);
  expect((await page.request.delete(`/api/files/not-a-uuid`)).status()).toBe(404);
  expect((await tables(request)).files).toHaveLength(1);

  const anon = await browser.newContext({ baseURL: "http://localhost:3210" });
  expect((await anon.request.delete(`/api/files/${theirFile.id}`)).status()).toBe(401);
  await anon.close();
});

test("a storage failure keeps the photo and says so", async ({ page, request }) => {
  const t0 = await tables(request);
  const order = t0.orders[0];
  await login(page);
  await upload(page, request, order.id, 1);
  await page.reload();
  await expect(photos(page)).toHaveCount(1);

  await page.route("**/api/files/*", (route) => (route.request().method() === "DELETE" ? route.fulfill({ status: 503, json: { error: { code: "storage_unavailable", message: "Photo storage isn't available right now. Try again later." } } }) : route.continue()));
  await main(page).getByRole("button", { name: "Delete photo 1" }).click();
  await main(page).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(main(page).getByText("Photo storage isn't available right now. Try again later.")).toBeVisible();
  expect((await tables(request)).files).toHaveLength(1);
});
