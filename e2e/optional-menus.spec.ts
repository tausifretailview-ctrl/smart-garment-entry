import { test, expect } from "./support/test";
import { E2E_ORG_SLUG, e2eOrganization } from "./support/mockBackend";

/**
 * Optional menus: a new shop (organizations.settings.optional_menus all false, set by SQL file 53)
 * does not see Transport Master, Salesman Location, Stock Settlement, Duplicate Purchase Bills,
 * the extra customer reports or Website. Settings → Users → Optional menus turns a group on.
 * An existing shop (no key) keeps every menu.
 */
const allOff = { masters: false, stock_tools: false, data_checks: false, customer_reports: false, website: false };

function setOrgSettings(backend: { tables: Record<string, Array<Record<string, unknown>>> }, settings: Record<string, unknown>) {
  const org = { ...e2eOrganization, settings };
  backend.tables.organizations = [org];
  backend.tables.organization_members = backend.tables.organization_members.map((m) => ({ ...m, organizations: org }));
}

/** Opens the sidebar groups that hold the optional menus (they start collapsed). */
async function openGroups(page: import("@playwright/test").Page) {
  for (const group of ["Master", "Inventory", "Reports", "Settings"]) {
    const btn = page.getByRole("button", { name: group, exact: true }).first();
    await expect(btn).toBeVisible({ timeout: 60_000 });
    if ((await btn.getAttribute("data-state")) !== "open") await btn.click();
  }
}
const link = (page: import("@playwright/test").Page, name: string) => page.getByRole("link", { name, exact: true });

test("a new shop does not see the optional menus; Settings turns a group on", async ({ page, backend }) => {
  setOrgSettings(backend, { optional_menus: allOff });
  backend.keepInserts("organizations");
  // The User rights panel below lists logins from the get-users function.
  await page.route("**/functions/v1/get-users", (route) => route.fulfill({ json: { users: [] } }));
  await page.goto(`/${E2E_ORG_SLUG}/settings`);
  await openGroups(page);
  await expect(link(page, "Customer")).toBeVisible();
  await expect(link(page, "Customer Ledger")).toBeVisible();
  for (const name of ["Transport Master", "Employee Master", "Salesman Location", "Stock Settlement", "Duplicate Purchase Bills", "Customer Reviews", "Website"]) {
    await expect(link(page, name)).toHaveCount(0);
  }

  await page.getByRole("tab", { name: /User Rights/ }).click();
  const section = page.getByTestId("optional-menus-settings");
  await expect(section).toBeVisible();
  await section.locator("#optional-menu-masters").click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name === "organizations").map((c) => c.body))
    .toContainEqual({ settings: { optional_menus: { ...allOff, masters: true } } });
});

test("an existing shop (no optional_menus key) keeps every menu", async ({ page, backend }) => {
  setOrgSettings(backend, {});
  await page.goto(`/${E2E_ORG_SLUG}/settings`);
  await openGroups(page);
  for (const name of ["Transport Master", "Salesman Location", "Stock Settlement", "Duplicate Purchase Bills", "Customer Reviews", "Website"]) {
    await expect(link(page, name)).toBeVisible();
  }
});
