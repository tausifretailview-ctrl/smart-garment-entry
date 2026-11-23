import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";
/**
 * Settings → POS print: "Size the print page to the receipt (this computer)" is saved in this
 * browser only (it depends on this computer's printer), off by default.
 */
test("thermal page-size switch is per computer and off by default", async ({ page, backend }) => {
  void backend;
  await page.goto(`/${E2E_ORG_SLUG}/settings`);
  await page.waitForLoadState("networkidle");
  const tab = page.getByRole("tab", { name: /POS/i }).first();
  if (await tab.count()) await tab.click();
  const toggle = page.locator("#thermal_fit_page_to_receipt");
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Size the print page to the receipt (this computer)")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("ezzy_thermal_fit_page_to_receipt"))).toBeNull();
  await toggle.click();
  expect(await page.evaluate(() => localStorage.getItem("ezzy_thermal_fit_page_to_receipt"))).toBe("1");
  await toggle.click();
  expect(await page.evaluate(() => localStorage.getItem("ezzy_thermal_fit_page_to_receipt"))).toBeNull();
});
