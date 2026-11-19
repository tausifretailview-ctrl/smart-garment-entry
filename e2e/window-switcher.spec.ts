import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Alt+W window switcher (like Windows Alt+Tab): most recent first, hold Alt and tap W to move,
 * release Alt to open; Delete closes a window; a quick tap flips to the last window.
 */
test("Alt+W shows open windows and switches or closes them", async ({ page, backend }) => {
  void backend; // signed-in shop with a mocked database
  const at = (path: string) => new RegExp(`/${E2E_ORG_SLUG}/${path}(\\?|$)`);
  const open = (path: string) =>
    page.evaluate((url) => {
      window.history.pushState({}, "", url);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, `/${E2E_ORG_SLUG}/${path}`);
  const shots = process.env.E2E_SHOT_DIR;

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await page.waitForLoadState("networkidle");
  await open("sales-invoice");
  await expect(page.getByPlaceholder("Scan barcode...").filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await open("customers");
  await expect(page).toHaveURL(at("customers"));
  await page.waitForLoadState("networkidle");
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);

  // Hold Alt, tap W: the list shows, most recent first, the previous window chosen.
  await page.keyboard.down("Alt");
  await page.keyboard.press("w");
  const dialog = page.getByRole("dialog", { name: "Switch window" });
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole("option");
  await expect(options).toHaveCount(3);
  await expect(options.nth(0)).toContainText("Current window");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(options.nth(1)).toContainText("Sales Invoice");
  await page.keyboard.press("w"); // next: Purchase Entry
  await expect(options.nth(2)).toHaveAttribute("aria-selected", "true");
  if (shots) await page.screenshot({ path: `${shots}/window-switcher.png` });
  await page.keyboard.up("Alt");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(at("purchase-entry"));

  // A quick tap flips back to the window used just before.
  await page.keyboard.down("Alt");
  await page.keyboard.press("w");
  await page.keyboard.up("Alt");
  await expect(page).toHaveURL(at("customers"));

  // Close a window from the switcher with Delete, then cancel with Esc.
  await page.keyboard.down("Alt");
  await page.keyboard.press("w");
  await expect(dialog).toBeVisible();
  await expect(options.nth(1)).toContainText("Purchase");
  await page.keyboard.press("Delete");
  await expect(options).toHaveCount(2);
  await page.keyboard.press("Escape");
  await page.keyboard.up("Alt");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(at("customers"));
});
