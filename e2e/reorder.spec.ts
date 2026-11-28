import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/** Inventory → Reorder (supermarket phase 2, Nov 2026): one purchase order per supplier. */
test("Reorder: Parle-G at 30 under its level 48 → 9 cases into a purchase order for METRO", async ({ page, backend }) => {
  backend.addRows("suppliers", [{ id: "sup-1", organization_id: E2E_ORG_ID, supplier_name: "METRO", phone: "9000000000", deleted_at: null }]);
  backend.onRpc("get_reorder_suggestions", () => [
    {
      variant_id: "v-parle", product_id: "p-parle", product_name: "PARLE-G 250G", brand: "PARLE", category: "Biscuits", size: "None",
      color: null, barcode: "8901725001230", uom: "PCS", pack_unit: "CASE", pack_factor: 24, reorder_level: 48, max_stock: 240,
      product_stock: 30, variant_stock: 30, sold_in_period: 120, suggested_qty: 216, pur_price: 21.5, gst_percent: 18,
      hsn_code: "1905", supplier_id: "sup-1", supplier_name: "METRO",
    },
  ]);

  await page.goto(`/${E2E_ORG_SLUG}/reorder`);
  const group = page.getByTestId("reorder-group").filter({ visible: true }).first();
  await expect(group).toBeVisible({ timeout: 60_000 });
  await expect(group).toContainText("METRO");
  await expect(group).toContainText("9 CASE");
  await expect(group.getByLabel("Order qty PARLE-G 250G")).toHaveValue("216");

  await group.getByRole("button", { name: "Create PO" }).click();
  await expect(page).toHaveURL(/purchase-order-entry/);
  // The purchase order opens with the line: 216 pieces at the purchase rate.
  await expect(page.getByRole("row", { name: /PARLE-G 250G.*216/ }).filter({ visible: true }).first()).toBeVisible();
});
