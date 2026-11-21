import { devices } from "@playwright/test";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Owner mobile app (phone): the app look shared with Field Sales.
 * - phone text size (16px root) on every screen, no sideways scroll
 * - bottom bar: one active tab; hidden on the bill entry screens
 * - POS: search, add, +/- on the line, payment buttons on screen
 * - Purchase: Save bill on screen (it used to sit under the bottom bar)
 */
const product = (id: string, name: string, brand: string, price: number) => ({
  id,
  organization_id: E2E_ORG_ID,
  product_name: name,
  brand,
  category: "SHIRTS",
  style: null,
  color: "BLUE",
  hsn_code: "6205",
  gst_per: 5,
  uom: "NOS",
  product_type: "goods",
  status: "active",
  deleted_at: null,
  default_sale_price: price,
  image_url: null,
});
const products = [product("p1", "COTTON SHIRT", "ACME", 999), product("p2", "DENIM JEANS", "LEVIS", 1899)];
const variants = products.flatMap((p, i) =>
  ["S", "M"].map((size, j) => ({
    id: `v${i}${j}`,
    product_id: p.id,
    organization_id: E2E_ORG_ID,
    size,
    color: "BLUE",
    barcode: `10000${i}${j}`,
    sale_price: p.default_sale_price,
    mrp: p.default_sale_price + 200,
    pur_price: 500,
    stock_qty: 10 + j,
    active: true,
    deleted_at: null,
    products: p,
  })),
);

test.use({ ...devices["Pixel 7"] });

test.beforeEach(async ({ backend }) => {
  backend
    .addRows("products", products)
    .addRows("product_variants", variants)
    .addRows("customers", [])
    .addRows("suppliers", [])
    .addRows("sales", [])
    .addRows("sale_items", [])
    .addRows("purchase_bills", [])
    .addRows("voucher_entries", []);
});

const rootFont = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
const sidewaysScroll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("home: phone text size, quick actions and one active tab", async ({ page }) => {
  await page.goto(`/${E2E_ORG_SLUG}/mobile-dashboard`);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible({ timeout: 30_000 });
  expect(await rootFont(page)).toBe("16px");
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);

  // Only Home is the current tab (it used to light up on every screen).
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Home");

  const quick = page.getByTestId("home-quick-actions");
  await expect(quick.getByRole("button", { name: "New bill" })).toBeVisible();
  await expect(quick.getByRole("button", { name: "Purchase" })).toBeVisible();

  await nav.getByRole("button", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Reports");
  expect(await rootFont(page)).toBe("16px");
});

test("POS: full-screen entry, add a product, change quantity on the line, pay buttons on screen", async ({ page }) => {
  await page.goto(`/${E2E_ORG_SLUG}/mobile-dashboard`);
  await page.getByTestId("home-quick-actions").getByRole("button", { name: "New bill" }).click();
  await expect(page).toHaveURL(/\/mobile-pos$/);
  await expect(page.getByText("New sale")).toBeVisible();
  // Entry screens have no bottom bar: more room for lines, Pay at the bottom edge.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  expect(await rootFont(page)).toBe("16px");

  await page.getByPlaceholder("Search name or barcode").fill("COTTON");
  await page.getByRole("button", { name: /COTTON SHIRT/ }).first().click();
  await expect(page.getByText("Bill lines · 1")).toBeVisible();
  await expect(page.getByTestId("pos-total")).toHaveText("₹999.00");

  await page.getByRole("button", { name: /^More COTTON SHIRT/ }).click();
  await expect(page.getByTestId("pos-total")).toHaveText("₹1,998.00");
  await page.getByRole("button", { name: /^Less COTTON SHIRT/ }).click();
  await expect(page.getByTestId("pos-total")).toHaveText("₹999.00");

  // Payment buttons are fully on screen.
  const cash = page.getByRole("button", { name: "Cash", exact: true });
  await expect(cash).toBeEnabled();
  const box = (await cash.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);

  // Tapping the line opens the keypad; Done closes it.
  await page.getByText("Qty 1 × ₹999.00").click();
  await expect(page.getByRole("button", { name: "OK" })).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "OK" })).toHaveCount(0);

  // Back arrow leaves the entry screen; the bottom bar is back with Sales active.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/mobile-sales$/);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Sales");
});

test("purchase entry: Save bill is on screen, not under a bottom bar", async ({ page }) => {
  await page.goto(`/${E2E_ORG_SLUG}/mobile-purchase-entry`);
  await expect(page.getByText("Purchase entry")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

  const save = page.getByRole("button", { name: "Save bill" });
  await expect(save).toBeVisible();
  const box = (await save.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await sidewaysScroll(page)).toBeLessThanOrEqual(0);
  expect(await rootFont(page)).toBe("16px");
});
