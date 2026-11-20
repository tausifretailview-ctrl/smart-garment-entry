import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Add New Product: Markdown % sits after Sale Price. Empty = the brand's markdown (shown as the
 * placeholder, with what the Sale Bill will charge); "Brand list" adds a brand-wise markdown.
 */
test("Add New Product shows the brand markdown and adds one from the Brand list", async ({ page, backend }) => {
  backend.addRows("brand_markdowns", [{ id: "bm1", organization_id: E2E_ORG_ID, brand: "ACME", markdown_percent: 25 }]);
  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await page.getByRole("button", { name: /Add New Product/ }).first().click();
  const md = page.getByTestId("product-markdown-input");
  await expect(md).toBeVisible({ timeout: 60_000 });

  await page.locator("#default_pur_price").fill("1000");
  await page.locator("#markup_percent").fill("80");
  await page.locator('input[placeholder="Brand" i]').first().fill("ACME");
  await expect(md).toHaveAttribute("placeholder", "Brand 25%");
  await expect(page.getByTestId("product-markdown-hint")).toHaveText("Sale Bill: 1800 − 25% = 1350 (brand)");

  // The product's own markdown wins.
  await md.fill("30");
  await expect(page.getByTestId("product-markdown-hint")).toHaveText("Sale Bill: 1800 − 30% = 1260");

  await page.getByTestId("open-brand-markdown").click();
  const dialog = page.getByTestId("brand-markdown-dialog");
  await expect(dialog.getByTestId("brand-markdown-list")).toContainText("ACME");
  await dialog.getByLabel("Brand", { exact: true }).fill("ZARA KIDS");
  await dialog.getByLabel("Markdown %", { exact: true }).fill("30");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "brand_markdowns").map((c) => c.body))
    .toEqual([{ organization_id: E2E_ORG_ID, brand: "ZARA KIDS", markdown_percent: 30 }]);
});
