import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Barcode Printing, Precision Pro (thermal roll): the hidden print copy of the labels is drawn
 * only while a print is being prepared (speed review item S7). It used to hold one label per
 * copy at all times, so a large purchase bill (2,000 labels) froze the page and made each
 * quantity typed slow. The print itself must still carry every label.
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 1299, pur_price: 500, stock_qty: 300, active: true, deleted_at: null, products: product,
};

test("precision labels are not kept on the page; Print still carries every one", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  backend.tables.settings[0].bill_barcode_settings = { precision_pro_enabled: true, precision_print_mode: "thermal" };
  await page.addInitScript(() => {
    const w = window as unknown as { __printDocs: string[] };
    w.__printDocs = [];
    window.open = (() => {
      let html = "";
      return {
        document: { write: (s: string) => { html += s; }, close: () => { w.__printDocs.push(html); } },
        focus: () => undefined,
        print: () => undefined,
        close: () => undefined,
      } as unknown as Window;
    }) as typeof window.open;
  });

  await page.goto(`/${E2E_ORG_SLUG}/barcode-printing`);
  const search = page.getByRole("combobox").filter({ hasText: /Search product, brand, size, or barcode/ });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.click();
  await page.getByPlaceholder("Type to search...").fill("100001");
  await page.getByRole("option").filter({ hasText: "COTTON SHIRT" }).first().click();

  const qty = page.locator("tr", { hasText: "100001" }).locator("input").first();
  await qty.fill("250");
  await qty.press("Tab");
  await expect(page.getByText(/Labels:\s*250/)).toBeVisible();
  await page.waitForTimeout(500);

  // Nothing of the print copy is on the page while the cashier is working.
  await expect(page.getByTestId("precision-print-area")).toHaveCount(0);
  expect(await page.locator(".precision-thermal-page").count()).toBe(0);

  await page.locator(".barcode-print-footer-btn", { hasText: /^Print$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printDocs: string[] }).__printDocs.length), { timeout: 30_000 }).toBe(1);
  const doc = await page.evaluate(() => (window as unknown as { __printDocs: string[] }).__printDocs[0]);
  // One page per label on a 1-up roll.
  expect(doc.match(/class="precision-thermal-page/g)?.length).toBe(250);
  expect(doc).toContain("100001");

  // And the copy is gone again once the print is sent.
  await expect(page.getByTestId("precision-print-area")).toHaveCount(0);
});
