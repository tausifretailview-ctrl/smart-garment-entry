import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Buying in cases (supermarket go-live, Nov 2026): Parle-G comes 24 to a case. On the purchase
 * line the cashier types 5 cases at ₹480 a case; the bill saves 120 pieces at ₹20.
 */
const supplier = { id: "sup-1", organization_id: E2E_ORG_ID, supplier_name: "METRO WHOLESALE", deleted_at: null };
const product = {
  id: "p-biscuit", organization_id: E2E_ORG_ID, product_name: "PARLE-G 250G", uom: "PCS", alt_uom: "CASE", alt_uom_factor: 24,
  status: "active", deleted_at: null,
};
const line = {
  temp_id: "t1", product_id: "p-biscuit", sku_id: "v-biscuit", product_name: "PARLE-G 250G", size: "None", qty: 1,
  pur_price: 21, sale_price: 25, mrp: 25, gst_per: 18, hsn_code: "1905", barcode: "8901725001230",
  discount_percent: 0, line_total: 21, uom: "PCS",
};

test("Purchase: 5 cases at ₹480 a case save as 120 pieces at ₹20", async ({ page, backend }) => {
  backend.tables.settings[0].product_settings = { business_type: "supermarket" };
  backend.addRows("suppliers", [supplier]).addRows("products", [product]);
  backend.onRpc("save_purchase_bill_with_items_atomic", (args) => ({
    ...(args.p_bill as Record<string, unknown>), id: "bill-1", software_bill_no: "PUR/26-27/1", organization_id: E2E_ORG_ID,
  }));
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

  // The mock backend applies only eq filters: answer the save's "was this product deleted?"
  // read (deleted_at not null) with no rows, like the database would.
  await page.route(/\/rest\/v1\/products\?.*deleted_at=not\.is\.null/, (route) => route.fulfill({ json: [] }));

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  const row = page.locator("tr.purchase-bill-line-row");
  await expect(row).toHaveCount(1, { timeout: 60_000 });
  const cases = row.getByLabel(/^CASEs \(1 CASE = 24/);
  await expect(cases).toBeVisible();
  await cases.fill("5");
  await row.getByLabel("Rate per CASE").fill("480");
  await expect(row).toContainText("₹2400.00");

  await page.locator("#supplier_name").click();
  await page.getByRole("option", { name: "METRO WHOLESALE" }).click();
  await page.locator("#supplier_invoice_no").fill("MW-9");
  await page.locator("footer.entry-page-footer").getByRole("button", { name: /Save Bill/ }).click();
  await expect(page.getByRole("dialog", { name: /Bill Saved Successfully/ })).toBeVisible();

  const [save] = backend.rpcCalls("save_purchase_bill_with_items_atomic") as Array<{ p_items: Record<string, unknown>[] }>;
  expect(save.p_items[0]).toMatchObject({ qty: 120, pur_price: 20 });
});
