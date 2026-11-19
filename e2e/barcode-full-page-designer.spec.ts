import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Barcode Printing → Standard → A4 sheet → Full Page Designer: the label designer next to
 * the whole A4 sheet, with every label slot of the chosen sheet (user request).
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 1299, pur_price: 500, stock_qty: 3, active: true, deleted_at: null, products: product,
};

test("Full Page Designer shows the whole A4 sheet and follows sheet, nudge and start position", async ({ page, backend }, testInfo) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]);
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto(`/${E2E_ORG_SLUG}/barcode-printing`);
  const search = page.getByRole("combobox").filter({ hasText: /Search product, brand, size, or barcode/ });
  await expect(search).toBeVisible({ timeout: 60_000 });
  await search.click();
  await page.getByPlaceholder("Type to search...").fill("100001");
  await page.getByRole("option").filter({ hasText: "COTTON SHIRT" }).first().click();
  const qty = page.locator("tr", { hasText: "100001" }).locator("input");
  await qty.fill("3");
  await qty.press("Tab");

  await page.getByText("Layout & Style", { exact: true }).click();
  await page.getByRole("button", { name: "Full Page Designer" }).click();
  const dialog = page.getByTestId("full-page-designer");
  await expect(dialog).toBeVisible();
  const sheet = dialog.getByTestId("full-page-sheet");

  // Default sheet in the demo shop is Novajet 48 (8×6): the full sheet is filled with the label.
  await expect(sheet).toHaveAttribute("data-cols", "8");
  await expect(sheet.locator("[data-slot]")).toHaveCount(48);
  await expect(sheet.locator('[data-slot="label"]')).toHaveCount(48);
  await expect(sheet.locator('[data-slot="label"]').first()).toContainText("COTTON SHIRT");
  // The field designer sits next to the page.
  await expect(dialog.getByTestId("full-page-designer-fields")).toContainText("Live Preview");

  // Designing on the left updates every label on the sheet: untick Brand.
  await expect(sheet.locator('[data-slot="label"]').last()).toContainText("ACME");
  const brandRow = dialog.getByTestId("full-page-designer-fields").locator("div", { hasText: /^Brand/ }).filter({ has: page.getByRole("checkbox") }).first();
  await brandRow.getByRole("checkbox").click();
  await expect(sheet.locator('[data-slot="label"]').first()).not.toContainText("ACME");
  await expect(sheet.locator('[data-slot="label"]').last()).not.toContainText("ACME");
  await expect(sheet.locator('[data-slot="label"]').last()).toContainText("COTTON SHIRT");

  // Print order: exactly the 3 labels, after 4 used slots.
  await dialog.getByRole("button", { name: /Print order \(3\)/ }).click();
  await dialog.getByLabel("Start position").fill("5");
  await expect(sheet.locator('[data-slot="skip"]')).toHaveCount(4);
  await expect(sheet.locator('[data-slot="label"]')).toHaveCount(3);
  await expect(sheet.locator('[data-slot="empty"]')).toHaveCount(41);
  await expect(dialog.getByTestId("full-page-page")).toHaveText("Page 1 of 1");

  // Switch to Novajet 65 (5×13, like the shop's sticker sheet).
  await dialog.getByRole("combobox", { name: "Sheet type" }).click();
  await page.getByRole("option", { name: /Novajet 65/ }).click();
  await expect(sheet).toHaveAttribute("data-cols", "5");
  await expect(sheet.locator("[data-slot]")).toHaveCount(65);
  await expect(dialog.getByTestId("full-page-sheet-summary")).toContainText("38×21mm · 5×13 = 65 per sheet");

  // Nudging Top moves the first label down by that much on the page.
  const grid = sheet.locator("[data-slot]").first();
  const before = await grid.boundingBox();
  await dialog.getByRole("button", { name: "Top plus" }).click();
  await dialog.getByRole("button", { name: "Top plus" }).click();
  await expect(dialog.getByTestId("full-page-offset-top")).toHaveValue("1");
  const after = await grid.boundingBox();
  expect(after!.y - before!.y).toBeGreaterThan(1);

  await dialog.getByRole("button", { name: "Full sheet" }).click();
  // "Fit" shows the whole page: its bottom edge is inside the viewport.
  const pageBox = await sheet.boundingBox();
  const viewport = await sheet.locator("xpath=../..").boundingBox();
  expect(pageBox!.y + pageBox!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height + 1);
  await page.mouse.move(5, 5);
  await page.screenshot({ path: testInfo.outputPath("full-page-designer.png") });
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: testInfo.outputPath("full-page-designer-1366.png") });

  // The sheet choice is the page's own: closing keeps Novajet 65 on the Standard tab.
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Novajet 65 (38×21mm, 5 cols)").first()).toBeVisible();
});
