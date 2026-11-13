import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Core flow 4 of 6 (Plan Phase 4, R2): Sales Invoice — pick the customer, scan a barcode,
 * save with Ctrl+S. The invoice goes to the database as ONE save_sale_with_items_numbered
 * call (unpaid: pay later / pending), and "Print Invoice?" shows the new invoice number.
 */

const customer = {
  id: "cust-1",
  organization_id: E2E_ORG_ID,
  customer_name: "RAVI KUMAR",
  phone: "9876543210",
  opening_balance: 0,
  deleted_at: null,
};
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

test("Sales invoice: customer, scan, Ctrl+S, invoice number shown", async ({ page, backend }) => {
  backend.addRows("customers", [customer]).addRows("products", [product]).addRows("product_variants", [variant]);
  backend.onRpc("save_sale_with_items_numbered", (args) => ({
    sale: { ...(args.p_sale as Record<string, unknown>), id: "sale-1", sale_number: "INV/26-27/1" },
    items_inserted: (args.p_items as unknown[]).length,
    settled: true,
  }));

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  await expect(page.getByRole("combobox").filter({ hasText: "RAVI KUMAR" })).toBeVisible();

  await scan.fill("100001");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "100001" });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("COTTON SHIRT");

  await page.keyboard.press("Control+s");
  const saved = page.getByRole("alertdialog", { name: "Print Invoice?" });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("INV/26-27/1");

  const saves = backend.rpcCalls("save_sale_with_items_numbered");
  expect(saves).toHaveLength(1);
  const { p_organization_id, p_sale, p_items, p_numbering } = saves[0] as {
    p_organization_id: string;
    p_sale: Record<string, unknown>;
    p_items: Record<string, unknown>[];
    p_numbering: Record<string, unknown>;
  };
  expect(p_organization_id).toBe(E2E_ORG_ID);
  expect(p_sale).toMatchObject({
    sale_type: "invoice",
    customer_id: "cust-1",
    customer_name: "RAVI KUMAR",
    gross_amount: 999,
    net_amount: 999,
    payment_method: "pay_later",
    payment_status: "pending",
    paid_amount: 0,
  });
  expect(p_items).toHaveLength(1);
  expect(p_items[0]).toMatchObject({ variant_id: "v1", product_id: "p1", barcode: "100001", quantity: 1, unit_price: 999, line_total: 999, gst_percent: 5 });
  expect(p_numbering).toMatchObject({ kind: "sale" });

  // The old multi-step save path must not run as well.
  expect(backend.calls.filter((c) => (c.kind === "insert" || c.kind === "upsert") && (c.name === "sales" || c.name === "sale_items"))).toEqual([]);

  await saved.getByRole("button", { name: "Skip" }).click();
  await expect(saved).toBeHidden();
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(0);
});
