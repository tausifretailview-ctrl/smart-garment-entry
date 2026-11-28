import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sales → Dispatch (Nov 2026): accepted sale orders. Check the items, download them, Start with
 * the staff who dispatches, then Delivered.
 */
const base = {
  organization_id: E2E_ORG_ID, customer_id: null, gross_amount: 0, gst_amount: 0, deleted_at: null,
  customer_accepted: true, acceptance_status: "accepted", salesman: "RAJU", status: "pending",
  dispatch_staff: null, dispatch_started_at: null, delivered_at: null,
};
const orders = [
  {
    ...base, id: "so-1", order_number: "SO/26-27/31", order_date: "2026-11-27", customer_name: "MILAN SHOES", customer_phone: "9820567827",
    net_amount: 18450, dispatch_status: "pending", invoiced_sale_number: "INV/26-27/88", created_at: "2026-11-27T09:00:00Z",
    sale_order_items: [{ order_qty: 12 }, { order_qty: 6 }],
  },
  {
    ...base, id: "so-2", order_number: "SO/26-27/30", order_date: "2026-11-26", customer_name: "STEP IN", customer_phone: "9000000000",
    net_amount: 9200, dispatch_status: "in_process", dispatch_staff: "SURESH", dispatch_started_at: "2026-11-27T10:00:00Z",
    created_at: "2026-11-26T09:00:00Z", sale_order_items: [{ order_qty: 10 }],
  },
];
const lines = [
  { id: "l1", order_id: "so-1", product_name: "MR50", color: "BK", size: "8", barcode: "200001", order_qty: 12, created_at: "2026-11-27T09:00:00Z" },
  { id: "l2", order_id: "so-1", product_name: "MR50", color: "BK", size: "9", barcode: "200002", order_qty: 6, created_at: "2026-11-27T09:00:01Z" },
];

test("Dispatch: accepted orders; items, Start with staff, Delivered", async ({ page, backend }) => {
  backend
    .addRows("sale_orders", orders)
    .addRows("sale_order_items", lines)
    .addRows("employees", [
      { id: "emp-1", organization_id: E2E_ORG_ID, employee_name: "RAMESH", designation: "Packer", status: "active", deleted_at: null },
    ]);

  await page.goto(`/${E2E_ORG_SLUG}/dispatch`);
  await expect(page.getByRole("heading", { name: "Dispatch" }).filter({ visible: true })).toBeVisible({ timeout: 60_000 });

  // Pending tab: the accepted order with its quantity and bill number.
  const row = page.getByTestId("dispatch-row").filter({ visible: true }).filter({ hasText: "SO/26-27/31" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("18");
  await expect(row.getByTestId("dispatch-bill-no")).toHaveText("INV/26-27/88");
  await expect(row.getByTestId("dispatch-status")).toHaveText("Pending");

  // Check the items.
  await row.getByRole("button", { name: "Show items SO/26-27/31" }).click();
  const items = page.getByTestId("dispatch-items").filter({ visible: true });
  await expect(items).toContainText("MR50");
  await expect(items.locator("tbody tr")).toHaveCount(2);

  // Start: pick the staff.
  await row.getByRole("button", { name: "Start dispatch SO/26-27/31" }).click();
  const dialog = page.getByRole("dialog", { name: "Start dispatch" });
  await dialog.getByLabel("Dispatch staff").fill("ramesh");
  await dialog.getByRole("button", { name: "Start" }).click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name.startsWith("sale_orders")).length)
    .toBe(1);
  const start = backend.calls.find((c) => c.kind === "update" && c.name.startsWith("sale_orders"))!.body as Record<string, unknown>;
  expect(start).toMatchObject({ dispatch_status: "in_process", dispatch_staff: "RAMESH", dispatch_staff_id: "emp-1" });
  expect(typeof start.dispatch_started_at).toBe("string");

  // Dispatching tab: mark the other order delivered.
  await page.getByTestId("dispatch-tab-in_process").filter({ visible: true }).click();
  const row2 = page.getByTestId("dispatch-row").filter({ visible: true }).filter({ hasText: "SO/26-27/30" });
  await expect(row2.getByTestId("dispatch-staff")).toContainText("SURESH");
  await expect(row2.getByTestId("dispatch-status")).toHaveText("Dispatching");
  await row2.getByRole("button", { name: "Mark delivered SO/26-27/30" }).click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name.startsWith("sale_orders")).length)
    .toBe(2);
  const delivered = backend.calls.filter((c) => c.kind === "update" && c.name.startsWith("sale_orders"))[1].body as Record<string, unknown>;
  expect(delivered).toMatchObject({ dispatch_status: "delivered" });
  expect(typeof delivered.delivered_at).toBe("string");

  // Download opens the sale order print / PDF.
  await row2.getByRole("button", { name: "Download SO/26-27/30" }).click();
  await expect(page.getByRole("alertdialog").filter({ hasText: /Download PDF|Print/ }).first()).toBeVisible({ timeout: 15_000 });
});
