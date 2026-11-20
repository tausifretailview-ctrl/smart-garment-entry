import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * FASHION STUDIO (Nov 2026): 92 of 100 POS bills with a salesman had no commission rows, and
 * per-line-salesman / Sale Bills never got any. "Rebuild from bills" writes each bill's rows
 * from the bill (line salesman, else header) and reports bills with no salesman.
 */
const today = new Date().toISOString();
const sale = (id: string, salesman: string | null, net: number, sale_type = "pos") => ({
  id, organization_id: E2E_ORG_ID, sale_number: `POS/${id}`, sale_date: today, customer_name: "RAVI",
  salesman, net_amount: net, sale_type, deleted_at: null, is_cancelled: false,
});
const item = (id: string, sale_id: string, net: number, salesman: string | null = null) => ({
  id, sale_id, organization_id: E2E_ORG_ID, product_id: "p1", product_name: "SAREE", quantity: 1,
  line_total: net, discount_share: 0, net_after_discount: net, salesman, deleted_at: null,
});

test("Rebuild from bills writes the missing commission rows and flags bills without a salesman", async ({ page, backend }) => {
  backend
    .addRows("employees", [
      { id: "e1", organization_id: E2E_ORG_ID, employee_name: "ARYAN", commission_percent: 2, status: "active", designation: "Salesman", deleted_at: null },
      { id: "e2", organization_id: E2E_ORG_ID, employee_name: "JIYA", commission_percent: 1, status: "active", designation: "Salesman", deleted_at: null },
    ])
    .addRows("products", [{ id: "p1", organization_id: E2E_ORG_ID, product_name: "SAREE", brand: "B", category: "SAREE", style: null, deleted_at: null }])
    .addRows("sales", [sale("s1", "ARYAN", 1000), sale("s2", null, 600, "invoice"), sale("s3", null, 750)])
    .addRows("sale_items", [item("i1", "s1", 1000), item("i2", "s2", 600, "JIYA"), item("i3", "s3", 750)])
    .addRows("salesman_commissions", []);

  await page.goto(`/${E2E_ORG_SLUG}/salesman-commission`);
  await expect(page.getByRole("heading", { name: /Salesman Commission/ })).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("commission-rebuild").click();
  await expect(page.getByRole("dialog")).toContainText("Bills whose commission is already marked Paid are kept");
  await page.getByTestId("commission-rebuild-confirm").click();

  await expect(page.getByText("Commission rebuilt from bills").first()).toBeVisible({ timeout: 30_000 });
  const inserts = backend.calls.filter((c) => c.kind === "insert" && c.name === "salesman_commissions");
  expect(inserts).toHaveLength(1);
  const rows = inserts[0].body as Array<Record<string, unknown>>;
  expect(rows.map((r) => [r.sale_id, r.employee_name, r.sale_amount, r.commission_amount])).toEqual([
    ["s1", "ARYAN", 1000, 20],
    ["s2", "JIYA", 600, 6], // Sale Bill, salesman on the line only
  ]);
  await expect(page.getByTestId("commission-no-salesman")).toContainText("1 bill (₹750) in this period has no salesman, so it earns no commission.");
});
