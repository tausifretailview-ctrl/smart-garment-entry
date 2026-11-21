import { test, expect } from "./support/test";
import { E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * The link the owner sends a salesman (Employee Master → WhatsApp): /{org}/field-sales. The page
 * offers "Install Field Sales app", and the install it offers is the shop's Field Sales app
 * (opens /{org}/salesman) — not the owner app, which is what Chrome used to install from here.
 */
test("Field Sales login page offers the Field Sales app install, not the owner app", async ({ page, backend }) => {
  void backend; // mocked shop (signed-in session from the fixture)
  await page.goto(`/${E2E_ORG_SLUG}/field-sales`);
  await expect(page.getByTestId("field-sales-install-card")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("field-sales-install-button")).toBeVisible();

  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveAttribute("data-ezzy-field-sales-manifest", E2E_ORG_SLUG);
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!.href;
    return (await fetch(href)).json();
  });
  expect(manifest.short_name).toBe("Field Sales");
  expect(manifest.start_url).toMatch(new RegExp(`/${E2E_ORG_SLUG}/salesman\\?app=fieldsales$`));
  expect(manifest.id).toMatch(new RegExp(`/${E2E_ORG_SLUG}/salesman$`));
  expect(manifest.icons[0].src).toContain("icon-field-sales-192.png");

  // Desktop test browser: no install event → the Chrome-menu steps are shown.
  await expect(page.getByTestId("field-sales-install-steps")).toContainText("Install app");
});
