import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * The POS scan box keeps its own text while keys arrive, so a scan no longer redraws the
 * whole POS screen once per character (speed review item S3). What the cashier sees must not
 * change: a scan adds the line and empties the box, typing a name opens the product list.
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 999, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

test("scanner-speed keys: each scan adds the item and empties the box", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  const line = page.locator("tr", { hasText: "100001" });

  // A scanner types the code a few milliseconds per key and ends with Enter.
  await scan.pressSequentially("100001", { delay: 8 });
  await scan.press("Enter");
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("COTTON SHIRT");
  await expect(scan).toHaveValue("");

  // Straight away the next scan: the box is ready and the quantity goes up.
  await scan.pressSequentially("100001", { delay: 8 });
  await scan.press("Enter");
  await expect(scan).toHaveValue("");
  await expect(line).toHaveCount(1);
  await expect
    .poll(() => page.getByRole("textbox").evaluateAll((boxes) => boxes.map((b) => (b as HTMLInputElement).value)))
    .toContain("2"); // the cart line's quantity box

  // The product list never opened for a scan, and no late update brings the code back.
  await page.waitForTimeout(600);
  await expect(scan).toHaveValue("");
  await expect(page.getByRole("option", { name: /COTTON SHIRT/ })).toHaveCount(0);
});

test("typing a name still opens the product list, and picking a row adds it", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  await scan.pressSequentially("COTT", { delay: 120 });
  const row = page.getByRole("option", { name: /COTTON SHIRT/ }).first();
  await expect(row).toBeVisible();
  await expect(scan).toHaveValue("COTT"); // what was typed stays in the box
  await row.click();
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);
  await expect(scan).toHaveValue("");
});
