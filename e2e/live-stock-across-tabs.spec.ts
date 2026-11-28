import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Live stock across browser tabs (Nov 2026): a shop bills in two tabs. A sale saved in one tab
 * must show on the other tab's stock at once, without refreshing the page (before, the other
 * tab's Sale Bill only caught up on its 20 s timer, and stock reports never did).
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "JEANS NARROW", brand: "ACME", category: "JEANS", style: null,
  color: "BLUE", hsn_code: "6203", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "32", color: "BLUE", barcode: "100001",
  sale_price: 849, mrp: 849, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

test("a POS sale in one tab updates the Sale Bill stock in the other tab without a refresh", async ({ page, backend, baseURL }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    // The server takes the sold pieces off stock.
    for (const item of args.p_items as Array<{ variant_id: string; quantity: number }>) {
      const row = backend.tables.product_variants.find((v) => v.id === item.variant_id);
      if (row) row.stock_qty = Number(row.stock_qty) - Number(item.quantity);
    }
    const sale = args.p_sale as Record<string, unknown>;
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/251" }, items_inserted: 1, settled: true };
  });

  // Tab 1: Sale Bill with the jeans on it.
  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await scan.fill("100001");
  await scan.press("Enter");
  const badge = page.locator("tr", { hasText: "100001" }).locator(".sale-line-stock").first();
  await expect(badge).toBeVisible();
  const before = (await badge.textContent())?.trim();
  expect(before).toMatch(/Stock 10 · 9 left/);

  // Tab 2 (same browser): POS sells one.
  const pos = await page.context().newPage();
  await backend.install(pos, baseURL ?? "http://127.0.0.1");
  await pos.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const posScan = pos.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(posScan).toBeVisible({ timeout: 60_000 });
  await posScan.fill("100001");
  await posScan.press("Enter");
  await expect(pos.locator("[data-pos-cart-row]", { hasText: "100001" }).filter({ visible: true })).toHaveCount(1);
  await pos.keyboard.press("F1");
  await expect(pos.getByRole("alertdialog", { name: "Invoice Saved!" })).toBeVisible();
  expect(backend.tables.product_variants[0].stock_qty).toBe(9);

  // Tab 1 follows well before its own 20 s timer.
  await expect(badge).not.toHaveText(before!, { timeout: 8_000 });
  await expect(badge).toHaveText(/Stock 9 · 8 left/);
});
