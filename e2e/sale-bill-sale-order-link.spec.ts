import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Field Sales order not converted (some items not available): the shop makes a new sale bill
 * and picks the booked order in "Sale Order No.". On save the order is marked Invoiced with the
 * bill's number, and the Sale Order dashboard shows it in green.
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "MILAN SHOES", phone: "9820567827", opening_balance: 0, deleted_at: null };
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "MR50", brand: "A WALK", category: "SHOES", style: null, color: "BK",
  hsn_code: "6403", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "8", color: "BK", barcode: "200001",
  sale_price: 499, mrp: 699, pur_price: 300, stock_qty: 10, active: true, deleted_at: null, products: product,
};
const order = {
  id: "so-1", organization_id: E2E_ORG_ID, order_number: "SO/26-27/2017", order_date: "2026-11-25", customer_id: "cust-1",
  customer_name: "MILAN SHOES", customer_phone: "9820567827", net_amount: 18450, gross_amount: 18450, gst_amount: 0,
  salesman: "RAJU", status: "pending", deleted_at: null, created_at: "2026-11-25T09:00:00Z", sale_order_items: [],
};

test("Sale Bill: pick the sale order, save, the order becomes Invoiced", async ({ page, backend }) => {
  backend
    .addRows("customers", [customer])
    .addRows("products", [product])
    .addRows("product_variants", [variant])
    .addRows("employees", [{ id: "e1", organization_id: E2E_ORG_ID, employee_name: "RAJU", status: "active", deleted_at: null }])
    .addRows("sale_orders", [order]);
  backend.onRpc("save_sale_with_items_numbered", (args) => ({
    sale: { ...(args.p_sale as Record<string, unknown>), id: "sale-9", sale_number: "INV/26-27/88" },
    items_inserted: (args.p_items as unknown[]).length,
    settled: true,
  }));

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  // Always in the header row, next to Salesman (it was hidden until a customer was picked,
  // then dropped onto a second row); greyed out until the customer has an open order.
  const orderField = page.getByTestId("sale-bill-order-no");
  await expect(orderField).toBeVisible();
  await expect(orderField).toBeDisabled();
  await expect(orderField).toContainText("Select customer");
  const salesmanBox = page.locator("label", { hasText: /^Salesman$/ }).locator("xpath=following-sibling::*[1]");
  const [orderTop, salesmanTop] = await Promise.all([
    orderField.boundingBox().then((b) => Math.round(b!.y)),
    salesmanBox.boundingBox().then((b) => Math.round(b!.y)),
  ]);
  expect(orderTop).toBe(salesmanTop);

  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("MILAN");
  await page.getByRole("option", { name: /MILAN SHOES/ }).click();

  const orderBox = page.getByTestId("sale-bill-order-no");
  await expect(orderBox).toBeEnabled();
  await orderBox.click();
  await page.getByRole("option", { name: /SO\/26-27\/2017/ }).click();
  await expect(orderBox).toContainText("SO/26-27/2017");

  await scan.fill("200001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "200001" })).toHaveCount(1);
  await page.keyboard.press("Control+s");
  const saved = page.getByRole("alertdialog", { name: "Print Invoice?" });
  await expect(saved).toBeVisible();

  // The order was marked Invoiced with this bill.
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name === "sale_orders").map((c) => c.body))
    .toContainEqual(expect.objectContaining({ status: "invoiced", invoiced_sale_id: "sale-9", invoiced_sale_number: "INV/26-27/88" }));
  // The bill keeps the order's salesman.
  const [save] = backend.rpcCalls("save_sale_with_items_numbered") as Array<{ p_sale: Record<string, unknown> }>;
  expect(save.p_sale).toMatchObject({ salesman: "RAJU", customer_id: "cust-1" });
});

