import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Settings → Sale "Cursor to Qty after adding a product": after a product is added (Browse list
 * or barcode), the cursor is in its Qty, ready to type; Enter saves it and goes back to where
 * the product was picked.
 */

const product = {
  id: "p1",
  organization_id: E2E_ORG_ID,
  product_name: "COTTON SHIRT",
  brand: "ACME",
  category: "SHIRTS",
  style: null,
  color: "BLUE",
  hsn_code: "6205",
  gst_per: 5,
  uom: "NOS",
  product_type: "goods",
  status: "active",
  deleted_at: null,
};
const variant = {
  id: "v1",
  product_id: "p1",
  organization_id: E2E_ORG_ID,
  size: "M",
  color: "BLUE",
  barcode: "100001",
  sale_price: 999,
  mrp: 999,
  pur_price: 500,
  stock_qty: 10,
  active: true,
  deleted_at: null,
  products: product,
};

test("Sales invoice: cursor goes to Qty after adding, Enter returns to search", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  // As the shop in the report: Size Grid off (inline entry), cursor-to-Qty on.
  backend.tables.settings[0].sale_settings = { sale_focus_qty_after_add: true, enable_size_grid_sales: false };

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  // Barcode: Qty is open for typing; 3 + Enter saves it and goes back to the barcode box.
  await scan.fill("100001");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "100001" });
  await expect(line).toHaveCount(1);
  const qty = line.locator("input.sale-qty-box");
  await expect(qty).toBeFocused();
  await page.keyboard.type("3");
  await page.keyboard.press("Enter");
  await expect(scan).toBeFocused();
  await expect(line).toContainText("2997.00");

  // Browse list: picking keeps the cursor in Qty (the list used to take it back on close),
  // and Enter reopens the list.
  await page.getByPlaceholder("Browse products by name, brand, category, size...").click();
  const listSearch = page.getByPlaceholder("Search by name, barcode, brand, style...");
  await listSearch.fill("COTTON");
  await page.getByRole("option", { name: /COTTON SHIRT/ }).first().click();
  await expect(qty).toBeFocused();
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await expect(listSearch).toBeVisible();
  await expect(line).toContainText("4995.00");
});
