import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sale Bill: the ▲ on a line's Rate box shows the purchase rate and landing cost (without / with
 * GST) from the product's latest purchase bill, read only when opened. The bill has two lines,
 * a ₹300 bill discount and ₹450 freight, shared by line value: this line is 10 × ₹1,000 of a
 * ₹15,000 bill (2/3) → (10,000 − 200 + 300) / 10 = ₹1,010; with 5% GST on 9,800 → ₹1,059.
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "PRINTED SAREE", brand: "ACME", category: "SAREE", style: null, color: null,
  hsn_code: "5407", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "FREE", color: null, barcode: "200001",
  sale_price: 1800, mrp: 1800, pur_price: 1000, stock_qty: 10, active: true, deleted_at: null, products: product,
};
const bill = {
  software_bill_no: "PUR/26-27/41", supplier_name: "RAJ TRADERS", bill_date: "2026-11-02", created_at: "2026-11-02T10:00:00Z",
  gross_amount: 15000, discount_amount: 300, other_charges: 450, round_off: 0, is_dc_purchase: false, is_cancelled: false,
  organization_id: E2E_ORG_ID, deleted_at: null,
};
const olderBill = { ...bill, software_bill_no: "PUR/26-27/12", bill_date: "2026-06-01", created_at: "2026-06-01T10:00:00Z", discount_amount: 0, other_charges: 0, gross_amount: 9000 };

test("Sale Bill: ▲ shows purchase rate and landing cost from the latest purchase bill", async ({ page, backend }) => {
  backend
    .addRows("customers", [customer])
    .addRows("products", [product])
    .addRows("product_variants", [variant])
    .addRows("purchase_items", [
      // An older purchase at ₹900 must not be used.
      { id: "pi-0", sku_id: "v1", bill_id: "pb-0", pur_price: 900, qty: 10, line_total: 9000, gst_per: 5, created_at: "2026-06-01T10:00:00Z", deleted_at: null, purchase_bills: olderBill },
      { id: "pi-1", sku_id: "v1", bill_id: "pb-1", pur_price: 1000, qty: 10, line_total: 10000, gst_per: 5, created_at: "2026-11-02T10:00:00Z", deleted_at: null, purchase_bills: bill },
      { id: "pi-2", sku_id: "v9", bill_id: "pb-1", pur_price: 500, qty: 10, line_total: 5000, gst_per: 5, created_at: "2026-11-02T10:00:00Z", deleted_at: null, purchase_bills: bill },
    ]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  await scan.fill("200001");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "200001" });
  await expect(line).toHaveCount(1);

  // Nothing about cost is read until the ▲ is opened.
  expect(backend.readsOf("purchase_items")).toHaveLength(0);
  await line.getByTestId("sale-line-cost-button").click();
  const pop = page.getByTestId("sale-line-cost-popover");
  await expect(pop).toBeVisible();
  await expect(pop.getByTestId("sale-line-cost-rate")).toHaveText("₹1,000.00");
  await expect(pop.getByTestId("sale-line-landing-ex")).toHaveText("₹1,010.00");
  await expect(pop.getByTestId("sale-line-landing-inc")).toHaveText("₹1,059.00");
  await expect(pop).toContainText("PUR/26-27/41");
  await expect(pop).toContainText("RAJ TRADERS");

  // Closing it leaves the line and its rate as they were.
  await page.keyboard.press("Escape");
  await expect(pop).toBeHidden();
  await expect(line.locator("input[type=number]").first()).toBeVisible();
});
