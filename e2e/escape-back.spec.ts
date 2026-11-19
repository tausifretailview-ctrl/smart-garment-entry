import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Esc steps back through the pages visited, newest first (user's example): Purchase Bill →
 * Sale Bill → Payments, Esc → Sale Bill, Esc → Purchase Bill. With no earlier page it falls
 * back to the page's usual parent (Purchase Bill → Purchase dashboard).
 */
test("Esc goes back to the previous page, in reverse order", async ({ page, backend }) => {
  void backend; // signed-in shop with a mocked database
  const at = (path: string) => new RegExp(`/${E2E_ORG_SLUG}/${path}(\\?|$)`);
  const pressEsc = async () => {
    // Out of any field first: Esc in a filled box only clears it.
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.keyboard.press("Escape");
  };

  // Move between pages inside the app, as a click on the menu does (one page load only).
  const open = (path: string) =>
    page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/${E2E_ORG_SLUG}/${path}`);

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await expect(page).toHaveURL(at("purchase-entry"));
  await page.waitForLoadState("networkidle");
  await open("sales-invoice");
  await expect(page.getByPlaceholder("Scan barcode...").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await open("payments-dashboard");
  await expect(page).toHaveURL(at("payments-dashboard"));
  await page.waitForLoadState("networkidle");

  await pressEsc();
  await expect(page).toHaveURL(at("sales-invoice"));
  await expect(page.getByPlaceholder("Scan barcode...").filter({ visible: true })).toBeVisible({ timeout: 60_000 });

  await pressEsc();
  await expect(page).toHaveURL(at("purchase-entry"));

  // Nothing earlier in this tab: the usual parent (Purchase dashboard).
  await page.waitForLoadState("networkidle");
  await pressEsc();
  await expect(page).toHaveURL(at("purchase-bills"));
});
