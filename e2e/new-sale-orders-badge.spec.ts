import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Sale Order Dashboard menu badge (Nov 2026): like missed calls, the number of orders received
 * since the dashboard was last opened; orders the user booked themselves do not count. Opening
 * the dashboard clears it.
 */
const seenAt = "2026-11-20T08:00:00.000Z";
const base = {
  organization_id: E2E_ORG_ID, order_date: "2026-11-20", customer_id: null, customer_phone: "9820567827",
  net_amount: 1000, gross_amount: 1000, gst_amount: 0, status: "pending", deleted_at: null, sale_order_items: [],
  customer_accepted: false, acceptance_status: null,
};
const orders = [
  { ...base, id: "so-old", order_number: "SO/1", customer_name: "OLD", created_at: "2026-11-19T09:00:00Z", created_by: "salesman-1" },
  { ...base, id: "so-a", order_number: "SO/2", customer_name: "A", created_at: "2026-11-20T09:00:00Z", created_by: "salesman-1" },
  { ...base, id: "so-b", order_number: "SO/3", customer_name: "B", created_at: "2026-11-20T09:05:00Z", created_by: null },
  { ...base, id: "so-c", order_number: "SO/4", customer_name: "C", created_at: "2026-11-20T09:10:00Z", created_by: "salesman-2" },
  // Booked by this user: not a "received" order.
  { ...base, id: "so-own", order_number: "SO/5", customer_name: "OWN", created_at: "2026-11-20T09:20:00Z", created_by: E2E_USER_ID },
];

test("Sale Order Dashboard menu shows new orders like missed calls; opening it clears the count", async ({ page, backend }) => {
  backend.addRows("sale_orders", orders);
  await page.addInitScript(
    ({ key, value }) => {
      if (!sessionStorage.getItem("__e2e_seeded")) {
        sessionStorage.setItem("__e2e_seeded", "1");
        localStorage.setItem(key, value);
      }
    },
    { key: `saleOrdersSeenAt:${E2E_ORG_ID}:${E2E_USER_ID}`, value: seenAt },
  );
  // The mock backend applies only eq filters: answer the badge's count read like the database.
  await page.route(/\/rest\/v1\/sale_orders\?.*created_at=gt\./, (route) => {
    const url = new URL(route.request().url());
    const since = (url.searchParams.get("created_at") || "").replace(/^gt\./, "");
    const n = orders.filter(
      (o) => o.created_at > since && (o.created_by === null || o.created_by !== E2E_USER_ID),
    ).length;
    return route.fulfill({
      status: 200,
      body: "",
      headers: { "content-range": `*/${n}`, "access-control-allow-origin": "*", "access-control-expose-headers": "content-range" },
    });
  });

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice-dashboard`);
  const badge = page.getByTestId("new-sale-orders-badge").filter({ visible: true });
  await expect(badge).toHaveText("3", { timeout: 60_000 });

  await page.getByRole("link", { name: /Sale Order Dashboard/ }).filter({ visible: true }).first().click();
  await expect(page.getByLabel("Acceptance SO/2").filter({ visible: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("new-sale-orders-badge")).toHaveCount(0, { timeout: 15_000 });
  const saved = await page.evaluate((k) => localStorage.getItem(k), `saleOrdersSeenAt:${E2E_ORG_ID}:${E2E_USER_ID}`);
  expect(saved && saved > seenAt).toBe(true);
});
