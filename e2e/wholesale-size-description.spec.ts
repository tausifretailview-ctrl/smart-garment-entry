import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * JINDAL TRADING (Nov 2026), Wholesale Size-wise A4 on a GST-exclusive bill. The line was saved
 * as "RC 5001-LEATHER-RED CHEIF-CHAPPAL" (name-style-brand-category); the shop wants only the
 * article no. (brand already heads the group, colour prints on its own), and rate / amount
 * without GST.
 */
const product = {
  id: "p-rc", organization_id: E2E_ORG_ID, product_name: "RC 5001", style: "LEATHER", brand: "RED CHEIF", category: "CHAPPAL",
  color: "BROWN", deleted_at: null,
};
const item = {
  id: "si-1", sale_id: "sale-4", product_id: "p-rc", variant_id: "v-rc-10", product_name: "RC 5001-LEATHER-RED CHEIF-CHAPPAL",
  size: "10", color: "BROWN", barcode: "500110", quantity: 5, unit_price: 1168.3, mrp: 0, discount_percent: 0, gst_percent: 5,
  line_total: 6133.58, hsn_code: "6403", discount_share: 0, deleted_at: null,
};
const sale = {
  id: "sale-4", organization_id: E2E_ORG_ID, sale_number: "INV/26-27/4", sale_type: "invoice", tax_type: "exclusive",
  sale_date: new Date().toISOString(), created_at: new Date().toISOString(), customer_id: null, customer_name: "CASH",
  customer_phone: "9021706040", gross_amount: 5841.5, discount_amount: 0, flat_discount_amount: 0, flat_discount_percent: 0,
  other_charges: 0, round_off: 0.42, net_amount: 6134, paid_amount: 6134, payment_status: "completed", payment_method: "cash",
  delivery_status: "delivered", total_qty: 5, sale_return_adjust: 0, credit_applied: 0, is_cancelled: false, deleted_at: null,
  sale_items: [item],
};

test("Wholesale Size-wise: description keeps only the parts ticked in Settings; rate and amount without GST", async ({ page, backend }) => {
  backend.tables.settings[0].sale_settings = {
    sales_bill_format: "a4",
    invoice_template: "wholesale-size-a4",
    invoice_description_sequence_enabled: true,
    invoice_description_sequence: "product_first",
    invoice_description_fields: { category: false, style: false, brand: false, color: true },
  };
  backend.addRows("products", [product]).addRows("sales", [sale]).addRows("sale_items", [item]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const row = page.locator("tr", { hasText: "INV/26-27/4" }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await row.getByTitle("Print Invoice").click();
  const preview = page.getByRole("dialog").filter({ hasText: "ORIGINAL FOR BUYER" });
  await expect(preview).toBeVisible({ timeout: 30_000 });

  const line = preview.locator('[data-testid="wsa4-row"]').first();
  await expect(line).toContainText("RC 5001 – BROWN");
  await expect(line).not.toContainText("LEATHER");
  await expect(line).not.toContainText("CHAPPAL");
  await expect(line.locator('[data-testid="wsa4-rate-cell"]')).toHaveText("1,168.30");
  await expect(line.locator('[data-testid="wsa4-amount-cell"]')).toHaveText("5,841.50");
  await expect(line.locator('[data-testid="wsa4-gst-cell"]')).toHaveText("5%");
  await expect(preview.locator('[data-testid="wsa4-totals"]')).not.toContainText("Sub Total");
});
