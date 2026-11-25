import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Add New Product (purchase) with a size group: Enter on the last size qty goes to Add to Bill by
 * default. With Settings → Purchase → "Cursor after last size qty" = 1st size Purchase Price, it
 * opens the size price table and goes to the first size's Pur Price, so prices can be checked.
 * Before, that only happened for Free Size (its table is always shown); with a size group the
 * table was hidden and the cursor always fell through to Add to Bill.
 */
const sizeGroup = { id: "g1", organization_id: E2E_ORG_ID, group_name: "S-L", sizes: ["S", "M", "L"], deleted_at: null };

async function openWithSizeGroup(page: import("@playwright/test").Page) {
  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await page.getByRole("button", { name: /Add New Product/ }).first().click();
  await expect(page.locator("#product_name")).toBeFocused({ timeout: 60_000 });
  await expect(page.locator("#size-qty-S")).toBeVisible({ timeout: 20_000 });
  await page.locator("#size-qty-S").fill("2");
  await page.locator("#size-qty-S").press("Enter");
  await expect(page.locator("#size-qty-M")).toBeFocused();
  await page.locator("#size-qty-M").fill("3");
  await page.locator("#size-qty-M").press("Enter");
  await expect(page.locator("#size-qty-L")).toBeFocused();
  await page.locator("#size-qty-L").fill("1");
  await page.locator("#size-qty-L").press("Enter");
}

test("size group: Enter on the last size qty goes to Add to Bill by default", async ({ page, backend }) => {
  backend.tables.settings[0].product_settings = { default_size_group: "g1" };
  backend.addRows("size_groups", [sizeGroup]);
  await openWithSizeGroup(page);
  await expect(page.locator("#btn-add-all-sizes")).toBeFocused();
});

test("size group: with the setting, Enter on the last size qty goes to the 1st size Pur Price", async ({ page, backend }) => {
  backend.tables.settings[0].product_settings = { default_size_group: "g1" };
  backend.tables.settings[0].purchase_settings = { cursor_after_size_qty: "pur_price" };
  backend.addRows("size_groups", [sizeGroup]);
  await openWithSizeGroup(page);
  const firstPur = page.locator('[id^="variant-pur-price-"]').first();
  await expect(firstPur).toBeFocused();
  // The table lists the sizes with a qty, first size first.
  await expect(page.getByText("Variant Details")).toBeVisible();
});
