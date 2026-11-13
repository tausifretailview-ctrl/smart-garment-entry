import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";
import { pdfTextItems } from "./support/pdfText";

/**
 * Core flow 5 of 6 (Plan Phase 4, R2): Barcode Printing — search a product, set 3 labels,
 * Print. On the default A4 sheet the page builds the label sheet as a PDF and opens it in a
 * new tab (the browser's own print would rescale and break die-cut alignment). The test
 * catches that PDF and checks it holds exactly 3 labels with the name, price and barcode.
 */

const product = {
  id: "p1",
  organization_id: E2E_ORG_ID,
  product_name: "COTTON SHIRT",
  brand: "ACME",
  category: "SHIRTS",
  style: null,
  color: "BLUE",
  hsn_code: "6205",
  gst_per: 5,
  uom: "NOS",
  product_type: "goods",
  status: "active",
  deleted_at: null,
};
const variant = {
  id: "v1",
  product_id: "p1",
  organization_id: E2E_ORG_ID,
  size: "M",
  color: "BLUE",
  barcode: "100001",
  sale_price: 999,
  mrp: 1299,
  pur_price: 500,
  stock_qty: 3,
  active: true,
  deleted_at: null,
  products: product,
};

test("Barcode printing: search a product, 3 labels, Print → label sheet PDF", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  // Catch the preview tab instead of opening it; window.print must not be used for A4.
  await page.addInitScript(() => {
    const w = window as unknown as { __opened: string[]; __printed: number };
    w.__opened = [];
    w.__printed = 0;
    window.open = ((url?: string | URL) => {
      w.__opened.push(String(url));
      return {} as Window;
    }) as typeof window.open;
    window.print = () => {
      w.__printed += 1;
    };
  });

  await page.goto(`/${E2E_ORG_SLUG}/barcode-printing`);
  const search = page.getByRole("combobox").filter({ hasText: /Search product, brand, size, or barcode/ });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.click();
  await page.getByPlaceholder("Type to search...").fill("100001");
  await page.getByRole("option").filter({ hasText: "COTTON SHIRT" }).first().click();

  const row = page.locator("tr", { hasText: "100001" });
  await expect(row).toContainText("COTTON SHIRT");
  await expect(row).toContainText("₹999");
  const qty = row.locator("input");
  await qty.fill("3");
  await qty.press("Tab");
  await expect(page.getByText(/Labels:\s*3/)).toBeVisible();

  await page.locator(".barcode-print-footer-btn", { hasText: /^Print$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened.length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(0);

  const pdfBase64 = await page.evaluate(async () => {
    const url = (window as unknown as { __opened: string[] }).__opened[0];
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  const pdf = Buffer.from(pdfBase64, "base64");
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

  const text = pdfTextItems(pdf);
  expect(text.filter((t) => t === "100001")).toHaveLength(3); // one barcode number per label
  expect(text.filter((t) => t.includes("COTTON SHIRT"))).toHaveLength(3);
  expect(text.filter((t) => t.includes("999"))).toHaveLength(3);
});
