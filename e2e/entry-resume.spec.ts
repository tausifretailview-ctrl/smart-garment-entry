import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sale Bill with a customer and a product, switch to another window (Alt+W) and back:
 * the same bill is there, not a blank one (user report).
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 999, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

test("Sale Bill keeps the unsaved bill after switching window and back", async ({ page, backend }) => {
  backend.addRows("customers", [customer]).addRows("products", [product]).addRows("product_variants", [variant]);
  const open = (path: string) =>
    page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/${E2E_ORG_SLUG}/${path}`);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);

  // Another window, then back with Alt+W (the switcher opens on the window used before).
  await open("customers");
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/customers`));
  await page.waitForLoadState("networkidle");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.down("Alt");
  await page.keyboard.press("w");
  await page.keyboard.up("Alt");
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/sales-invoice`));

  await expect(page.getByPlaceholder("Scan barcode...").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  const line = page.locator("tr", { hasText: "100001" });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("COTTON SHIRT");
  await expect(page.getByRole("combobox").filter({ hasText: "RAVI KUMAR" })).toBeVisible();
});
