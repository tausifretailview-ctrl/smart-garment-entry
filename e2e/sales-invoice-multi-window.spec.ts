import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Several Sale Bills at once: Sale Bill 1 has a shirt, "New Window" opens Sale Bill 2 (empty)
 * where a jeans is billed, and Alt+W flips between them — each keeps its own unsaved bill.
 * At most 3 Sale Bill windows; closing Sale Bill 2 forgets its bill.
 */
const product = (id: string, name: string) => ({
  id, organization_id: E2E_ORG_ID, product_name: name, brand: "ACME", category: "GARMENTS", style: null,
  color: "BLUE", hsn_code: "6205", gst_per: 5, uom: "NOS", product_type: "goods", status: "active", deleted_at: null,
});
const shirt = product("p1", "COTTON SHIRT");
const jeans = product("p2", "DENIM JEANS");
const variant = (id: string, p: ReturnType<typeof product>, barcode: string, price: number) => ({
  id, product_id: p.id, organization_id: E2E_ORG_ID, size: "M", color: "BLUE", barcode,
  sale_price: price, mrp: price, pur_price: 500, stock_qty: 10, active: true, deleted_at: null, products: p,
});

test("two Sale Bill windows keep separate bills and switch with Alt+W", async ({ page, backend }) => {
  backend
    .addRows("products", [shirt, jeans])
    .addRows("product_variants", [variant("v1", shirt, "100001", 999), variant("v2", jeans, "200002", 1499)]);

  const scan = () => page.getByPlaceholder("Scan barcode...").filter({ visible: true });
  const line = (barcode: string) => page.locator("tr", { hasText: barcode });
  const addItem = async (barcode: string) => {
    await scan().fill(barcode);
    await scan().press("Enter");
    await expect(line(barcode)).toHaveCount(1);
  };
  const altW = async () => {
    await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
    await page.keyboard.down("Alt");
    await page.keyboard.press("w");
    await page.keyboard.up("Alt");
  };

  await page.goto(`/${E2E_ORG_SLUG}/sales-invoice`);
  await expect(scan()).toBeVisible({ timeout: 60_000 });
  await addItem("100001");
  await expect(page.getByTestId("sale-window-badge")).toHaveCount(0);

  // Sale Bill 2: empty, its own bill.
  await page.getByTestId("sale-new-window").click();
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/sales-invoice\\?w=2$`));
  await expect(page.getByTestId("sale-window-badge")).toHaveText("Window 2");
  await expect(scan()).toBeVisible({ timeout: 60_000 });
  await expect(line("100001")).toHaveCount(0);
  await addItem("200002");

  // Reload keeps Sale Bill 2's bill (kept in this browser tab, not the database draft).
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/sales-invoice\\?w=2$`));
  await expect(scan()).toBeVisible({ timeout: 60_000 });
  await expect(line("200002")).toContainText("DENIM JEANS");

  // Alt+W → Sale Bill 1 with the shirt only.
  await altW();
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/sales-invoice$`));
  await expect(scan()).toBeVisible({ timeout: 60_000 });
  await expect(line("100001")).toContainText("COTTON SHIRT");
  await expect(line("200002")).toHaveCount(0);

  // Alt+W → back to Sale Bill 2 with the jeans only.
  await altW();
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/sales-invoice\\?w=2$`));
  await expect(scan()).toBeVisible({ timeout: 60_000 });
  await expect(line("200002")).toContainText("DENIM JEANS");
  await expect(line("100001")).toHaveCount(0);

  // The switcher lists both Sale Bills.
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.down("Alt");
  await page.keyboard.press("w");
  const switcher = page.getByRole("listbox", { name: "Open windows" });
  await expect(switcher).toBeVisible();
  await expect(switcher.getByText("Sales Invoice 2", { exact: true })).toBeVisible();
  await expect(switcher.getByText("Sales Invoice", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.up("Alt");

  // Sale Bill 3, then no more.
  await page.getByTestId("sale-new-window").click();
  await expect(page).toHaveURL(new RegExp(`/${E2E_ORG_SLUG}/sales-invoice\\?w=3$`));
  await expect(page.getByTestId("sale-window-badge")).toHaveText("Window 3");
  await expect(page.getByTestId("sale-new-window")).toBeDisabled();

  // Close Sale Bill 2 from the switcher: its bill is gone, the others stay.
  const kept = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.endsWith(":sale_invoice:w2")));
  expect(kept.length).toBe(1);
  await page.locator("body").click({ position: { x: 5, y: 5 } }).catch(() => undefined);
  await page.keyboard.down("Alt");
  await page.keyboard.press("w"); // selection starts on the window used before: Sale Bill 2
  await expect(switcher).toBeVisible();
  await expect(switcher.getByRole("option", { selected: true })).toContainText("Sales Invoice 2");
  await page.keyboard.press("Delete");
  await expect(switcher.getByText("Sales Invoice 2", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.up("Alt");
  const left = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.endsWith(":sale_invoice:w2")));
  expect(left).toEqual([]);
  await expect(page.getByTestId("sale-new-window")).toBeEnabled();
});
