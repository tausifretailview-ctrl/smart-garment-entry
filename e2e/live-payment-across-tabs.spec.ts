import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_SUPABASE_URL } from "./support/mockBackend";

/**
 * Live payment status across browser tabs (Nov 2026): a payment saved in one tab must show as
 * Paid on the Sales Invoice Dashboard open in another tab, without a page refresh, even where
 * live updates (realtime) are blocked — here they always are.
 */
const sale = {
  id: "sale-7", organization_id: E2E_ORG_ID, sale_number: "INV/26-27/77", sale_type: "invoice",
  sale_date: new Date().toISOString(), created_at: new Date().toISOString(), customer_id: "cust-1",
  customer_name: "RAVI KUMAR", customer_phone: "9876543210", gross_amount: 1000, discount_amount: 0,
  flat_discount_amount: 0, flat_discount_percent: 0, other_charges: 0, round_off: 0, net_amount: 1000,
  paid_amount: 0, payment_status: "pending", payment_method: "pay_later", delivery_status: "undelivered",
  total_qty: 1, sale_return_adjust: 0, credit_applied: 0, is_cancelled: false, deleted_at: null, sale_items: [],
};
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };

test("a receipt saved in one tab turns the bill Paid on the dashboard in the other tab", async ({ page, backend, baseURL }) => {
  backend.addRows("customers", [customer]).addRows("sales", [sale]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const row = page.locator("tr", { hasText: "INV/26-27/77" }).filter({ visible: true }).first();
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row).toContainText("Not Paid");

  // Tab 2 (same browser): the payment is saved. Any screen that writes a receipt does it the
  // same way, so write it the way the app does, through the app's own request path.
  const other = await page.context().newPage();
  await backend.install(other, baseURL ?? "http://127.0.0.1");
  await other.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  await expect(other.locator("tr", { hasText: "INV/26-27/77" }).filter({ visible: true }).first()).toBeVisible({ timeout: 60_000 });
  Object.assign(backend.tables.sales[0], { paid_amount: 1000, payment_status: "completed" });
  const status = await other.evaluate(async (url) => {
    const res = await window.fetch(`${url}/rest/v1/voucher_entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voucher_type: "receipt", reference_type: "customer", reference_id: "sale-7", total_amount: 1000 }),
    });
    return res.status;
  }, E2E_SUPABASE_URL);
  expect(status).toBe(200);

  // Tab 1 follows within a few seconds.
  await expect(row).toContainText("Paid", { timeout: 8_000 });
  await expect(row).not.toContainText("Not Paid");
});
