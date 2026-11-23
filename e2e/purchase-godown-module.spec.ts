import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Godowns outside Industrial mode: Settings → Purchase → "Godown module". On, Purchase Entry shows
 * "Receive into" in the top row, beside Supplier and Supplier Invoice No. Off (and Industrial
 * mode off), nothing about godowns shows and the godown list is never read.
 */
const godown = (id: string, name: string, godown_type: string, sort_order: number) => ({
  id, organization_id: E2E_ORG_ID, name, code: null, godown_type, address: null, pincode: null, contact_name: null,
  contact_phone: null, supplier_id: null, notes: null, is_active: true, sort_order, created_at: "2026-11-01T00:00:00Z",
});

test("Godown module on: Receive into sits in the Supplier row", async ({ page, backend }) => {
  backend.tables.settings[0].purchase_settings = { godown_module_enabled: true };
  backend.addRows("godowns", [godown("g-main", "Main", "main", 0), godown("g-2", "Back Store", "warehouse", 1)]);

  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  const receiveInto = page.getByRole("combobox", { name: "Receive into godown" });
  await expect(receiveInto).toBeVisible({ timeout: 60_000 });

  const grid = page.locator(".purchase-entry-meta-grid");
  await expect(grid.getByRole("combobox", { name: "Receive into godown" })).toBeVisible();
  const supplierBox = await grid.locator("#supplier_name").boundingBox();
  const invoiceBox = await grid.locator("#supplier_invoice_no").boundingBox();
  const godownBox = await receiveInto.boundingBox();
  expect(supplierBox && invoiceBox && godownBox).toBeTruthy();
  // Same row, right after Supplier Invoice No.
  expect(Math.abs(godownBox!.y - invoiceBox!.y)).toBeLessThan(2);
  expect(Math.abs(godownBox!.height - invoiceBox!.height)).toBeLessThan(2);
  expect(godownBox!.x).toBeGreaterThan(invoiceBox!.x + invoiceBox!.width - 1);
  await expect(receiveInto).toContainText("Main");
});

test("Godown module off: no godown field and no godown reads", async ({ page, backend }) => {
  backend.addRows("godowns", [godown("g-main", "Main", "main", 0), godown("g-2", "Back Store", "warehouse", 1)]);
  await page.goto(`/${E2E_ORG_SLUG}/purchase-entry`);
  await expect(page.locator("#supplier_invoice_no")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByRole("combobox", { name: "Receive into godown" })).toHaveCount(0);
  expect(backend.rpcCalls("godown_ensure_main")).toHaveLength(0);
  expect(backend.readsOf("godowns")).toHaveLength(0);
});
