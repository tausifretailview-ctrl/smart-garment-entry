import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Core flow 3 of 6 (Plan Phase 4, R2): in POS, F5 opens Sale Return. The cashier picks the
 * customer, scans the returned item, chooses Credit Note and saves. The return goes to the
 * database as ONE save_return_with_items_atomic call, then a credit note is numbered and
 * created for the customer.
 */

const customer = { id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210", deleted_at: null };
const product = {
  id: "p1",
  organization_id: E2E_ORG_ID,
  product_name: "COTTON SHIRT",
  brand: "ACME",
  category: "SHIRTS",
  style: null,
  hsn_code: "6205",
  gst_per: 5,
  product_type: "goods",
  status: "active",
  deleted_at: null,
};
const variant = {
  id: "v1",
  product_id: "p1",
  organization_id: E2E_ORG_ID,
  size: "M",
  color: "BLUE",
  barcode: "100001",
  sale_price: 999,
  mrp: 999,
  pur_price: 500,
  gst_per: 5,
  stock_qty: 9,
  // Return stock limit = opening + purchased − purchase returns: 10, so 9 → 10 is allowed.
  opening_qty: 10,
  active: true,
  deleted_at: null,
  products: product,
};
/** Returns only accept items that were sold: one earlier POS line for this barcode. */
const soldLine = {
  id: "si-1",
  sale_id: "sale-0",
  variant_id: "v1",
  product_id: "p1",
  barcode: "100001",
  product_name: "COTTON SHIRT",
  size: "M",
  quantity: 1,
  unit_price: 999,
  per_qty_net_amount: 999,
  line_total: 999,
  deleted_at: null,
  sales: { organization_id: E2E_ORG_ID, deleted_at: null },
};

test("Sale return: customer, scan item, Credit Note, save", async ({ page, backend }) => {
  backend.addRows("customers", [customer]).addRows("products", [product]).addRows("product_variants", [variant]).addRows("sale_items", [soldLine]);
  backend.onRpc("save_return_with_items_atomic", (args) => ({
    return: { ...(args.p_header as Record<string, unknown>), id: "ret-1", return_number: "SR/26-27/1" },
    items_inserted: (args.p_items as unknown[]).length,
  }));
  backend.onRpc("generate_credit_note_number", () => "CN/26-27/1");
  // A busy shop: the list of sold items takes a while. Its arrival must not pull the cursor
  // out of the customer search the cashier is already typing in.
  backend.onRpc("get_sold_variant_ids", () => new Promise((resolve) => setTimeout(() => resolve([{ product_id: "p1", variant_id: "v1" }]), 1_500)));

  await page.goto(`/${E2E_ORG_SLUG}/pos-sales`);
  await expect(page.getByPlaceholder(/^Scan barcode or search/).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("F5");
  const dialog = page.getByRole("dialog").filter({ hasText: "Sale Return" });
  await expect(dialog).toBeVisible();

  // The window puts the cursor in its scan box just after opening; wait for that so it does
  // not close the customer list mid-pick.
  const scan = dialog.getByPlaceholder(/Scan barcode or search product name/);
  await expect(scan).toBeFocused();

  // Credit Note needs a customer.
  await dialog.getByRole("button", { name: /Credit Note/ }).click();
  await dialog.getByText(/Search customer by name or phone/).click();
  await page.getByPlaceholder("Type name or phone...").fill("RAVI");
  // Let the slow sold-items list arrive while the customer list is open: it must stay open.
  await expect.poll(() => backend.rpcCalls("get_sold_variant_ids").length).toBeGreaterThan(0);
  await page.waitForTimeout(2_500);
  await expect(page.getByPlaceholder("Type name or phone...")).toBeFocused();
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();

  await scan.fill("100001");
  await scan.press("Enter");
  await expect(dialog.locator("tr", { hasText: "COTTON SHIRT" })).toHaveCount(1);

  await dialog.getByRole("button", { name: /Save Return/ }).click();
  await expect(page.getByText(/Return SR\/26-27\/1/).first()).toBeVisible(); // "Return Saved" toast
  await expect(dialog).toBeHidden();

  const saves = backend.rpcCalls("save_return_with_items_atomic");
  expect(saves).toHaveLength(1);
  const { p_kind, p_organization_id, p_header, p_items } = saves[0] as {
    p_kind: string;
    p_organization_id: string;
    p_header: Record<string, unknown>;
    p_items: Record<string, unknown>[];
  };
  expect(p_kind).toBe("sale_return");
  expect(p_organization_id).toBe(E2E_ORG_ID);
  expect(p_header).toMatchObject({
    customer_id: "cust-1",
    customer_name: "RAVI KUMAR",
    refund_type: "credit_note",
    credit_status: "pending",
    gross_amount: 999,
    net_amount: 999,
  });
  expect(p_items).toHaveLength(1);
  expect(p_items[0]).toMatchObject({ variant_id: "v1", product_id: "p1", barcode: "100001", quantity: 1, unit_price: 999, line_total: 999 });

  // Then the credit note: numbered, created for the customer, and linked to the return.
  expect(backend.rpcCalls("generate_credit_note_number")).toHaveLength(1);
  const cnInsert = backend.calls.find((c) => c.kind === "insert" && c.name === "credit_notes");
  expect(cnInsert?.body).toMatchObject({
    credit_note_number: "CN/26-27/1",
    customer_id: "cust-1",
    credit_amount: 999,
    used_amount: 0,
    status: "active",
  });
  const link = backend.calls.find((c) => c.kind === "update" && c.name === "sale_returns");
  expect(link?.body).toMatchObject({ credit_status: "pending" });
  expect((link?.body as Record<string, unknown>).credit_note_id).toEqual(expect.any(String));

  // The old step-by-step return inserts must not run as well.
  expect(backend.calls.filter((c) => c.kind === "insert" && (c.name === "sale_returns" || c.name === "sale_return_items"))).toEqual([]);
});
