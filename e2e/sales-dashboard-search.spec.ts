import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sales dashboard search (Lovable audit, Nov 2026). A text search on the sales table cannot
 * use its indexes for a logged-in user (Row Level Security + ILIKE), so it read every bill of
 * the shop. The dashboard now asks search_sales_header_ids for the matching bills and lists
 * them by id; on a database without that function it keeps the old text search.
 */
const SALE_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const sale = {
  id: SALE_ID, organization_id: E2E_ORG_ID, sale_number: "INV/26-27/41", sale_type: "invoice",
  sale_date: new Date().toISOString(), created_at: new Date().toISOString(), customer_id: null, customer_name: "KIRAN MEHTA",
  customer_phone: "9822000000", gross_amount: 1000, discount_amount: 0, flat_discount_amount: 0, net_amount: 1000,
  paid_amount: 1000, payment_method: "cash", payment_status: "completed", delivery_status: "undelivered", salesman: "RAJU",
  total_qty: 1, sale_return_adjust: 0, credit_applied: 0, is_cancelled: false, shop_name: null, deleted_at: null,
};

/** Sales reads that carry the search (by bill ids or by text). */
const salesSearchReads = (backend: { readsOf: (t: string) => Array<{ query: string }> }) =>
  backend.readsOf("sales").map((r) => r.query).filter((q) => q.includes("id.in.(") || q.includes("ilike"));

test("search lists the matching bills by id when the database search answers", async ({ page, backend }) => {
  backend.addRows("sales", [sale]);
  backend.onRpc("search_sales_header_ids", () => [{ sale_id: SALE_ID }]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const search = page.getByPlaceholder(/Search (by invoice, customer|invoice no, customer)/).filter({ visible: true });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.fill("kiran");

  await expect.poll(() => backend.rpcCalls("search_sales_header_ids").length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(backend.rpcCalls("search_sales_header_ids")[0]).toMatchObject({
    p_org_id: E2E_ORG_ID, p_search: "KIRAN", p_sale_types: ["invoice"], p_limit: 151, p_with_salesman: true,
  });
  await expect.poll(() => salesSearchReads(backend).length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const q of salesSearchReads(backend)) {
    expect(q).toContain(`id.in.(${SALE_ID})`);
    expect(q).not.toContain("ilike");
  }
  await expect(page.getByText("INV/26-27/41").first()).toBeVisible();
});

test("search keeps the text filter when the database has no search function", async ({ page, backend }) => {
  backend.addRows("sales", [sale]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const search = page.getByPlaceholder(/Search (by invoice, customer|invoice no, customer)/).filter({ visible: true });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.fill("kiran");

  await expect.poll(() => salesSearchReads(backend).length, { timeout: 15_000 }).toBeGreaterThan(0);
  for (const q of salesSearchReads(backend)) expect(q).toContain("customer_name.ilike.%KIRAN%");
  await expect(page.getByText("INV/26-27/41").first()).toBeVisible();
});
