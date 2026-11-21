import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Login on a phone (salesman report, Nov 2026): after logging out of the Field Sales app the
 * owner login of the remembered shop opened, oversized and cut off at the top, with no way to
 * reach another shop (the apps have no address bar). Now: the Field Sales app returns to its own
 * login, both logins fit a 360px phone, and "Change organisation" opens another shop's login.
 */
const shops: Record<string, string> = { demo: "E2E DEMO SHOP", "ks-footwear": "KS FOOTWEAR" };

function publicInfo(backend: import("./support/mockBackend").MockBackend) {
  backend.onRpc("get_org_public_info", (args) => {
    const slug = String(args.p_slug);
    return shops[slug] ? { id: E2E_ORG_ID, name: shops[slug], slug, settings: {}, business_name: shops[slug], bill_barcode_settings: {} } : null;
  });
}
const signOut = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) if (key.startsWith("sb-")) localStorage.removeItem(key);
  });
const fitsScreen = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test.use({ viewport: { width: 360, height: 760 } });

test("Shop login on a phone fits the screen and can change organisation", async ({ page, backend }) => {
  publicInfo(backend);
  await signOut(page);
  await page.goto(`/${E2E_ORG_SLUG}`);

  const shell = page.getByTestId("login-phone");
  await expect(shell).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "E2E DEMO SHOP" })).toBeVisible();
  // Phone text size; the brand row is on screen (it was cut off above the top edge).
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("16px");
  expect(await fitsScreen(page)).toBe(true);
  const brand = (await page.getByText("EzzyERP", { exact: true }).boundingBox())!;
  expect(brand.y).toBeGreaterThanOrEqual(8);
  const signIn = (await page.getByRole("button", { name: /^Sign in$/ }).boundingBox())!;
  expect(signIn.x).toBeGreaterThanOrEqual(0);
  expect(signIn.x + signIn.width).toBeLessThanOrEqual(360);

  await page.getByTestId("change-organization").click();
  const dialog = page.getByTestId("change-organization-dialog");
  await expect(dialog).toContainText("You are on E2E DEMO SHOP");
  await dialog.getByLabel("Organisation code").fill("no-such-shop");
  await dialog.getByRole("button", { name: "Open login" }).click();
  await expect(dialog.getByTestId("change-organization-error")).toContainText("No organisation found with the code “no-such-shop”");
  expect(new URL(page.url()).pathname).toBe(`/${E2E_ORG_SLUG}`);

  // Typed as a name: still finds the shop, remembers it and opens its login.
  await dialog.getByLabel("Organisation code").fill("KS Footwear");
  await dialog.getByRole("button", { name: "Open login" }).click();
  await expect(page.getByRole("heading", { name: "KS FOOTWEAR" })).toBeVisible({ timeout: 60_000 });
  expect(new URL(page.url()).pathname).toBe("/ks-footwear");
  expect(await page.evaluate(() => localStorage.getItem("selectedOrgSlug"))).toBe("ks-footwear");
});

test("Logging out of the Field Sales app returns to the Field Sales login, which can change organisation", async ({ page, backend }) => {
  publicInfo(backend);
  backend
    .addRows("employees", [{ id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "JAVED BHAI", field_sales_access: true, status: "active", deleted_at: null }])
    .addRows("sale_orders", []);
  await page.goto(`/${E2E_ORG_SLUG}/salesman`);
  await expect(page.getByTestId("fs-home")).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: "Logout" }).click();
  await page.getByRole("button", { name: "Log out" }).click();

  // The salesman's own login (not the owner / staff login of the shop).
  const login = page.getByTestId("field-sales-login");
  await expect(login).toBeVisible({ timeout: 30_000 });
  expect(new URL(page.url()).pathname).toBe(`/${E2E_ORG_SLUG}/field-sales`);
  await expect(login).toContainText("Sign in with your salesman login");
  expect(await fitsScreen(page)).toBe(true);

  await login.getByTestId("change-organization").click();
  const dialog = page.getByTestId("change-organization-dialog");
  await dialog.getByLabel("Organisation code").fill("ks-footwear");
  await dialog.getByRole("button", { name: "Open login" }).click();
  await expect(page.getByTestId("field-sales-login")).toContainText("KS FOOTWEAR", { timeout: 60_000 });
  expect(new URL(page.url()).pathname).toBe("/ks-footwear/field-sales");
});
