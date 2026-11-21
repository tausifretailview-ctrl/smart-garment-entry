import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Field Sales app on a 360px phone (salesman report, Nov 2026): the home title wrapped, the day's
 * value was cut off and the size-wise quantity dialog ran off the right edge, because the web
 * root font (19px, for desktop) was used on the phone. The app now runs at 16px, order booking
 * is a full-screen flow, and sizes are entered in a sheet with + / − per size.
 */
const iso = (minsAgo: number) => new Date(Date.now() - minsAgo * 60000).toISOString();
const customer = { id: "c1", organization_id: E2E_ORG_ID, customer_name: "SHREE GANESH GARMENTS", phone: "9822012345", address: "Laxmi Road", opening_balance: 0, deleted_at: null, status: "active" };
const order = {
  id: "o1", organization_id: E2E_ORG_ID, order_number: "SO/26-27/1975", customer_id: "c1", customer_name: "SHREE GANESH GARMENTS", customer_phone: "9822012345",
  net_amount: 94268.45, gross_amount: 94268.45, gst_amount: 0, status: "pending", created_by: E2E_USER_ID, order_date: iso(10), created_at: iso(10), deleted_at: null,
};
const product = { id: "p1", organization_id: E2E_ORG_ID, product_name: "PUL206", brand: "PUMA STYLE", category: "FOOTWEAR", style: null, color: null, gst_per: 5, size_group_id: null, image_url: null, product_type: "goods", status: "active", deleted_at: null, default_sale_price: 499 };
const stock: Record<string, number[]> = { BK: [4, 37, 42, 31, 20, 4, 0], PISTA: [12, 8, 0, 15, 22, 6, 3] };
const variants = Object.entries(stock).flatMap(([color, qtys]) =>
  qtys.map((q, i) => ({
    id: `v-${color}-${i + 3}`, product_id: "p1", organization_id: E2E_ORG_ID, size: String(i + 3), color, barcode: `1000${color.length}${i}`,
    sale_price: 499, mrp: 699, pur_price: 300, stock_qty: q, active: true, deleted_at: null, products: product,
  })),
);

test.use({ viewport: { width: 360, height: 760 } });

test("Field Sales on a phone: book a size-wise order", async ({ page, backend }) => {
  backend
    .addRows("employees", [{ id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "JAVED BHAI", field_sales_access: true, status: "active", deleted_at: null }])
    .addRows("customers", [customer]).addRows("sale_orders", [order]).addRows("sale_order_items", [])
    .addRows("products", [product]).addRows("product_variants", variants);
  backend.onRpc("peek_sale_order_number", () => "SO/26-27/1976");
  backend.onRpc("generate_sale_order_number", () => "SO/26-27/1976");

  await page.goto(`/${E2E_ORG_SLUG}/salesman`);
  await expect(page.getByTestId("fs-home")).toBeVisible({ timeout: 60_000 });

  // Phone text size, and nothing wider than the screen.
  const noSidewaysScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("16px");
  expect(await noSidewaysScroll()).toBe(true);
  // The day's value is shown in full (it was cut off at "₹94,268.4").
  const value = page.getByTestId("fs-today-value");
  await expect(value).toHaveText("₹94,268.45");
  const card = (await page.getByTestId("fs-today-card").boundingBox())!;
  const valueBox = (await value.boundingBox())!;
  expect(valueBox.x + valueBox.width).toBeLessThanOrEqual(card.x + card.width);

  // New order is a full-screen flow: no bottom navigation behind the Save bar.
  await page.getByTestId("fs-nav-new-order").click();
  await expect(page.getByTestId("fs-order-entry")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Field Sales" })).toHaveCount(0);

  await page.getByTestId("fs-customer-card").click();
  const customers = page.getByTestId("fs-customer-sheet");
  await customers.getByPlaceholder("Name or phone number").fill("GAN");
  await customers.getByText("SHREE GANESH GARMENTS").click();
  await expect(page.getByTestId("fs-customer-card")).toContainText("SHREE GANESH GARMENTS");

  await page.getByTestId("fs-product-search").fill("PUL");
  await page.getByTestId("fs-product-results").getByText("PUL206").click();

  // Size sheet: every colour card and size box is inside the screen.
  const sheet = page.getByTestId("size-qty-sheet");
  await expect(sheet.getByTestId("size-box")).toHaveCount(14);
  for (const box of await sheet.getByTestId("size-colour-card").all()) {
    const b = (await box.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(360);
  }
  expect(await noSidewaysScroll()).toBe(true);
  await expect(sheet.getByTestId("size-confirm")).toBeDisabled();

  // + / − per size, typing, and a set of every size.
  await sheet.getByRole("button", { name: "More BK size 4" }).click();
  await sheet.getByRole("button", { name: "More BK size 4" }).click();
  await sheet.getByRole("button", { name: "Less BK size 4" }).click();
  await sheet.getByLabel("Quantity BK size 5").fill("12");
  await sheet.getByTestId("size-colour-card").filter({ hasText: "PISTA" }).getByRole("button", { name: "+1 each size" }).click();
  await expect(sheet.getByTestId("size-total-qty")).toHaveText("20 pcs"); // 1 + 12 + 7
  await sheet.getByTestId("size-confirm").click();

  const group = page.getByTestId("fs-order-group");
  await expect(group).toContainText("PUL206");
  await expect(group).toContainText("20 pcs · ₹9,980");
  await expect(page.getByTestId("fs-order-total")).toHaveText("₹9,980");

  // Edit sizes reopens the sheet with the quantities filled in, and Update replaces them.
  await group.getByRole("button", { name: "Edit sizes" }).click();
  await expect(sheet.getByTestId("size-total-qty")).toHaveText("20 pcs");
  await expect(sheet.getByLabel("Quantity BK size 5")).toHaveValue("12");
  await sheet.getByLabel("Quantity BK size 5").fill("2");
  await expect(sheet.getByTestId("size-confirm")).toHaveText("Update order");
  await sheet.getByTestId("size-confirm").click();
  await expect(group).toContainText("10 pcs · ₹4,990");
  await expect(page.getByTestId("fs-order-total")).toHaveText("₹4,990");

  // Save: one order, one line per size with its quantity.
  await page.getByTestId("fs-order-footer").getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "sale_order_items").length).toBe(1);
  const lines = backend.calls.find((c) => c.kind === "insert" && c.name === "sale_order_items")!.body as Array<Record<string, unknown>>;
  expect(lines).toHaveLength(9); // BK 4, BK 5, PISTA 3–9
  const qty = (color: string, size: string) => lines.find((l) => l.color === color && l.size === size)?.order_qty;
  expect(qty("BK", "4")).toBe(1);
  expect(qty("BK", "5")).toBe(2);
  expect(qty("PISTA", "7")).toBe(1);
  expect(lines.reduce((sum, l) => sum + Number(l.order_qty), 0)).toBe(10);
});
