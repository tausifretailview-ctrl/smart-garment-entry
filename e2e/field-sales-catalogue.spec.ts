import { readFileSync } from "node:fs";
import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Field Sales (Nov 2026): salesmen get the Product Catalogue in the app — pick products, then
 * save the PDF or send it on WhatsApp. On by default; the shop can turn it off in Settings → Sale.
 */
const PHOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==";
const product = (id: string, name: string) => ({
  id, organization_id: E2E_ORG_ID, product_name: name, brand: "AURA", category: "KURTA", style: null, color: null,
  image_url: PHOTO, default_sale_price: 999, product_type: "goods", status: "active", deleted_at: null,
});
const variant = (id: string, p: ReturnType<typeof product>, size: string, stock: number) => ({
  id, product_id: p.id, organization_id: E2E_ORG_ID, size, color: "RED", barcode: `B${id}`, sale_price: 1100, mrp: 1500,
  pur_price: 500, stock_qty: stock, active: true, deleted_at: null, products: p,
});
const salesman = { id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "JAVED BHAI", field_sales_access: true, status: "active", deleted_at: null };

test.use({ viewport: { width: 360, height: 760 } });

test("Field Sales: Catalogue from Home, pick products, save PDF and send on WhatsApp", async ({ page, backend }, testInfo) => {
  const silk = product("p1", "SILK KURTA");
  const cotton = product("p2", "COTTON KURTA");
  backend
    .addRows("employees", [salesman])
    .addRows("products", [silk, cotton])
    .addRows("product_variants", [variant("v1", silk, "M", 3), variant("v2", cotton, "L", 2)])
    .addRows("product_images", []);

  await page.goto(`/${E2E_ORG_SLUG}/salesman`);
  await expect(page.getByTestId("fs-home")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("fs-quick-catalogue").click();

  const screen = page.getByTestId("fs-catalogue");
  await expect(screen).toBeVisible();
  // Full-screen flow: no bottom navigation behind the send bar.
  await expect(page.getByRole("navigation", { name: "Field Sales" })).toHaveCount(0);
  await expect(screen.getByTestId("fs-catalogue-card")).toHaveCount(2);
  await expect(screen.getByTestId("fs-catalogue-count")).toHaveText("2 of 2 selected");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Tap a card to leave it out.
  await screen.getByTestId("fs-catalogue-card").filter({ hasText: "COTTON KURTA" }).click();
  await expect(screen.getByTestId("fs-catalogue-count")).toHaveText("1 of 2 selected");
  await page.waitForTimeout(400); // let the card fade finish before the picture
  await page.screenshot({ path: testInfo.outputPath("fs-catalogue.png") });

  // Save the PDF on the phone.
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30_000 }), screen.getByTestId("fs-catalogue-download").click()]);
  const path = testInfo.outputPath("fs-catalogue.pdf");
  await dl.saveAs(path);
  const pdf = readFileSync(path).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  expect(pdf).toContain("SILK KURTA");
  expect(pdf).not.toContain("COTTON KURTA");

  // Send on WhatsApp: where the phone cannot attach the file directly, the PDF is saved and
  // the customer's WhatsApp chat opens.
  await screen.getByTestId("fs-catalogue-options").click();
  await page.locator("#fs-catalogue-phone").fill("98220 12345");
  await page.getByRole("button", { name: "Done" }).click();
  const opened: string[] = [];
  await page.context().route("https://wa.me/**", (route) => {
    opened.push(route.request().url());
    return route.fulfill({ body: "WhatsApp" });
  });
  await screen.getByTestId("fs-catalogue-share").click();
  await expect.poll(() => opened[0] ?? "").toContain("wa.me/919822012345");
  expect(decodeURIComponent(opened[0])).toContain("product catalogue");
});

test("Field Sales: no Catalogue when the shop turned it off", async ({ page, backend }) => {
  backend.addRows("employees", [salesman]);
  backend.tables.settings[0].sale_settings = { field_sales_catalogue: false };
  await page.goto(`/${E2E_ORG_SLUG}/salesman`);
  await expect(page.getByTestId("fs-home")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("fs-quick-my-orders")).toBeVisible();
  await expect(page.getByTestId("fs-quick-catalogue")).toHaveCount(0);
  await page.goto(`/${E2E_ORG_SLUG}/salesman/catalogue`);
  await expect(page.getByText("Catalogue is turned off")).toBeVisible({ timeout: 60_000 });
});
