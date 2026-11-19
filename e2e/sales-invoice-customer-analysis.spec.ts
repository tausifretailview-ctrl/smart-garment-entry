import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sale Bill → pick a customer → History (all transactions) and Analysis (what they buy,
 * prices paid, payment record), user request.
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const sale = (id: string, n: number, net: number, method: string, status: string) => ({
  id, organization_id: E2E_ORG_ID, customer_id: "cust-1", customer_name: "RAVI KUMAR", sale_number: `INV/${id}`,
  sale_date: daysAgo(n), sale_type: "invoice", net_amount: net, gross_amount: net, paid_amount: status === "completed" ? net : 0,
  payment_method: method, payment_status: status, is_cancelled: false, deleted_at: null,
});
const line = (id: string, saleId: string, productId: string, name: string, size: string, qty: number, mrp: number, total: number) => ({
  id, organization_id: E2E_ORG_ID, sale_id: saleId, product_id: productId, product_name: name, size, color: "BLUE",
  quantity: qty, unit_price: total / qty, mrp, discount_percent: 0, line_total: total, deleted_at: null,
});

test("Sale Bill: customer History and Analysis buttons", async ({ page, backend }, testInfo) => {
  backend
    .addRows("customers", [customer])
    .addRows("sales", [
      sale("s1", 70, 2000, "cash", "completed"),
      sale("s2", 40, 1000, "upi", "completed"),
      sale("s3", 10, 3000, "pay_later", "pending"),
    ])
    .addRows("sale_items", [
      line("i1", "s1", "p1", "COTTON SHIRT", "M", 2, 1000, 2000),
      line("i2", "s2", "p2", "DENIM JEANS", "32", 1, 1200, 1000),
      line("i3", "s3", "p1", "COTTON SHIRT", "M", 3, 1000, 2400),
      line("i4", "s3", "p3", "SOCKS", "M", 2, 300, 600),
    ])
    .addRows("products", [
      { id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", status: "active", deleted_at: null },
      { id: "p2", organization_id: E2E_ORG_ID, product_name: "DENIM JEANS", brand: "DENIMCO", category: "JEANS", status: "active", deleted_at: null },
      { id: "p3", organization_id: E2E_ORG_ID, product_name: "SOCKS", brand: "ACME", category: "ACCESSORIES", status: "active", deleted_at: null },
    ]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  await expect(page.getByPlaceholder("Scan barcode...").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  // No customer yet: no buttons.
  await expect(page.getByRole("button", { name: "Customer analysis" })).toHaveCount(0);

  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();

  await expect(page.getByRole("button", { name: "Customer history" })).toBeVisible();
  await page.locator(".sale-bill-details-section").screenshot({ path: testInfo.outputPath("customer-buttons.png") });
  await page.getByRole("button", { name: "Customer analysis" }).click();
  const dialog = page.getByTestId("customer-analysis-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("kpi-total-spent")).toContainText("₹6,000");
  await expect(dialog.getByTestId("kpi-bills")).toContainText("3");
  await expect(dialog.getByTestId("kpi-bills")).toContainText("Avg bill ₹2,000");
  const products = dialog.getByTestId("customer-analysis-products");
  await expect(products.locator("tbody tr").first()).toContainText("COTTON SHIRT");
  await expect(products.locator("tbody tr").first()).toContainText("₹4,400");
  await expect(dialog.getByTestId("customer-analysis-payments")).toContainText("Credit (pay later)");
  await expect(dialog.getByTestId("customer-analysis-insights")).toContainText("Favourite brand: ACME");
  await expect(dialog).toContainText("SHIRTS");

  // Period filter: last 30 days keeps only the 10-day-old bill.
  await dialog.getByRole("combobox", { name: "Analysis period" }).click();
  await page.getByRole("option", { name: "Last 30 days" }).click();
  await expect(dialog.getByTestId("kpi-total-spent")).toContainText("₹3,000");
  await expect(dialog.getByTestId("kpi-bills")).toContainText("1");
  await dialog.getByRole("combobox", { name: "Analysis period" }).click();
  await page.getByRole("option", { name: "All time" }).click();
  await expect(dialog.getByTestId("kpi-total-spent")).toContainText("₹6,000");
  await page.screenshot({ path: testInfo.outputPath("customer-analysis.png") });

  // All transactions → the customer history dialog.
  await dialog.getByRole("button", { name: "All transactions" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("dialog").getByText("Customer account history and transactions")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Customer history" }).click();
  await expect(page.getByRole("dialog").getByText("Customer account history and transactions")).toBeVisible();
});
