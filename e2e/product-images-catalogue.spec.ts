import { readFileSync } from "node:fs";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Product photos (Nov 2026): Quick Stock shows a Photo column only when a product has a photo,
 * and the Product Catalogue page sends customers a PDF with photo, sizes and price.
 */
// A 2×2 red PNG — data URLs need no network, so the PDF really embeds it.
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==";

const product = (id: string, name: string, image_url: string | null) => ({
  id, organization_id: E2E_ORG_ID, product_name: name, brand: "AURA", category: "KURTA", style: null, color: null,
  image_url, default_sale_price: 999, product_type: "goods", status: "active", deleted_at: null,
});
const variant = (id: string, p: ReturnType<typeof product>, size: string, stock: number, sale: number) => ({
  id, product_id: p.id, organization_id: E2E_ORG_ID, size, color: "RED", barcode: `B${id}`, sale_price: sale, mrp: 1500,
  pur_price: 500, stock_qty: stock, active: true, deleted_at: null, products: p,
});

test("Product Catalogue lists products with photos and downloads a PDF", async ({ page, backend }, testInfo) => {
  const withPhoto = product("p1", "SILK KURTA", PHOTO);
  const noPhoto = product("p2", "PLAIN KURTA", null);
  backend
    .addRows("products", [withPhoto, noPhoto])
    .addRows("product_variants", [
      variant("v1", withPhoto, "XL", 2, 1200),
      variant("v2", withPhoto, "M", 3, 1100),
      variant("v3", withPhoto, "S", 0, 1100),
      variant("v4", noPhoto, "M", 4, 800),
    ])
    .addRows("product_images", []);

  await page.goto(`/${E2E_ORG_SLUG}/product-catalogue`);
  await expect(page.getByRole("heading", { name: /Product Catalogue/ })).toBeVisible({ timeout: 60_000 });
  // "Only with photo" is on by default: the product with no photo is left out.
  await expect(page.getByTestId("catalogue-card")).toHaveCount(1);
  await expect(page.getByTestId("catalogue-card")).toContainText("SILK KURTA");
  await expect(page.getByTestId("catalogue-card")).toContainText("Sizes: M, XL");
  await expect(page.getByTestId("catalogue-card")).toContainText("Rs.1,100 - 1,200");

  await page.locator("#catalogue-with-photo").click();
  await expect(page.getByTestId("catalogue-card")).toHaveCount(2);
  await expect(page.getByTestId("catalogue-count")).toHaveText("2 of 2 products selected");
  // Tapping a card leaves it out of the PDF.
  await page.getByTestId("catalogue-card").filter({ hasText: "PLAIN KURTA" }).click();
  await expect(page.getByTestId("catalogue-count")).toHaveText("1 of 2 products selected");
  await page.screenshot({ path: testInfo.outputPath("catalogue.png") });

  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), page.getByTestId("catalogue-download").click()]);
  expect(dl.suggestedFilename()).toMatch(/_Catalogue\.pdf$/);
  const path = testInfo.outputPath("catalogue.pdf");
  await dl.saveAs(path);
  const pdf = readFileSync(path).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("SILK KURTA");
  expect(pdf).not.toContain("PLAIN KURTA");
  expect(pdf).toContain("/Subtype /Image");
});

test("Quick Stock shows a Photo column only when a product has a photo", async ({ page, backend }, testInfo) => {
  const withPhoto = product("p1", "SILK KURTA", PHOTO);
  const noPhoto = product("p2", "PLAIN KURTA", null);
  // Quick Stock embeds the product as `product` (the mock returns rows as stored).
  const quick = (v: ReturnType<typeof variant>) => ({ ...v, product: v.products });
  backend
    .addRows("products", [withPhoto, noPhoto])
    .addRows("product_variants", [quick(variant("v1", withPhoto, "M", 3, 1100)), quick(variant("v4", noPhoto, "M", 4, 800))]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  await page.getByRole("button", { name: "Quick Stock" }).click({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder(/Search by barcode/).fill("KURTA");
  await expect(dialog.getByText("SILK KURTA").first()).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId("product-thumb")).toHaveCount(1);
  await expect(dialog.getByRole("columnheader", { name: "Photo" })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("quick-stock.png") });

  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), dialog.getByTestId("quick-stock-pdf").click()]);
  expect(dl.suggestedFilename()).toMatch(/^Quick_Stock_.*\.pdf$/);
  const path = testInfo.outputPath("quick-stock.pdf");
  await dl.saveAs(path);
  const pdf = readFileSync(path).toString("latin1");
  expect(pdf).toContain("SILK KURTA");
  expect(pdf).toContain("/Subtype /Image");
});
