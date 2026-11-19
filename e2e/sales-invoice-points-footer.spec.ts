import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Loyalty points and Redeem sit in the Sale Bill footer after Round Off, not in the
 * customer header (user request), and redeeming still lowers Net Payable.
 */
const customer = {
  id: "cust-1", organization_id: E2E_ORG_ID, customer_name: "RAVI KUMAR", phone: "9876543210",
  opening_balance: 0, points_balance: 327, total_points_earned: 400, deleted_at: null,
};
const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "COTTON SHIRT", brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
};
const variant = {
  id: "v1", product_id: "p1", organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: "100001",
  sale_price: 1000, mrp: 1000, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: product,
};

test("Sale Bill shows points and Redeem in the footer after Round Off", async ({ page, backend }, testInfo) => {
  backend.tables.settings[0].sale_settings = {
    enable_points_system: true,
    points_ratio_amount: 100,
    points_per_ratio: 1,
    enable_points_redemption: true,
    points_redemption_value: 1,
    max_redemption_percent: 50,
    min_points_for_redemption: 1,
  };
  backend.addRows("customers", [customer]).addRows("products", [product]).addRows("product_variants", [variant]);

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  await page.getByRole("combobox").filter({ hasText: /Search customer by name, phone/ }).click();
  await page.getByPlaceholder("Search by name, phone, email...").fill("RAVI");
  await page.getByRole("option", { name: /RAVI KUMAR/ }).click();
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "100001" })).toHaveCount(1);

  const footer = page.locator("footer.entry-page-footer");
  const points = footer.getByTestId("sale-points-redeem");
  await expect(points).toBeVisible();
  await expect(points).toContainText("327 pts");
  await expect(points).toContainText("+10 earn");
  // Nothing left in the header above the item table.
  await expect(page.locator("main").getByText("Redeem:", { exact: true })).toHaveCount(0);

  // Points group comes right after the Round Off input.
  const roundBox = await footer.getByText("Round", { exact: true }).boundingBox();
  const pointsBox = await points.boundingBox();
  expect(roundBox && pointsBox && pointsBox.x > roundBox.x).toBeTruthy();

  const net = footer.getByText("Net Payable").locator("xpath=following-sibling::span[1]");
  const before = await net.textContent();
  await points.getByLabel("Redeem points").fill("100");
  await expect(points).toContainText("-₹100");
  await expect(net).not.toHaveText(before ?? "");

  // Net Payable and the Redeem box stay fully on screen on common desktop widths.
  for (const width of [1366, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const el of [net, points.getByLabel("Redeem points")]) {
      const box = await el.boundingBox();
      expect(box, `visible at ${width}px`).toBeTruthy();
      expect(box!.x + box!.width, `inside ${width}px`).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: testInfo.outputPath(`points-footer-${width}.png`) });
  }
});
