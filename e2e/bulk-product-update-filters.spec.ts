import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Bulk Product Update: the Brand / Category / Product Name filters were built from one products
 * read, which the server stops at 1,000 rows. A shop with more products could not find a brand
 * such as JULIET. The lists must come from every product, and Brand must have a search box.
 */
test("Bulk Product Update: brand filter lists brands past the first 1,000 products and can be searched", async ({ page, backend }) => {
  const products = Array.from({ length: 1_250 }, (_, i) => ({
    id: `p${String(i).padStart(5, "0")}`,
    organization_id: E2E_ORG_ID,
    product_name: i >= 1_200 ? `JULIET KURTI ${i}` : `KURTI ${i}`,
    category: i >= 1_200 ? "KURTI" : "SHIRTS",
    brand: i >= 1_200 ? "JULIET" : `BRAND ${i % 40}`,
    style: null,
    deleted_at: null,
  }));
  backend.addRows("products", products);

  await page.goto(`/${E2E_ORG_SLUG}/bulk-product-update`);
  // A cold open can draw the page twice for a moment (like the launcher): use the visible copy,
  // and wait until only one is left.
  const brand = page.getByTestId("bulk-filter-brand").filter({ visible: true });
  await expect(brand).toHaveCount(1, { timeout: 60_000 });
  // Every page of products was read, not just the first 1,000.
  await expect.poll(() => backend.readsOf("products").length).toBeGreaterThanOrEqual(2);

  await brand.click();
  await page.getByPlaceholder("Search brand...").fill("juli");
  const juliet = page.getByRole("option", { name: "JULIET" });
  await expect(juliet).toBeVisible();
  await expect(page.getByRole("option", { name: "BRAND 1", exact: true })).toHaveCount(0);
  await juliet.click();
  await expect(brand).toHaveText("JULIET");

  // Category from the same late products is listed too.
  await page.getByTestId("bulk-filter-category").filter({ visible: true }).click();
  await page.getByPlaceholder("Search category...").fill("kurti");
  await expect(page.getByRole("option", { name: "KURTI" })).toBeVisible();
});
