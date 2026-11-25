import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * POS Hold (F7) → resume → complete. Users saw the red count on the Hold button stay after the
 * held bill was made into an invoice: the held-bills list was cached for 5 minutes and nothing
 * refreshed it after a sale. Here the count must go from 1 back to none once the bill is paid,
 * and the completed bill must be saved over the held row (same id) with a POS number.
 */
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS",
  style: null, color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods",
  status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 999, mrp: 999, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

test("POS: hold a bill, resume it, pay Cash: the Hold count clears", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]).keepInserts("sales");
  backend.onRpc("generate_hold_number_atomic", () => "Hold/26-27/1");
  backend.onRpc("generate_pos_number_atomic", () => "POS/26-27/7");
  // The held-bills list (badge and panel) — its filter is unique to it.
  const heldListReads = () =>
    backend.readsOf("sales").filter((r) => r.query.includes("or=(payment_status.eq.hold,sale_number.like.Hold/%)")).length;
  let heldReadsAtSave = -1;
  // The resumed bill is saved over the held row, lines and header together.
  backend.onRpc("save_document_with_lines", (args) => {
    heldReadsAtSave = heldListReads();
    const id = String(args.p_document_id);
    const row = (backend.tables.sales ?? []).find((r) => r.id === id);
    if (row) Object.assign(row, args.p_header as Record<string, unknown>);
    return { success: true, header: { ...(row ?? {}), id } };
  });

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  const holdButton = page.getByRole("button", { name: /Hold/ }).filter({ hasText: "F7" }).first();
  await expect(holdButton).toBeVisible();
  await expect(holdButton).not.toContainText(/^.*F7\s*1/);

  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);

  // F7 asks first; Enter holds. The cart is parked and the red count shows 1.
  await page.keyboard.press("F7");
  await expect(page.getByTestId("pos-hold-confirm")).toBeVisible();
  await expect(page.getByTestId("pos-hold-confirm-yes")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(0);
  const heldRow = (backend.tables.sales ?? [])[0];
  expect(heldRow).toMatchObject({ sale_number: "Hold/26-27/1", payment_status: "hold" });
  const redCount = holdButton.locator("span.bg-red-500");
  await expect(redCount).toHaveText("1");

  // Resume from the hold panel: the cart comes back.
  await holdButton.click();
  await page.getByRole("button", { name: "Resume Bill" }).first().click();
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);
  // A cashier takes a moment before paying.
  await page.waitForTimeout(2_000);

  // Cash (F1): completed over the same row, with a POS number; the red count goes away.
  await page.keyboard.press("F1");
  const saved = page.getByRole("alertdialog", { name: "Invoice Saved!" });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("POS/26-27/7");
  const saves = backend.rpcCalls("save_document_with_lines");
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ p_kind: "sale", p_document_id: heldRow.id });
  expect(saves[0].p_header).toMatchObject({ sale_number: "POS/26-27/7", held_cart_data: null, payment_method: "cash" });
  expect(backend.rpcCalls("save_sale_with_items_numbered")).toHaveLength(0);

  await saved.getByRole("button", { name: "Done" }).click();
  // The held list must be read again after the bill was saved. Before the fix nothing did, so
  // the count kept showing the completed bill (it cleared only when a read started earlier
  // happened to finish after the save).
  await expect.poll(heldListReads).toBeGreaterThan(heldReadsAtSave);
  await expect(redCount).toHaveCount(0);
});

test("POS: a stray F7 or Hold click does not park the bill until the cashier says yes", async ({ page, backend }) => {
  backend.addRows("products", [product]).addRows("product_variants", [variant]).keepInserts("sales");
  backend.onRpc("generate_hold_number_atomic", () => "Hold/26-27/1");

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  const scan = page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await scan.fill("100001");
  await scan.press("Enter");
  const line = page.locator("tr", { hasText: "100001" });
  await expect(line).toHaveCount(1);

  // F7 then Esc: nothing held, the cart stays (Esc must not also clear the cart).
  await page.keyboard.press("F7");
  const confirm = page.getByTestId("pos-hold-confirm");
  await expect(confirm).toBeVisible();
  await expect(confirm).toContainText("1 qty");
  await page.keyboard.press("Escape");
  await expect(confirm).toHaveCount(0);
  await expect(line).toHaveCount(1);

  // Hold button then Cancel: same.
  const holdButton = page.getByRole("button", { name: /Hold/ }).filter({ hasText: "F7" }).first();
  await holdButton.click();
  await expect(confirm).toBeVisible();
  await page.getByTestId("pos-hold-confirm-no").click();
  await expect(confirm).toHaveCount(0);
  await expect(line).toHaveCount(1);

  expect(backend.rpcCalls("generate_hold_number_atomic")).toHaveLength(0);
  expect((backend.tables.sales ?? []).filter((r) => r.payment_status === "hold")).toHaveLength(0);
});
