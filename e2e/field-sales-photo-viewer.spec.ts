import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Field Sales (Nov 2026): tapping a product photo while booking an order opened the bare photo
 * link in a new tab, which left the installed app and could not be zoomed. The photo now opens
 * full screen inside the app, fitted to the phone, and closing it returns to where the
 * salesman was (search list or size sheet).
 */

// A tall 1200 x 1600 photo: bigger than the phone, so it must be fitted.
const PHOTO =
  "data:image/svg+xml;utf8," +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#f97316"/></svg>');

const product = {
  id: "p1", organization_id: E2E_ORG_ID, product_name: "PUL206", brand: "PUMA STYLE", category: "FOOTWEAR", style: null, color: null,
  gst_per: 5, size_group_id: null, image_url: PHOTO, product_type: "goods", status: "active", deleted_at: null, default_sale_price: 499,
};
const variants = [3, 4, 5].map((size) => ({
  id: `v-${size}`, product_id: "p1", organization_id: E2E_ORG_ID, size: String(size), color: "BK", barcode: `10${size}`,
  sale_price: 499, mrp: 699, pur_price: 300, stock_qty: 10, active: true, deleted_at: null, products: product,
}));

test.use({ viewport: { width: 360, height: 760 } });

test("Field Sales: a product photo opens full screen in the app, fitted to the phone", async ({ page, backend }) => {
  backend
    .addRows("employees", [{ id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "JAVED BHAI", field_sales_access: true, status: "active", deleted_at: null }])
    .addRows("products", [product])
    .addRows("product_variants", variants);
  backend.onRpc("peek_sale_order_number", () => "SO/26-27/1");

  const popups: string[] = [];
  page.context().on("page", (p) => popups.push(p.url()));

  await page.goto(`/${E2E_ORG_SLUG}/salesman`);
  await expect(page.getByTestId("fs-home")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("fs-nav-new-order").click();
  await page.getByTestId("fs-product-search").fill("PUL");
  const results = page.getByTestId("fs-product-results");
  await expect(results.getByText("PUL206")).toBeVisible();

  const fitted = async () => {
    const viewer = page.getByTestId("product-photo-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer).toContainText("PUL206");
    const img = viewer.getByTestId("product-photo-image");
    await expect(img).toBeVisible();
    const b = (await img.boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(360.5);
    expect(b.y + b.height).toBeLessThanOrEqual(760.5);
    expect(b.width).toBeGreaterThan(300); // fills the phone width, not a tiny thumbnail
    // Double-tap zooms in; Fit goes back.
    await img.dblclick();
    await expect(viewer.getByRole("button", { name: "Fit" })).toBeVisible();
    await viewer.getByRole("button", { name: "Fit" }).click();
    await viewer.getByTestId("product-photo-close").click();
    await expect(viewer).toBeHidden();
  };

  // 1) Photo in the search list: opens the photo, not the size sheet.
  await results.getByTestId("product-thumb").click();
  await fitted();
  await expect(page.getByTestId("size-qty-sheet")).toHaveCount(0);

  // 2) Photo in the size sheet: opens over the sheet; closing it keeps the sheet open.
  await results.getByText("PUL206").click();
  const sheet = page.getByTestId("size-qty-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByTestId("size-sheet-photo").click();
  await fitted();
  await expect(sheet).toBeVisible();

  // Never left the app for a browser tab.
  expect(popups).toEqual([]);
});
