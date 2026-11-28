import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Supermarket go-live (Nov 2026): a weighing-scale label carries the item code and weight in
 * its barcode. Scanning 2100123002504 bills item 00123 (loose sugar, KG) at 0.250 kg; a second
 * bag adds its weight to the same line. Company EANs scan as before.
 */
const sugar = {
  id: "p-sugar", organization_id: E2E_ORG_ID, product_name: "SUGAR LOOSE", brand: null, category: "STAPLES", style: null,
  color: null, hsn_code: "1701", gst_per: 5, uom: "KG", product_type: "goods", status: "active", deleted_at: null,
};
const salt = { ...sugar, id: "p-salt", product_name: "TATA SALT 1KG", uom: "NOS", hsn_code: "2501", gst_per: 0 };
const variant = (id: string, p: typeof sugar, barcode: string, price: number) => ({
  id, product_id: p.id, organization_id: E2E_ORG_ID, size: "None", color: null, barcode,
  sale_price: price, mrp: price, pur_price: price * 0.8, stock_qty: 50, active: true, deleted_at: null, products: p,
});

test("POS: scale labels add the weight as quantity; a company EAN still adds one piece", async ({ page, backend }) => {
  backend.tables.settings[0].sale_settings = { scale_barcode: { enabled: true, prefixes: ["21"], itemDigits: 5, valueDigits: 5 } };
  backend.addRows("products", [sugar, salt]).addRows("product_variants", [
    variant("v-sugar", sugar, "00123", 44),
    variant("v-salt", salt, "8901058000016", 28),
  ]);

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  await scan.fill("2100123002504"); // 0.250 kg
  await scan.press("Enter");
  const sugarRow = page.locator("[data-pos-cart-row]", { hasText: "SUGAR LOOSE" }).filter({ visible: true }).first();
  await expect(sugarRow).toBeVisible();
  await expect(sugarRow.locator("input").first()).toHaveValue("0.25");

  await scan.fill("2100123015009"); // another bag, 1.500 kg
  await scan.press("Enter");
  await expect(sugarRow.locator("input").first()).toHaveValue("1.75");
  await expect(page.locator("[data-pos-cart-row]", { hasText: "SUGAR LOOSE" }).filter({ visible: true })).toHaveCount(1);

  await scan.fill("8901058000016"); // company EAN
  await scan.press("Enter");
  const saltRow = page.locator("[data-pos-cart-row]", { hasText: "TATA SALT" }).filter({ visible: true }).first();
  await expect(saltRow.locator("input").first()).toHaveValue("1");
});

test("Sale Bill: a scale label adds the weight as quantity", async ({ page, backend }) => {
  backend.tables.settings[0].sale_settings = { scale_barcode: { enabled: true, prefixes: ["21"], itemDigits: 5, valueDigits: 5 } };
  backend.addRows("products", [sugar]).addRows("product_variants", [variant("v-sugar", sugar, "00123", 44)]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await scan.fill("2100123002504");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "00123" }).filter({ visible: true }).first();
  await expect(line).toBeVisible();
  await expect(line.locator("input").first()).toHaveValue("0.25");
  await expect(line).toContainText("₹11.00"); // 0.250 kg × ₹44
});
