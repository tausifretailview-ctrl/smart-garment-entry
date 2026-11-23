import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Add New Product: Markdown % sits after Sale Price. Empty = the brand's markdown (shown as the
 * placeholder, with what the Sale Bill will charge); "Brand list" adds a brand-wise markdown.
 * The field shows only when Settings → Purchase → "Markdown % on products" is on.
 */
test("Add New Product hides Markdown % while the setting is off", async ({ page }) => {
  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await page.getByRole("button", { name: /Add New Product/ }).first().click();
  await expect(page.locator("#default_sale_price")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("#product_name")).toBeFocused({ timeout: 15_000 });
  await expect(page.getByTestId("product-markdown-input")).toHaveCount(0);
  await expect(page.getByTestId("open-brand-markdown")).toHaveCount(0);
});

test("Add New Product shows the brand markdown and adds one from the Brand list", async ({ page, backend }) => {
  backend.tables.settings[0].purchase_settings = { product_markdown_enabled: true };
  backend.addRows("brand_markdowns", [{ id: "bm1", organization_id: E2E_ORG_ID, brand: "ACME", markdown_percent: 25 }]);
  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await page.getByRole("button", { name: /Add New Product/ }).first().click();
  const md = page.getByTestId("product-markdown-input");
  await expect(md).toBeVisible({ timeout: 60_000 });

  // The form resets itself once, just after the window first paints (it loads the last product's
  // defaults) and then puts the cursor in Product Name. A fill that lands before that reset is
  // wiped, which no person can do but a loaded CI machine did. Wait for the cursor (the reset is
  // done), then type the price; retried in case the first try still raced it.
  await expect(page.locator("#product_name")).toBeFocused({ timeout: 15_000 });
  await expect(async () => {
    await page.locator("#default_pur_price").fill("1000");
    await expect(page.locator("#default_pur_price")).toHaveValue(/1000/, { timeout: 1_500 });
  }).toPass({ timeout: 20_000 });
  // Markup prices the product from the committed purchase price; under load the first markup
  // keystrokes can land before it, so re-enter the markup until the sale price is 1800.
  await expect(async () => {
    await page.locator("#markup_percent").fill("");
    await page.locator("#markup_percent").fill("80");
    await expect(page.locator("#default_sale_price")).toHaveValue(/^1800(\.0+)?$/, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
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
