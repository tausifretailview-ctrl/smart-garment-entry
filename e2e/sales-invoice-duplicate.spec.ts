import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, type MockBackend } from "./support/mockBackend";

/**
 * Sales Invoice dashboard → Duplicate Invoice (Settings → Sale → Duplicate invoice). A new Sale Bill
 * filled from the chosen invoice: lines short of stock show in red, and on save the lines with no
 * stock are taken off first (the user then checks the bill and saves again).
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null, color: "BLUE",
  hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = (id: string, barcode: string, size: string, stock: number) => ({
  id, product_id: "p1", organization_id: E2E_ORG_ID, size, color: "BLUE", barcode, sale_price: 999, mrp: 999, pur_price: 500,
  stock_qty: stock, active: true, deleted_at: null, products: product,
});
const line = (id: string, variantId: string, barcode: string, size: string, deleted: string | null = null) => ({
  id, sale_id: "sale-7", product_id: "p1", variant_id: variantId, product_name: "COTTON SHIRT", size, barcode, color: "BLUE",
  quantity: 2, unit_price: 999, mrp: 999, discount_percent: 0, gst_percent: 5, line_total: 1998, hsn_code: "6205",
  discount_share: 0, deleted_at: deleted,
});
const sale = {
  id: "sale-7", organization_id: E2E_ORG_ID, sale_number: "INV/26-27/7", sale_type: "invoice", sale_date: new Date().toISOString(),
  created_at: new Date().toISOString(), customer_id: "cust-1", customer_name: "RAVI KUMAR", customer_phone: "9876543210",
  gross_amount: 3996, discount_amount: 0, flat_discount_amount: 0, flat_discount_percent: 0, other_charges: 0, round_off: 0,
  net_amount: 3996, paid_amount: 0, payment_status: "pending", payment_method: "pay_later", delivery_status: "undelivered",
  total_qty: 4, sale_return_adjust: 0, credit_applied: 0, is_cancelled: false, deleted_at: null,
  sale_items: [line("si-1", "v1", "200001", "M"), line("si-2", "v2", "200002", "L"), line("si-3", "v3", "200003", "XL", "2026-11-20T10:00:00Z")],
};

function seed(backend: MockBackend, duplicateOn: boolean) {
  backend
    .addRows("customers", [customer])
    .addRows("products", [product])
    .addRows("product_variants", [variant("v1", "200001", "M", 10), variant("v2", "200002", "L", 0), variant("v3", "200003", "XL", 5)])
    .addRows("sales", [sale]);
  const settings = backend.tables.settings[0] as Record<string, unknown>;
  settings.sale_settings = { ...((settings.sale_settings as Record<string, unknown>) || {}), duplicate_invoice: duplicateOn };
}

test("Duplicate Invoice: copy, out-of-stock line in red, removed on save, then saved", async ({ page, backend }) => {
  seed(backend, true);
  backend.onRpc("save_sale_with_items_numbered", (args) => ({
    sale: { ...(args.p_sale as Record<string, unknown>), id: "sale-8", sale_number: "INV/26-27/8" },
    items_inserted: (args.p_items as unknown[]).length,
    settled: true,
  }));

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const row = page.locator("tr", { hasText: "INV/26-27/7" }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  // Desktop: the Duplicate button in the row's action icons.
  await row.getByTestId("duplicate-invoice-button").click();

  // New bill, same lines (the deleted line is not copied).
  const shirtM = page.locator("tr", { hasText: "200001" });
  const shirtL = page.locator("tr", { hasText: "200002" });
  await expect(shirtM).toHaveCount(1, { timeout: 30_000 });
  await expect(shirtL).toHaveCount(1);
  await expect(page.locator("tr", { hasText: "200003" })).toHaveCount(0);
  await expect(page.getByText("Copied from INV/26-27/7").first()).toBeVisible();
  // No stock for size L: that line is red; size M is not.
  await expect(shirtL).toHaveAttribute("data-short-of-stock", "true");
  await expect(shirtM).not.toHaveAttribute("data-short-of-stock", "true");

  // First save: the line with no stock is taken off, nothing is saved yet.
  await page.keyboard.press("Control+s");
  await expect(page.getByText("1 item(s) with no stock removed").first()).toBeVisible();
  await expect(shirtL).toHaveCount(0);
  expect(backend.rpcCalls("save_sale_with_items_numbered")).toHaveLength(0);

  // Second save: the bill is saved with the line that has stock.
  await page.keyboard.press("Control+s");
  await expect(page.getByRole("alertdialog", { name: "Print Invoice?" })).toBeVisible();
  const [save] = backend.rpcCalls("save_sale_with_items_numbered") as Array<{ p_sale: Record<string, unknown>; p_items: Record<string, unknown>[] }>;
  expect(save.p_items.map((i) => i.variant_id)).toEqual(["v1"]);
  expect(save.p_sale).toMatchObject({ customer_id: "cust-1" });
});

test("Duplicate Invoice is not in the menu while the setting is off", async ({ page, backend }) => {
  seed(backend, false);
  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const row = page.locator("tr", { hasText: "INV/26-27/7" }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row.getByRole("button", { name: "Print Invoice" }).or(row.getByTitle("Print Invoice")).first()).toBeVisible();
  await expect(page.getByTestId("duplicate-invoice-button")).toHaveCount(0);
  // Right-click menu: no Duplicate Invoice either.
  await row.click({ button: "right" });
  await expect(page.getByText("Open Invoice").first()).toBeVisible();
  await expect(page.getByText("Duplicate Invoice")).toHaveCount(0);
});
