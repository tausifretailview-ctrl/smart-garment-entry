import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";
import { pdfTextWithPositions } from "./support/pdfText";

/**
 * Swamini Sarees (Nov 2026): A4 65-label sheet (38.1×21.2mm, 5×13) printed out of line. The
 * die-cut has 2.5mm between columns and none between rows, but a preset had one gap for both.
 * A custom preset can now set the row gap on its own: label k sits at
 * left 4.75 + col × 40.6mm, top 10.7 + row × 21.2mm.
 */
const MM = 72 / 25.4;
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "PRINTED", brand: "", category: "SAREE", style: null,
  color: null, hsn_code: "5407", gst_per: 0, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variants = [{
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "FREE", color: null,
  barcode: "860001044", sale_price: 999, mrp: 999, pur_price: 500, stock_qty: 65, active: true,
  deleted_at: null, products: product,
}];

test("65-label sheet: columns 40.6mm apart, rows 21.2mm apart, grid on the die-cut", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", variants).addRows("barcode_label_settings", [
    {
      id: "s1", organization_id: E2E_ORG_ID, setting_type: "sheet_preset", setting_name: "65 LABEL 38.1x21.2",
      setting_data: { width: 38.1, height: 21.2, cols: 5, rows: 13, gap: 2.5, rowGap: 0, scale: 100 },
    },
    {
      id: "s2", organization_id: E2E_ORG_ID, setting_type: "default_format", setting_name: "default",
      setting_data: { sheetType: "custom", customPresetName: "65 LABEL 38.1x21.2", printScale: 100, topOffset: 0, leftOffset: 0, bottomOffset: 0, rightOffset: 0 },
    },
  ]);
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    window.open = ((url?: string | URL) => (w.__opened.push(String(url)), {} as Window)) as typeof window.open;
  });

  await page.goto(`/${E2E_ORG_SLUG}/barcode-printing`);
  const layout = page.getByRole("button", { name: /Layout & Style/ });
  await expect(layout).toBeVisible({ timeout: 60_000 });
  if ((await layout.getAttribute("aria-expanded")) !== "true") await layout.click();
  const sheetType = page.getByRole("tabpanel", { name: "Standard" }).getByRole("combobox").first();
  await sheetType.click();
  await page.getByRole("option", { name: /65 LABEL 38\.1x21\.2/ }).click();
  await expect(page.getByLabel("Gap between rows (mm)")).toHaveValue("0");
  await expect(page.getByLabel("Gap between columns (mm)")).toHaveValue("2.5");
  await expect(page.getByTestId("sheet-too-big")).toHaveCount(0);

  // One gap for both (row gap blank): 13 × 21.2 + 12 × 2.5 = 305.6mm, taller than A4 — warned.
  const rowGap = page.getByLabel("Gap between rows (mm)");
  await rowGap.fill("");
  await expect(page.getByTestId("sheet-too-big")).toContainText("305.6mm — taller than A4 (297mm)");
  await rowGap.fill("0");
  await expect(page.getByTestId("sheet-too-big")).toHaveCount(0);

  const search = page.getByRole("combobox").filter({ hasText: /Search product, brand, size, or barcode/ });
  await search.click();
  await page.getByPlaceholder("Type to search...").fill("860001044");
  await page.getByRole("option").filter({ hasText: "PRINTED" }).first().click();
  // A full sheet: 65 labels, drawn in label order.
  const qty = page.locator("tr", { hasText: "860001044" }).locator("input");
  await qty.fill("65");
  await qty.press("Tab");
  await expect(page.getByText(/Labels:\s*65/)).toBeVisible();

  await page.locator(".barcode-print-footer-btn", { hasText: /^Print$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(1);
  const pdf = Buffer.from(
    await page.evaluate(async () => {
      const url = (window as unknown as { __opened: string[] }).__opened[0];
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return btoa(s);
    }),
    "base64",
  );

  const codes = pdfTextWithPositions(pdf).filter((t) => t.text === "860001044");
  expect(codes).toHaveLength(65);
  // Label k (0-based) → column k % 5, row ⌊k / 5⌋: same spot inside every label.
  const at = (k: number) => codes[k];
  const dx = (at(1).x - at(0).x) / MM;
  const dy = (at(0).y - at(5).y) / MM;
  expect(dx).toBeCloseTo(40.6, 1); // 38.1 label + 2.5 column gap
  expect(dy).toBeCloseTo(21.2, 1); // rows touch
  expect((at(4).x - at(0).x) / MM).toBeCloseTo(4 * 40.6, 1);
  expect((at(0).y - at(60).y) / MM).toBeCloseTo(12 * 21.2, 1);
  // Grid on the die-cut: 4.75mm from the left edge, 10.7mm from the top.
  const xInLabel = at(0).x / MM - 4.75;
  expect(xInLabel).toBeGreaterThanOrEqual(0);
  expect(xInLabel).toBeLessThan(38.1);
  const yFromTop = 297 - at(0).y / MM - 10.7;
  expect(yFromTop).toBeGreaterThan(0);
  expect(yFromTop).toBeLessThan(21.2);
});