test("Sale Bill: with a sale order picked, ORDER QTY shows the order's quantity per line", async ({ page, backend }) => {
  backend
    .addRows("customers", [customer])
    .addRows("products", [product])
    .addRows("product_variants", [variant])
    .addRows("sale_orders", [order])
    .addRows("sale_order_items", [
      { id: "soi-1", order_id: "so-1", variant_id: "v1", product_id: "p1", barcode: "200001", size: "8", color: "BK", order_qty: 6, fulfilled_qty: 0, pending_qty: 6, deleted_at: null },
      { id: "soi-2", order_id: "so-1", variant_id: "v2", product_id: "p1", barcode: "200002", size: "9", color: "BK", order_qty: 4, fulfilled_qty: 0, pending_qty: 4, deleted_at: null },
    ]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  // No order picked: no ORDER QTY column.
  await expect(page.getByRole("columnheader", { name: /ORDER\s*QTY/ })).toHaveCount(0);

  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("MILAN");
  await page.getByRole("option", { name: /MILAN SHOES/ }).click();
  await page.getByTestId("sale-bill-order-no").click();
  await page.getByRole("option", { name: /SO\/26-27\/2017/ }).click();
  await expect(page.getByRole("columnheader", { name: /ORDER\s*QTY/ })).toBeVisible();

  await scan.fill("200001");
  await scan.press("Enter");
  const row = page.locator("tr", { hasText: "200001" });
  await expect(row).toHaveCount(1);
  const orderCell = row.getByTestId("sale-line-order-qty");
  await expect(orderCell).toContainText("6");
  await expect(orderCell).toContainText("5 short");
  // The ORDER QTY header sits right after QTY.
  const headers = (await page.locator("thead th").allInnerTexts()).map((h) => h.replace(/\s+/g, " ").trim());
  expect(headers[headers.indexOf("QTY") + 1]).toBe("ORDER QTY");
  // Total row: the whole order (6 + 4).
  await expect(page.getByTestId("sale-order-qty-total")).toHaveText("10");

  // Bill quantity raised to the order's: "matches"; above it: "extra".
  const qty = row.locator("input.sale-qty-box");
  await qty.fill("6");
  await qty.press("Tab");
  await expect(orderCell).toContainText("matches");
  await qty.fill("7");
  await qty.press("Tab");
  await expect(orderCell).toContainText("1 extra");
});

test("Sale Order dashboard: an invoiced order shows Invoiced in green with the bill number, no Convert", async ({ page, backend }) => {
  backend.addRows("sale_orders", [{ ...order, status: "invoiced", invoiced_sale_id: "sale-9", invoiced_sale_number: "INV/26-27/88" }]);
  await page.goto(`/${E2E_ORG_SLUG}/sale-order-dashboard`);
  const row = page.locator("tr", { hasText: "SO/26-27/2017" }).filter({ visible: true });
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(row.getByText("Invoiced", { exact: true })).toHaveClass(/bg-green-600/);
  await expect(row.getByTestId("sale-order-invoiced-bill")).toHaveText("INV/26-27/88");
  await expect(row.getByTitle("Convert to Sale Bill")).toHaveCount(0);
  await expect(row.getByTitle("Print Available Stock")).toHaveCount(0);
});

test("Field Sales: My Orders shows the order as Invoiced", async ({ page, backend }) => {
  const { E2E_USER_ID } = await import("./support/mockBackend");
  backend
    .addRows("employees", [{ id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "RAJU", field_sales_access: true, status: "active", deleted_at: null }])
    .addRows("sale_orders", [{ ...order, status: "invoiced", created_by: E2E_USER_ID, invoiced_sale_number: "INV/26-27/88" }]);
  await page.setViewportSize({ width: 360, height: 760 });
  await page.goto(`/${E2E_ORG_SLUG}/salesman/orders`);
  const badge = page.getByText("invoiced", { exact: true }).first();
  await expect(badge).toBeVisible({ timeout: 60_000 });
  await expect(badge).toHaveClass(/bg-green-600/);
});
