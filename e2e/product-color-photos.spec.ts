import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG, E2E_USER_ID } from "./support/mockBackend";

/**
 * Product Master → Photos (Nov 2026): one photo per product colour — not per size or MRP —
 * added on its card or imported in bulk by file name; Field Sales shows them on the size sheet.
 */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
const card = (product_id: string, product_name: string, color: string, extra: Record<string, unknown> = {}) => ({
  product_id, product_name, brand: "RED CHEIF", category: "CHAPPAL", style: null, color, image_url: null, product_image_url: null,
  sizes: "8, 9, 10", stock_qty: 12, total_count: 3, all_count: 3, with_photo_count: 1, ...extra,
});
const cards = [
  card("p-rc", "RC 5001", "BROWN"),
  card("p-rc", "RC 5001", "BLACK", { image_url: "https://cdn.example.com/rc-black.jpg" }),
  card("p-mr", "MR50", "TAN", { brand: "A WALK" }),
];

/** Storage: uploads succeed; the saved photos are served as a blank image. Registered after the
 * mock backend (it answers every other request) so these routes win. */
async function stubStorage(page: import("@playwright/test").Page) {
  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
  await page.route(/\/storage\/v1\/object\//, (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 200, headers: cors, body: "" });
    if (method === "GET") return route.fulfill({ contentType: "image/png", body: PNG, headers: cors });
    return route.fulfill({ json: { Key: "product-images/x.jpg", Id: "1" }, headers: cors });
  });
  await page.route("https://cdn.example.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: PNG, headers: { "access-control-allow-origin": "*" } }),
  );
}

test("Photos tab: a card per colour, add a photo by clicking a card, progress shown", async ({ page, backend }) => {
  backend.onRpc("get_product_color_cards", () => cards);
  await stubStorage(page);
  await page.goto(`/${E2E_ORG_SLUG}/product-master`);
  await page.getByRole("tab", { name: /Photos/ }).filter({ visible: true }).click({ timeout: 60_000 });

  const grid = page.getByTestId("product-color-photos").filter({ visible: true });
  await expect(grid.getByTestId("color-photo-card")).toHaveCount(3);
  await expect(grid.getByTestId("photo-progress-text")).toHaveText("1 of 3 colours have a photo");
  // No sizes / MRP split: one card per colour.
  await expect(grid.getByTestId("color-photo-card").filter({ hasText: "RC 5001" })).toHaveCount(2);

  await grid.getByLabel("Photo file RC 5001 BROWN").setInputFiles({ name: "brown.png", mimeType: "image/png", buffer: PNG });
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name.startsWith("product_color_images")).length)
    .toBe(1);
  expect(backend.calls.find((c) => c.kind === "insert" && c.name.startsWith("product_color_images"))!.body).toMatchObject({
    organization_id: E2E_ORG_ID,
    product_id: "p-rc",
    color: "BROWN",
    image_url: expect.stringContaining(`/product-images/${E2E_ORG_ID}/p-rc/colour-brown-`),
  });
  // The product had no main photo: it gets this one too (catalogue, reports).
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "update" && c.name.startsWith("products")).length)
    .toBe(1);
});

test("Import photos: file names matched to product colours, then uploaded", async ({ page, backend }) => {
  backend.onRpc("get_product_color_cards", (args) => {
    const q = String(args.p_search ?? "").toUpperCase();
    return q ? cards.filter((c) => c.product_name.toUpperCase().includes(q)) : cards;
  });
  await stubStorage(page);
  await page.goto(`/${E2E_ORG_SLUG}/product-master`);
  await page.getByRole("tab", { name: /Photos/ }).filter({ visible: true }).click({ timeout: 60_000 });
  await page.getByRole("button", { name: "Import photos" }).filter({ visible: true }).click();

  const dialog = page.getByRole("dialog", { name: "Import photos" });
  await dialog.getByLabel("Photo files").setInputFiles([
    { name: "RC 5001 BROWN.jpg", mimeType: "image/png", buffer: PNG },
    { name: "mr50.png", mimeType: "image/png", buffer: PNG },
    { name: "XYZ 99 RED.jpg", mimeType: "image/png", buffer: PNG },
  ]);
  const rows = dialog.getByTestId("photo-import-row");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("→ RC 5001 · BROWN");
  await expect(rows.nth(1)).toContainText("→ MR50 · TAN");
  await expect(rows.nth(2)).toContainText("No product colour with this name");

  await dialog.getByRole("button", { name: "Upload 2 photos" }).click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name.startsWith("product_color_images")).length)
    .toBe(2);
  const saved = backend.calls
    .filter((c) => c.kind === "insert" && c.name.startsWith("product_color_images"))
    .map((c) => (c.body as { product_id: string; color: string }))
    .map((b) => `${b.product_id}|${b.color}`)
    .sort();
  expect(saved).toEqual(["p-mr|TAN", "p-rc|BROWN"]);
});

