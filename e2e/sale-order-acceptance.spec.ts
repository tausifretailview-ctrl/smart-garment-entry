import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/** Sale Order dashboard (Nov 2026): the Accept column is a drop-down — Accept, Hold or Reject. */
const base = {
  organization_id: E2E_ORG_ID, order_date: "2026-11-25", customer_id: null, customer_phone: "9820567827",
  gross_amount: 18450, gst_amount: 0, status: "pending", deleted_at: null, sale_order_items: [],
};
const orders = [
  { ...base, id: "so-1", order_number: "SO/26-27/2017", customer_name: "MILAN SHOES", net_amount: 18450, created_at: "2026-11-25T09:00:00Z", customer_accepted: false, acceptance_status: null },
  // Accepted the old way (yes / no flag only).
  { ...base, id: "so-2", order_number: "SO/26-27/2016", customer_name: "STEP IN", net_amount: 9200, created_at: "2026-11-24T09:00:00Z", customer_accepted: true, acceptance_status: null, dispatch_status: "in_process", dispatch_staff: "SURESH" },
  { ...base, id: "so-3", order_number: "SO/26-27/2015", customer_name: "FOOT HUB", net_amount: 5100, created_at: "2026-11-23T09:00:00Z", customer_accepted: false, acceptance_status: "hold" },
];

test("Sale Order: pick Hold from the acceptance drop-down; saved with the old flag in step", async ({ page, backend }) => {
  backend.addRows("sale_orders", orders);
  await page.goto(`/${E2E_ORG_SLUG}/sale-order-dashboard`);
  const first = page.getByLabel("Acceptance SO/26-27/2017").filter({ visible: true });
  await expect(first).toBeVisible({ timeout: 60_000 });
  await expect(first).toContainText("Select");
  await expect(page.getByLabel("Acceptance SO/26-27/2016").filter({ visible: true })).toContainText("Accepted");
  // Accepted orders show where Dispatch has got to.
  await expect(page.getByTestId("sale-order-dispatch-status").filter({ visible: true })).toHaveText("Dispatch: Dispatching · SURESH");
  await expect(page.getByLabel("Acceptance SO/26-27/2015").filter({ visible: true })).toContainText("On hold");

  await first.click();
  await expect(page.getByRole("option", { name: "Accept" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Reject" })).toBeVisible();
  await page.getByRole("option", { name: "Hold" }).click();

  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name.startsWith("sale_orders")).length)
    .toBe(1);
  const update = backend.calls.find((c) => c.kind === "update" && c.name.startsWith("sale_orders"))!;
  expect(update.body).toEqual({ acceptance_status: "hold", customer_accepted: false });
});

test("Sale Order: the On Hold card counts held orders and lists only them", async ({ page, backend }) => {
  backend.addRows("sale_orders", orders);
  // The mock backend sends no count to the browser: answer the card's count read like the database.
  await page.route(/\/rest\/v1\/sale_orders\?.*acceptance_status=eq\.hold/, (route) => {
    if (route.request().method() !== "HEAD") return route.fallback();
    const n = orders.filter((o) => o.acceptance_status === "hold").length;
    return route.fulfill({
      status: 200,
      body: "",
      headers: { "content-range": `*/${n}`, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" },
    });
  });
  await page.goto(`/${E2E_ORG_SLUG}/sale-order-dashboard`);
  const card = page.getByTestId("sale-order-hold-card").filter({ visible: true });
  await expect(card.getByTestId("sale-order-hold-count")).toHaveText("1", { timeout: 60_000 });
  await expect(page.getByLabel("Acceptance SO/26-27/2017").filter({ visible: true })).toBeVisible();

  await card.click();
  await expect(page.getByLabel("Acceptance SO/26-27/2015").filter({ visible: true })).toContainText("On hold");
  await expect(page.getByLabel("Acceptance SO/26-27/2017").filter({ visible: true })).toHaveCount(0);
  await expect(page.getByLabel("Acceptance SO/26-27/2016").filter({ visible: true })).toHaveCount(0);
});
