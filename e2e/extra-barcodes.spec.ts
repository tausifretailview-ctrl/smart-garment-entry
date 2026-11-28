import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Extra barcodes per item (supermarket go-live, Nov 2026): Tata Salt's new pack has another
 * EAN. Scanning it at POS bills the same item (main barcode on the line), merging with the
 * old pack's scans.
 */
const salt = {
  id: "p-salt", organization_id: E2E_ORG_ID, product_name: "TATA SALT 1KG", brand: "TATA", category: "GROCERY", style: null,
  color: null, hsn_code: "2501", gst_per: 0, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const saltVariant = {
  id: "v-salt", product_id: "p-salt", organization_id: E2E_ORG_ID, size: "None", color: null, barcode: "8901058000016",
  sale_price: 28, mrp: 28, pur_price: 24, stock_qty: 40, active: true, deleted_at: null, products: salt,
};

test("POS: an item's extra barcode bills the item and merges with its main barcode", async ({ page, backend }) => {
  backend.addRows("products", [salt]).addRows("product_variants", [saltVariant]).addRows("variant_barcodes", [
    { id: "xb-1", organization_id: E2E_ORG_ID, variant_id: "v-salt", barcode: "8901058000023" },
  ]);

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  await scan.fill("8901058000023"); // new pack
  await scan.press("Enter");
  const row = page.locator("[data-pos-cart-row]", { hasText: "TATA SALT" }).filter({ visible: true }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText("8901058000016");

  await scan.fill("8901058000016"); // old pack
  await scan.press("Enter");
  await expect(row.locator("input").first()).toHaveValue("2");
  await expect(page.locator("[data-pos-cart-row]", { hasText: "TATA SALT" }).filter({ visible: true })).toHaveCount(1);
  expect(backend.readsOf("variant_barcodes").length).toBeGreaterThan(0);
});
