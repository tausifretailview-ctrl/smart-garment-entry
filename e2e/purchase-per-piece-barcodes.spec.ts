import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Settings > Purchase "Individual barcode for every piece": 65 pieces of one size entered in
 * the size grid. Before: 4–6 requests per piece, one after another (about a minute), lines
 * appearing on the bill one by one. Now: one barcode request and one insert for the size,
 * and all 65 lines land together.
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "PRINTED-SUNDA-SAREE", brand: "", category: "SAREE", style: null,
  color: null, hsn_code: "5407", gst_per: 0, purchase_gst_percent: 0, uom: "NOS", product_type: "goods", status: "active",
  default_pur_price: 550, default_sale_price: 999, size_group_id: null, deleted_at: null,
};
const sizeRow = (id: string, size: string, barcode: string) => ({
  id, product_id: "p1", organization_id: E2E_ORG_ID, size, color: null, barcode,
  barcode_source: "generated", sale_price: 999, mrp: 0, pur_price: 550, stock_qty: 0, active: true, deleted_at: null,
  products: product,
});
// Size M was bought before (stock 5), so only size S's SKU is an unused leftover.
const variants = [sizeRow("v1", "S", "860001044"), { ...sizeRow("v2", "M", "860001043"), stock_qty: 5 }];

test("65 pieces with individual barcodes: one barcode request, one insert, all lines at once", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", variants);
  backend.tables.settings[0].purchase_settings = { per_piece_barcode: true };
  let next = 860001045;
  backend.onRpc("generate_next_barcodes", (args) =>
    Array.from({ length: Number(args.p_count) }, () => String(next++)),
  );
  backend.onRpc("generate_next_barcode", () => String(next++));

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  const search = page.getByPlaceholder(/SEARCH BY NAME, BRAND/i).filter({ visible: true });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.fill("SAREE");
  await page.getByText("PRINTED-SUNDA-SAREE").filter({ visible: true }).first().click();

  const qty = page.locator('input[data-size-qty="1"]').filter({ visible: true }).first();
  await expect(qty).toBeVisible({ timeout: 30_000 });
  const before = backend.calls.length;
  await qty.fill("65");
  await page.getByRole("button", { name: /Confirm \(Enter\)|Add to Bill/ }).filter({ visible: true }).first().click();

  const rows = page.locator("tr.purchase-bill-line-row");
  await expect(rows).toHaveCount(65, { timeout: 30_000 });
  await expect(page.getByText("65 pieces added, each with its own barcode.").first()).toBeVisible();

  const calls = backend.calls.slice(before);
  const barcodeRpcs = calls.filter((c) => c.kind === "rpc" && /^generate_next_barcode/.test(c.name));
  expect(barcodeRpcs.map((c) => c.name)).toEqual(["generate_next_barcodes"]);
  expect(barcodeRpcs[0].body).toMatchObject({ p_count: 64 }); // piece 1 reuses the unused SKU
  const variantInserts = calls.filter((c) => c.kind === "insert" && c.name === "product_variants");
  expect(variantInserts).toHaveLength(1);
  expect((variantInserts[0].body as unknown[]).length).toBe(64);

  // Every line has its own barcode, in series order.
  const codes = await rows.locator("td").filter({ hasText: /^86000\d{4}$/ }).allInnerTexts();
  expect(new Set(codes.map((c) => c.trim())).size).toBe(65);
  await expect(rows.first()).toContainText("860001044");
  await expect(rows.nth(1)).toContainText("860001045");
  await expect(rows.last()).toContainText("860001108");
});
