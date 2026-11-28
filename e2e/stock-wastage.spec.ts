import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/** Inventory → Wastage / Damage (supermarket phase 2, Nov 2026). */
const eggs = { id: "p-eggs", organization_id: E2E_ORG_ID, product_name: "EGGS TRAY 30", uom: "NOS", status: "active", deleted_at: null };
const variant = { id: "v-eggs", product_id: "p-eggs", organization_id: E2E_ORG_ID, size: "None", barcode: "EGG30", stock_qty: 20, opening_qty: 20, pur_price: 180, active: true, deleted_at: null, products: eggs };

test("Wastage: 2 broken egg trays saved in one call; the report shows cost by reason", async ({ page, backend }) => {
  backend.addRows("products", [eggs]).addRows("product_variants", [variant]).addRows("stock_wastage", [
    { id: "w0", organization_id: E2E_ORG_ID, doc_number: "WST-20261127-090000", variant_id: "v-eggs", quantity: 1, reason: "expired", unit_cost: 180, cost_value: 180, notes: null, wasted_on: new Date().toISOString().slice(0, 10), created_at: "", reversed_at: null, product_variants: { barcode: "EGG30", size: "None", products: { product_name: "EGGS TRAY 30" } } },
  ]);
  backend.onRpc("record_stock_wastage", () => ({ success: true, doc_number: "WST-20261128-114355", lines: 1, total_qty: 2, total_cost: 360 }));

  await page.goto(`/${E2E_ORG_SLUG}/stock-wastage`);
  await expect(page.getByRole("heading", { name: "Wastage / Damage" }).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("wastage-totals").filter({ visible: true })).toContainText("₹180.00");

  await page.getByTestId("wastage-picker").filter({ visible: true }).getByPlaceholder("Scan barcode or type item name").fill("EGG30");
  await page.getByRole("button", { name: /EGGS TRAY 30/ }).filter({ visible: true }).click();
  await page.getByLabel("Quantity EGGS TRAY 30").filter({ visible: true }).fill("2");
  await page.getByTestId("wastage-save").filter({ visible: true }).click();

  await expect.poll(() => backend.rpcCalls("record_stock_wastage").length).toBe(1);
  expect(backend.rpcCalls("record_stock_wastage")[0]).toMatchObject({
    p_organization_id: E2E_ORG_ID,
    p_lines: [{ variant_id: "v-eggs", quantity: 2, reason: "breakage" }],
  });
});
