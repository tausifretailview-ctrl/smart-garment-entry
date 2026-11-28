import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Long POS bills (supermarket go-live, Nov 2026): the POS drew an off-screen copy of the
 * printed bill for the live cart and redrew it, with every line, on each scan and keystroke —
 * an 80-line bill took ~1.4 s a scan on a slow PC (4× CPU slowdown, production build) and
 * 0.2 s after. Only a saved bill or an estimate is ever printed, so the copy is drawn then.
 */
const N = 40;
const products = Array.from({ length: N }, (_, i) => ({
  id: `p${i}`, organization_id: E2E_ORG_ID, product_name: `ITEM ${i}`, brand: "B", category: "C", style: null, color: null,
  hsn_code: "1905", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
}));
const variants = products.map((p, i) => ({
  id: `v${i}`, product_id: p.id, organization_id: E2E_ORG_ID, size: "None", color: null, barcode: String(890000000000 + i),
  sale_price: 10 + i, mrp: 10 + i, pur_price: 5, stock_qty: 100, active: true, deleted_at: null, products: p,
}));

test("POS: no print copy of the live cart; a long bill still saves and prints", async ({ page, backend }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    window.print = () => {
      (window.top as unknown as { __printedRows?: number[] }).__printedRows ??= [];
      (window.top as unknown as { __printedRows: number[] }).__printedRows.push(
        document.querySelectorAll(".invoice-print-source").length,
      );
    };
  });
  backend.addRows("products", products).addRows("product_variants", variants);
  backend.onRpc("save_sale_with_items_numbered", (args) => ({
    sale: { ...(args.p_sale as Record<string, unknown>), id: "sale-1", sale_number: "POS/26-27/900" },
    items_inserted: (args.p_items as unknown[]).length,
    settled: true,
  }));

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  for (let i = 0; i < N; i++) {
    await scan.fill(String(890000000000 + i));
    await scan.press("Enter");
    await expect(page.locator("[data-pos-cart-row]").filter({ visible: true })).toHaveCount(i + 1);
  }
  // The cart has 40 lines and no off-screen bill copy is drawn for it.
  await expect(page.locator(".invoice-print-source")).toHaveCount(0);

  await page.keyboard.press("F1");
  const saved = page.getByRole("alertdialog", { name: "Invoice Saved!" });
  await expect(saved).toBeVisible();
  const [save] = backend.rpcCalls("save_sale_with_items_numbered") as Array<{ p_items: unknown[] }>;
  expect(save.p_items).toHaveLength(N);

  // Print the saved bill: the copy is drawn now, with every line.
  await saved.getByRole("button", { name: "Print" }).click();
  const preview = page.getByRole("dialog", { name: "Print Preview" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printedRows?: number[] }).__printedRows?.length ?? 0)).toBe(1);
});
