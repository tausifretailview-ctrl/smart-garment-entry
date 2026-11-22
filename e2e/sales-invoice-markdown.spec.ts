import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Wholesale markdown: sale price 1800 stays the list price, the brand's markdown (ACME 25%) comes
 * off on the Sale Bill → 1350, and an extra Disc 5% comes off that → 1282.50. A product's own
 * markdown (30%) wins over its brand's. Saved: unit_price 1800, markdown_percent 25 and the whole
 * line discount (28.75%) in discount_percent, so reports and prints stay right.
 */
const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", opening_balance: 0, deleted_at: null };
const product = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, organization_id: E2E_ORG_ID, product_name: name, brand: "ACME", category: "SAREE", style: null, color: null,
  hsn_code: "5407", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null, ...extra,
});
const saree = product("p1", "PRINTED SAREE");
const silk = product("p2", "SILK SAREE", { markdown_percent: 30 });
const variant = (id: string, p: ReturnType<typeof product>, barcode: string) => ({
  id, product_id: p.id, organization_id: E2E_ORG_ID, size: "FREE", color: null, barcode,
  sale_price: 1800, mrp: 1800, pur_price: 1000, stock_qty: 10, active: true, deleted_at: null, products: p,
});

test("Sale Bill: brand markdown 25% → 1350, extra 5% → 1282.50; product markdown wins", async ({ page, backend }) => {
  backend
    .addRows("customers", [customer])
    .addRows("products", [saree, silk])
    .addRows("product_variants", [variant("v1", saree, "200001"), variant("v2", silk, "200002")])
    .addRows("brand_markdowns", [{ id: "bm1", organization_id: E2E_ORG_ID, brand: "Acme", markdown_percent: 25 }]);
  backend.onRpc("save_sale_with_items_numbered", (args) => ({
    sale: { ...(args.p_sale as Record<string, unknown>), id: "sale-1", sale_number: "INV/26-27/1" },
    items_inserted: (args.p_items as unknown[]).length,
    settled: true,
  }));

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();

  await expect(page.getByRole("columnheader", { name: "MKDN%" })).toBeVisible();
  await scan.fill("200001");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "200001" });
  await expect(line.getByLabel(/Markdown % for/)).toHaveValue("25");
  await expect(line.getByTestId("sale-line-after-markdown")).toHaveText("→ ₹1,350");
  await expect(line).toContainText("₹1350.00"); // line total

  // Extra discount on top of the markdown.
  // Disc % is the cell right after Markdown.
  const disc = line.getByTestId("sale-line-markdown").locator("xpath=following-sibling::td[1]//input");
  await disc.fill("5");
  await disc.press("Tab");
  await expect(line).toContainText("₹1282.50");

  // Product's own markdown (30%) wins over the brand's 25%.
  await scan.fill("200002");
  await scan.press("Enter");
  const silkLine = page.locator("tr", { hasText: "200002" });
  await expect(silkLine.getByLabel(/Markdown % for/)).toHaveValue("30");
  await expect(silkLine.getByTestId("sale-line-after-markdown")).toHaveText("→ ₹1,260");

  await page.keyboard.press("Control+s");
  await expect(page.getByRole("alertdialog", { name: "Print Invoice?" })).toBeVisible();
  const [save] = backend.rpcCalls("save_sale_with_items_numbered") as Array<{ p_sale: Record<string, unknown>; p_items: Record<string, unknown>[] }>;
  const byVariant = Object.fromEntries(save.p_items.map((i) => [i.variant_id, i]));
  expect(byVariant.v1).toMatchObject({ unit_price: 1800, markdown_percent: 25, discount_percent: 28.75, line_total: 1282.5 });
  expect(byVariant.v2).toMatchObject({ unit_price: 1800, markdown_percent: 30, discount_percent: 30, line_total: 1260 });
  // Gross stays the list price; the header discount includes the markdown.
  expect(save.p_sale).toMatchObject({ gross_amount: 3600, discount_amount: 1057.5 });
});

test("Sale Bill edit: a saved markdown line opens as Markdown 25% + Disc 5% again", async ({ page, backend }) => {
  backend
    .addRows("customers", [customer])
    .addRows("products", [saree])
    .addRows("product_variants", [variant("v1", saree, "200001")])
    .addRows("sales", [
      {
        id: "sale-9", organization_id: E2E_ORG_ID, sale_number: "INV/26-27/9", sale_type: "invoice", sale_date: new Date().toISOString(),
        customer_id: "cust-1", customer_name: "RAVI KUMAR", gross_amount: 1800, discount_amount: 517.5, flat_discount_amount: 0,
        flat_discount_percent: 0, other_charges: 0, round_off: 0.5, net_amount: 1283, paid_amount: 0, payment_status: "pending",
        payment_method: "pay_later", deleted_at: null, is_cancelled: false,
        sale_items: [
          {
            id: "si-1", sale_id: "sale-9", product_id: "p1", variant_id: "v1", product_name: "PRINTED SAREE", size: "FREE",
            barcode: "200001", color: null, quantity: 1, unit_price: 1800, mrp: 1800, discount_percent: 28.75,
            markdown_percent: 25, gst_percent: 5, line_total: 1282.5, hsn_code: "5407", discount_share: 0, deleted_at: null,
          },
        ],
      },
    ]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  await page.waitForLoadState("networkidle");
  await page.evaluate((url) => {
    window.history.pushState({ usr: { editInvoiceId: "sale-9" }, key: "e2e", idx: 1 }, "", url);
    window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
  }, `/${E2E_ORG_SLUG}/sales-invoice`);

  const line = page.locator("tr", { hasText: "200001" });
  await expect(line).toHaveCount(1, { timeout: 60_000 });
  await expect(line.getByLabel(/Markdown % for/)).toHaveValue("25");
  await expect(line.getByTestId("sale-line-markdown").locator("xpath=following-sibling::td[1]//input")).toHaveValue("5");
  await expect(line).toContainText("₹1282.50");

  // Saving the edit: lines and header go to the database in ONE call (all or nothing), never
  // as separate delete / insert / update requests from the browser.
  backend.onRpc("save_document_with_lines", (body) => ({
    success: true,
    lines_deleted: 1,
    lines_inserted: 1,
    header: { id: "sale-9", ...(body.p_header as Record<string, unknown>) },
  }));
  await page.keyboard.press("Control+s");
  await expect.poll(() => backend.rpcCalls("save_document_with_lines").length, { timeout: 30_000 }).toBe(1);
  const [edit] = backend.rpcCalls("save_document_with_lines") as Array<{
    p_kind: string;
    p_document_id: string;
    p_header: Record<string, unknown>;
    p_lines: Record<string, unknown>[];
  }>;
  expect(edit.p_kind).toBe("sale");
  expect(edit.p_document_id).toBe("sale-9");
  // The header keeps the markdown in its discount: same total as the line (it was saved as
  // discount 90 / net 1711 when the opened bill was saved without touching the line).
  expect(edit.p_header).toMatchObject({ gross_amount: 1800, discount_amount: 517.5, net_amount: 1283, customer_id: "cust-1" });
  expect(edit.p_lines).toHaveLength(1);
  expect(edit.p_lines[0]).toMatchObject({ variant_id: "v1", quantity: 1, markdown_percent: 25, line_total: 1282.5 });
  expect(backend.calls.filter((c) => c.name === "sale_items" && c.kind !== "rpc")).toEqual([]);
  expect(backend.calls.filter((c) => c.name === "sales" && c.kind === "update" && "net_amount" in ((c.body ?? {}) as object))).toEqual([]);
});
