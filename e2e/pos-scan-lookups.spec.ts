import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Server trips per barcode scan in POS (speed review item L4). A scan used to read the item,
 * then read the same row again for its stock; an unknown barcode asked the item master for
 * the same code three times. Each trip is time the cashier waits before the next scan.
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = (stock: number) => ({
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 999, pur_price: 500, stock_qty: stock, active: true, deleted_at: null, products: product,
});

test("a scan that finds the item reads it once", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant(10)]);
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  const line = page.locator("[data-pos-cart-row]", { hasText: "100001" }).filter({ visible: true });

  let before = backend.readsOf("product_variants").length;
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(line).toHaveCount(1);
  await expect(scan).toHaveValue("");
  await page.waitForTimeout(500);
  expect(backend.readsOf("product_variants").slice(before).map((r) => r.query)).toHaveLength(1);

  // The same item again (quantity 2): again one read, with the stock it returns.
  before = backend.readsOf("product_variants").length;
  await scan.fill("100001");
  await scan.press("Enter");
  await expect
    .poll(() => page.getByRole("textbox").evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value)))
    .toContain("2");
  await page.waitForTimeout(500);
  expect(backend.readsOf("product_variants").slice(before)).toHaveLength(1);
});

test("the stock the scan returned still stops an oversell", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant(1)]);
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("[data-pos-cart-row]", { hasText: "100001" }).filter({ visible: true })).toHaveCount(1);

  // One piece in stock, one already on the bill: the second scan is refused.
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.getByText(/Insufficient Stock|stock/i).filter({ visible: true }).first()).toBeVisible();
  const quantities = await page.getByRole("textbox").evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value));
  expect(quantities).not.toContain("2");
});

test("an unknown barcode does not ask the item master for the same code three times", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant(10)]);
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle");

  const before = backend.reads.length;
  await scan.fill("73920184"); // not a doubled or EAN-12/13 code: one form only
  await scan.press("Enter");
  await expect(page.getByText(/not found/i).filter({ visible: true }).first()).toBeVisible();
  await page.waitForTimeout(500);
  const after = backend.reads.slice(before);
  const masterAsks = after.filter((r) => r.table === "product_variants" && r.query.includes("barcode=eq.73920184"));
  const purchaseAsks = after.filter((r) => r.table === "purchase_items");
  // Once for sellable items, once including items of switched-off products; purchase bills once.
  // Before: three asks of the item master and two of the purchase bills.
  expect(masterAsks).toHaveLength(2);
  expect(purchaseAsks).toHaveLength(1);
});