test.describe("Field Sales", () => {
  test.use({ viewport: { width: 360, height: 760 } });

  test("booking an order: each colour card on the size sheet shows its photo", async ({ page, backend }) => {
    const product = {
      id: "p1", organization_id: E2E_ORG_ID, product_name: "PUL206", brand: "PUMA STYLE", category: "FOOTWEAR", style: null, color: null,
      gst_per: 5, size_group_id: null, image_url: null, product_type: "goods", status: "active", deleted_at: null, default_sale_price: 499,
    };
    const variants = ["BK", "PISTA"].flatMap((color) =>
      [6, 7].map((size) => ({
        id: `v-${color}-${size}`, product_id: "p1", organization_id: E2E_ORG_ID, size: String(size), color, barcode: `${color}${size}`,
        sale_price: 499, mrp: 699, pur_price: 300, stock_qty: 5, active: true, deleted_at: null, products: product,
      })),
    );
    backend
      .addRows("employees", [{ id: "e1", organization_id: E2E_ORG_ID, user_id: E2E_USER_ID, employee_name: "JAVED BHAI", field_sales_access: true, status: "active", deleted_at: null }])
      .addRows("customers", []).addRows("sale_orders", []).addRows("sale_order_items", [])
      .addRows("products", [product]).addRows("product_variants", variants)
      .addRows("product_color_images", [
        { id: "ci1", organization_id: E2E_ORG_ID, product_id: "p1", color: "BK", image_url: "https://cdn.example.com/pul206-bk.jpg" },
      ]);
    backend.onRpc("peek_sale_order_number", () => "SO/26-27/1");
    await stubStorage(page);

    await page.goto(`/${E2E_ORG_SLUG}/salesman`);
    await expect(page.getByTestId("fs-home")).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("fs-nav-new-order").click();
    await page.getByTestId("fs-product-search").fill("PUL");
    // No main photo: the list shows the colour photo.
    const results = page.getByTestId("fs-product-results");
    await expect(results.locator("img")).toHaveAttribute("src", "https://cdn.example.com/pul206-bk.jpg");
    await results.getByText("PUL206").click();

    const sheet = page.getByTestId("size-qty-sheet");
    const bk = sheet.getByTestId("size-colour-card").filter({ hasText: "BK" });
    await expect(bk.getByTestId("size-colour-photo")).toBeVisible();
    await expect(sheet.getByTestId("size-colour-card").filter({ hasText: "PISTA" }).getByTestId("size-colour-photo")).toHaveCount(0);
  });
});

test("Filters by brand / category / colour, and a photo is edited (turned) and saved", async ({ page, backend }) => {
  const rpcArgs: Array<Record<string, unknown>> = [];
  backend.onRpc("get_product_color_cards", (args) => {
    rpcArgs.push(args);
    const b = String(args.p_brand ?? "").toUpperCase();
    return b ? cards.filter((c) => c.brand === b).map((c) => ({ ...c, total_count: 1 })) : cards;
  });
  backend.onRpc("get_product_color_filter_options", () => [
    { kind: "brand", value: "RED CHEIF", cards: 2 },
    { kind: "brand", value: "A WALK", cards: 1 },
    { kind: "category", value: "CHAPPAL", cards: 3 },
    { kind: "color", value: "BLACK", cards: 1 },
  ]);
  await stubStorage(page);
  await page.goto(`/${E2E_ORG_SLUG}/product-master`);
  await page.getByRole("tab", { name: /Photos/ }).filter({ visible: true }).click({ timeout: 60_000 });
  const grid = page.getByTestId("product-color-photos").filter({ visible: true });
  await expect(grid.getByTestId("color-photo-card")).toHaveCount(3);

  // Brand filter.
  await grid.getByTestId("photo-filter-brand").getByRole("combobox").click();
  await page.getByRole("button", { name: "A WALK" }).filter({ visible: true }).click();
  await expect(grid.getByTestId("color-photo-card")).toHaveCount(1);
  await expect(grid.getByTestId("color-photo-card")).toContainText("MR50");
  await expect.poll(() => rpcArgs[rpcArgs.length - 1]?.p_brand).toBe("A WALK");
  await grid.getByRole("button", { name: "Clear filters" }).click();
  await expect(grid.getByTestId("color-photo-card")).toHaveCount(3);

  // "With photo" is there once the filters SQL has been run.
  await grid.getByRole("button", { name: "With photo" }).click();
  await expect.poll(() => rpcArgs[rpcArgs.length - 1]?.p_photo).toBe("with");
  await grid.getByRole("button", { name: "All", exact: true }).click();

  // Edit: always on the card (no hover needed), turn right, save.
  await grid.getByRole("button", { name: "Edit photo RC 5001 BLACK" }).click();
  const editor = page.getByRole("dialog", { name: "Edit photo" });
  await expect(editor.getByTestId("photo-edit-canvas")).toBeVisible();
  await editor.getByRole("button", { name: "Turn right" }).click();
  await editor.getByRole("button", { name: "Save photo" }).click();
  await expect
    .poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name.startsWith("product_color_images")).length)
    .toBe(1);
  expect(backend.calls.find((c) => c.kind === "insert" && c.name.startsWith("product_color_images"))!.body).toMatchObject({
    product_id: "p-rc",
    color: "BLACK",
    image_url: expect.stringContaining("/colour-black-"),
  });
  await expect(editor).toHaveCount(0);
  // Change is also always on the card.
  await expect(grid.getByRole("button", { name: "Change photo RC 5001 BLACK" })).toBeVisible();
});

