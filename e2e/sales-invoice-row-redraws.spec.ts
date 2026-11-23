import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Sale Bill: typing in one line redraws that line only (speed review item S5). The line rows
 * were drawn inline by the page, so every character redrew every line and its inputs, which
 * lagged on wholesale bills of 100 or more lines.
 *
 * React reports each commit to a DevTools hook; the test installs a small one that counts
 * how many SaleBillLineRow components ran in each commit.
 */
const product = (n: number) => ({
  id: `p${n}`, organization_id: E2E_ORG_ID, product_name: `SHIRT ${n}`, brand: "ACME", category: "SHIRTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
});
const variant = (n: number) => ({
  id: `v${n}`, product_id: `p${n}`, organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode: `10000${n}`,
  sale_price: 100 * n, mrp: 100 * n, pur_price: 50, stock_qty: 50, active: true, deleted_at: null, products: product(n),
});
const LINES = [1, 2, 3, 4, 5, 6];

test("typing a quantity redraws one line row, not all of them", async ({ page, backend }) => {
  backend.addRows("products", LINES.map(product)).addRows("product_variants", LINES.map(variant));
  backend.tables.settings[0].sale_settings = { enable_size_grid_sales: false };

  await page.addInitScript(() => {
    type Fiber = { type?: unknown; flags?: number; alternate?: Fiber | null; child?: Fiber | null; sibling?: Fiber | null };
    const w = window as unknown as { __rowWork: number[]; __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown };
    w.__rowWork = [];
    const isRow = (f: Fiber) => typeof f.type === "function" && (f.type as { name?: string }).name === "SaleBillLineRow";
    w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onScheduleFiberRoot: () => undefined,
      onCommitFiberUnmount: () => undefined,
      onPostCommitFiberRoot: () => undefined,
      onCommitFiberRoot: (_id: number, root: { current: Fiber }) => {
        let worked = 0;
        const stack: Array<Fiber | null | undefined> = [root.current];
        while (stack.length) {
          const fiber = stack.pop();
          if (!fiber) continue;
          // PerformedWork (bit 0): the component function ran in this commit.
          if (isRow(fiber) && ((fiber.flags ?? 0) & 1) === 1) worked += 1;
          stack.push(fiber.sibling, fiber.child);
        }
        if (worked > 0) w.__rowWork.push(worked);
      },
    };
  });

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  const scan = page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  await expect(scan).toBeVisible({ timeout: 60_000 });
  for (const n of LINES) {
    await scan.fill(`10000${n}`);
    await scan.press("Enter");
    await expect(page.locator("tr", { hasText: `10000${n}` })).toHaveCount(1);
  }
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);

  // The hook is live: adding the lines drew rows.
  const drawnWhileAdding = await page.evaluate(() => (window as unknown as { __rowWork: number[] }).__rowWork.length);
  expect(drawnWhileAdding).toBeGreaterThan(0);

  // Type a new quantity, one key at a time, in the line of SHIRT 3.
  const line = page.locator("tr", { hasText: "100003" });
  const qty = line.locator("input.sale-qty-box");
  await qty.click();
  await page.waitForTimeout(300);
  await page.evaluate(() => { (window as unknown as { __rowWork: number[] }).__rowWork = []; });
  await qty.press("Control+a");
  await page.keyboard.type("12", { delay: 60 });
  await expect(line).toContainText("3600.00"); // 12 × 300
  await page.waitForTimeout(300);

  const perCommit = await page.evaluate(() => (window as unknown as { __rowWork: number[] }).__rowWork);
  expect(perCommit.length).toBeGreaterThan(0);
  // Each keystroke redraws the edited line only. (All six redrew before the change.)
  expect(Math.max(...perCommit)).toBe(1);

  // The other lines are untouched and correct.
  await expect(page.locator("tr", { hasText: "100001" })).toContainText("100.00");
  await expect(page.locator("tr", { hasText: "100006" })).toContainText("600.00");

  // Moving the grid cursor to another line redraws the two lines involved, not all six.
  await page.evaluate(() => { (window as unknown as { __rowWork: number[] }).__rowWork = []; });
  await page.locator("tr", { hasText: "100005" }).locator("input.sale-qty-box").click();
  await page.waitForTimeout(300);
  const onMove = await page.evaluate(() => (window as unknown as { __rowWork: number[] }).__rowWork);
  expect(Math.max(...onMove)).toBeLessThanOrEqual(2);
});
