import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Core flow 1 of 6 (Plan Phase 4, R2): a cashier scans a barcode in POS, saves the bill with
 * Cash (F1) and gets the "Invoice Saved" dialog with the bill number. The bill goes to the
 * database as ONE save_sale_with_items_numbered call carrying the bill and its line.
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

test("POS: scan a barcode, save with Cash (F1), bill number shown", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    const sale = args.p_sale as Record<string, unknown>;
    const items = args.p_items as unknown[];
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/1" }, items_inserted: items.length, settled: true };
  });

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });

  await scan.fill("100001");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "100001" });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText("COTTON SHIRT");
  await expect(line).toContainText("999.00");

  await page.keyboard.press("F1");
  const saved = page.getByRole("alertdialog", { name: "Invoice Saved!" });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("POS/26-27/1");

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
    sale_type: "pos",
    gross_amount: 999,
    net_amount: 999,
    payment_method: "cash",
    cash_amount: 999,
    paid_amount: 999,
    payment_status: "completed",
    customer_name: "Walk-in Customer",
  });
  expect(p_items).toHaveLength(1);
  expect(p_items[0]).toMatchObject({ variant_id: "v1", product_id: "p1", barcode: "100001", quantity: 1, unit_price: 999, line_total: 999, gst_percent: 5 });
  expect(p_numbering).toMatchObject({ kind: "pos" });

  // The old multi-step save path must not run as well.
  expect(backend.calls.filter((c) => (c.kind === "insert" || c.kind === "upsert") && (c.name === "sales" || c.name === "sale_items"))).toEqual([]);

  await saved.getByRole("button", { name: "Done" }).click();
  await expect(saved).toBeHidden();
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(0);
  await expect(page.getByText("POS/26-27/1").first()).toBeVisible();
});
