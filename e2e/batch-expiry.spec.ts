import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/** Batch & expiry (supermarket phase 2, Nov 2026). */
const supplier = { id: "sup-1", organization_id: E2E_ORG_ID, supplier_name: "DAIRY CO", deleted_at: null };
const product = { id: "p-milk", organization_id: E2E_ORG_ID, product_name: "AMUL MILK 1L", uom: "PCS", status: "active", deleted_at: null };
const line = {
  temp_id: "t1", product_id: "p-milk", sku_id: "v-milk", product_name: "AMUL MILK 1L", size: "None", qty: 30,
  pur_price: 52.5, sale_price: 56, mrp: 56, gst_per: 0, hsn_code: "0401", barcode: "8901262010016",
  discount_percent: 0, line_total: 1575, uom: "PCS",
};

test("Purchase: batch and expiry typed on the line are saved after the bill", async ({ page, backend }) => {
  backend.tables.settings[0].purchase_settings = { track_batch_expiry: true };
  backend.addRows("suppliers", [supplier]).addRows("products", [product]);
  backend.onRpc("save_purchase_bill_with_items_atomic", (args) => ({
    ...(args.p_bill as Record<string, unknown>), id: "bill-1", software_bill_no: "PUR/26-27/1", organization_id: E2E_ORG_ID,
  }));
  backend.onRpc("set_purchase_line_batches", () => ({ success: true, lines: 1 }));
  await page.addInitScript(
    ({ key, draft }) => {
      if (sessionStorage.getItem("__e2e_seeded")) return;
      sessionStorage.setItem("__e2e_seeded", "1");
      sessionStorage.setItem(key, JSON.stringify(draft));
    },
    {
      key: `purchaseEntryState:${E2E_ORG_ID}:${E2E_USER_ID}`,
      draft: { lineItems: [line], billData: { supplier_id: "", supplier_name: "", supplier_invoice_no: "" }, entryMode: "inline", savedAt: Date.now() },
    },
  );
  await page.route(/\/rest\/v1\/products\?.*deleted_at=not\.is\.null/, (route) => route.fulfill({ json: [] }));

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  const row = page.locator("tr.purchase-bill-line-row");
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  await row.getByLabel("Batch no AMUL MILK 1L").fill("B9");
  await row.getByLabel("Batch no AMUL MILK 1L").blur();
  await row.getByLabel("Expiry date AMUL MILK 1L").fill("2026-12-03");

  await page.locator("#supplier_name").click();
  await page.getByRole("option", { name: "DAIRY CO" }).click();
  await page.locator("#supplier_invoice_no").fill("DC-1");
  await page.locator("footer.entry-page-footer").getByRole("button", { name: /Save Bill/ }).click();
  await expect(page.getByRole("dialog", { name: /Bill Saved Successfully/ })).toBeVisible();

  await expect.poll(() => backend.rpcCalls("set_purchase_line_batches").length).toBe(1);
  expect(backend.rpcCalls("set_purchase_line_batches")[0]).toEqual({
    p_organization_id: E2E_ORG_ID,
    p_bill_id: "bill-1",
    p_lines: [{ sku_id: "v-milk", barcode: null, batch_no: "B9", expiry_date: "2026-12-03", mfg_date: null }],
  });
});

test("Expiry: expired lot is written off from the report", async ({ page, backend }) => {
  const rows = [
    {
      variant_id: "v-milk", purchase_bill_id: "bill-0", product_name: "AMUL MILK 1L", brand: "AMUL", size: "None", barcode: "8901262010016",
      bill_number: "PUR/26-27/0", purchase_date: "2026-11-08", supplier_name: "DAIRY CO", batch_no: "B7", expiry_date: "2026-11-26",
      days_left: -2, lot_qty: 4, unit_cost: 52.5, cost_value: 210,
    },
    {
      variant_id: "v-milk", purchase_bill_id: "bill-1", product_name: "AMUL MILK 1L", brand: "AMUL", size: "None", barcode: "8901262010016",
      bill_number: "PUR/26-27/1", purchase_date: "2026-11-26", supplier_name: "DAIRY CO", batch_no: "B9", expiry_date: "2026-12-03",
      days_left: 5, lot_qty: 30, unit_cost: 52.5, cost_value: 1575,
    },
  ];
  backend.onRpc("get_expiry_report", () => rows);
  backend.onRpc("write_off_expired_lot", () => ({ success: true, doc_number: "WST-20261128-120000", total_qty: 4, total_cost: 210, lot_qty_left: 0 }));
  page.on("dialog", (d) => void d.accept());

  await page.goto(`/${E2E_ORG_SLUG}/expiry-report`);
  await expect(page.getByRole("heading", { name: "Expiry" }).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("expiry-row").filter({ visible: true })).toHaveCount(2);
  await expect(page.getByTestId("expired-value").filter({ visible: true })).toHaveText("₹210");
  await expect(page.getByText("Expired 2 days ago").filter({ visible: true })).toBeVisible();

  await page.getByRole("button", { name: "Write off AMUL MILK 1L PUR/26-27/0" }).filter({ visible: true }).click();
  await expect.poll(() => backend.rpcCalls("write_off_expired_lot").length).toBe(1);
  expect(backend.rpcCalls("write_off_expired_lot")[0]).toEqual({
    p_organization_id: E2E_ORG_ID,
    p_bill_id: "bill-0",
    p_variant_id: "v-milk",
    p_quantity: null,
    p_notes: "Batch B7 · exp 26/11/2026 · PUR/26-27/0",
  });
  // Only the expired lot can be written off.
  await expect(page.getByRole("button", { name: /Write off AMUL MILK 1L PUR\/26-27\/1/ })).toHaveCount(0);
});
