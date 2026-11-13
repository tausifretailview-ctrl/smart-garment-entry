import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sales Invoice on a phone: the customer must be selectable and creatable. The phone layout
 * used to set the "customer list open" flag with no list rendered (tapping "Tap to select
 * customer…" did nothing, so no invoice could be saved), and its New Customer dialog's
 * Create did nothing. Both now use the same picker and Add New Customer dialog as desktop.
 */
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test("Sales invoice (phone): pick a customer, and create a new one", async ({ page, backend }) => {
  backend.addRows("customers", [
    { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", deleted_at: null },
  ]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const pick = page.getByText("Tap to select customer…");
  await expect(pick).toBeVisible({ timeout: 60_000 });

  await pick.click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  await expect(page.getByText("RAVI KUMAR · 9876543210")).toBeVisible();

  await page.getByRole("button", { name: "New customer" }).click();
  const dialog = page.getByRole("dialog", { name: "Add New Customer" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/mobile number/i).fill("9123456780");
  await dialog.getByPlaceholder(/customer name/i).fill("ANIL");
  await dialog.getByRole("button", { name: "Create Customer" }).click();

  await expect(dialog).toBeHidden();
  const inserts = backend.calls.filter((c) => c.kind === "insert" && c.name === "customers");
  expect(inserts).toHaveLength(1);
  expect(JSON.stringify(inserts[0].body)).toContain('"customer_name":"ANIL"');
  expect(JSON.stringify(inserts[0].body)).toContain('"phone":"9123456780"');
  await expect(page.getByText(/ANIL/).first()).toBeVisible();
});
