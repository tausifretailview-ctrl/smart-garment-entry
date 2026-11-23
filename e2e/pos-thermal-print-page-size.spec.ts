import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Trendzo POS (Nov 2026): thermal receipts sometimes printed tiny. The receipt page style said
 * `@page { size: 80mm auto }`, which is invalid CSS, so Chrome laid the receipt out on whatever
 * paper was selected (A4 → the receipt shrunk onto the roll). The print now gets a real page
 * size: roll width × receipt height.
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "JEANS NARROW", brand: "ACME", category: "JEANS", style: null,
  color: "BLUE", hsn_code: "6203", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "32", color: "BLUE", barcode: "100001",
  sale_price: 849, mrp: 849, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

/** Save a bill, print it from the preview, and return what the print frame had. */
async function printReceipt(page: import("@playwright/test").Page) {
  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);
  await page.keyboard.press("F1");
  const saved = page.getByRole("alertdialog", { name: "Invoice Saved!" });
  await expect(saved).toBeVisible();
  await saved.getByRole("button", { name: "Print" }).click();
  const preview = page.getByRole("dialog", { name: "Print Preview" });
  await expect(preview).toBeVisible();
  await preview.getByRole("button", { name: "Print", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed?: unknown[] }).__printed?.length ?? 0), { timeout: 20_000 }).toBe(1);
  const [printed] = (await page.evaluate(() => (window as unknown as { __printed: unknown[] }).__printed)) as Array<{
    rule: string | null; receipt: boolean; top: boolean;
  }>;
  return printed;
}

/**
 * Chirag Men's Wear (23 Nov 2026): with the page sized to the receipt, Chrome centred the
 * shorter page on the printer's roll paper and left a gap above the receipt. By default the
 * page has no set size, so the printer's own paper is used and the receipt starts at the top.
 */
test("by default the POS thermal receipt uses the printer's paper (no page size set)", async ({ page, backend }) => {
  await page.addInitScript(() => {
    window.print = () => {
      const rule = document.getElementById("ezzy-thermal-page-size")?.textContent ?? null;
      const receipt = !!document.querySelector(".thermal-print-80mm, .thermal-receipt-container, .modern-thermal-receipt");
      (window.top as unknown as { __printed?: unknown[] }).__printed ??= [];
      (window.top as unknown as { __printed: unknown[] }).__printed.push({ rule, receipt, top: window === window.top });
    };
  });
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    const sale = args.p_sale as Record<string, unknown>;
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/251" }, items_inserted: 1, settled: true };
  });
  const printed = await printReceipt(page);
  expect(printed.top).toBe(false);
  expect(printed.receipt).toBe(true);
  expect(printed.rule).toBeNull();
});

test("POS thermal receipt prints on an 80mm page sized to the receipt when this computer chose it", async ({ page, backend }) => {
  // Settings → POS print → "Size the print page to the receipt (this computer)".
  await page.addInitScript(() => localStorage.setItem("ezzy_thermal_fit_page_to_receipt", "1"));
  // Record what the print iframe would send to the printer instead of opening the dialog.
  await page.addInitScript(() => {
    window.print = () => {
      const rule = document.getElementById("ezzy-thermal-page-size")?.textContent ?? null;
      const receipt = !!document.querySelector(".thermal-print-80mm, .thermal-receipt-container, .modern-thermal-receipt");
      (window.top as unknown as { __printed?: unknown[] }).__printed ??= [];
      (window.top as unknown as { __printed: unknown[] }).__printed.push({ rule, receipt, top: window === window.top });
    };
  });
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  backend.onRpc("save_sale_with_items_numbered", (args) => {
    const sale = args.p_sale as Record<string, unknown>;
    return { sale: { ...sale, id: "sale-1", sale_number: "POS/26-27/251" }, items_inserted: 1, settled: true };
  });

  const printed = await printReceipt(page);
  expect(printed.top).toBe(false); // printed from the react-to-print frame
  expect(printed.receipt).toBe(true);
  const m = /@page \{ size: 80mm (\d+)mm; \}/.exec(printed.rule ?? "");
  expect(m, `page rule: ${printed.rule}`).not.toBeNull();
  const heightMm = Number(m![1]);
  expect(heightMm).toBeGreaterThan(60);
  expect(heightMm).toBeLessThan(400);
});
