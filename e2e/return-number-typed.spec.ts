import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Settings -> Purchase -> "Allow typing the return number": Sale Return shows the next SR
 * number first. Switch off: the box is read-only. Switch on: a number the user types goes to
 * the one-step save as manual_return_number (the database keeps it), and the series is not
 * asked for another number.
 */

const product = {
  id: "p1",
  organization_id: E2E_ORG_ID,
  product_name: "COTTON SHIRT",
  brand: "ACME",
  category: "SHIRTS",
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
  opening_qty: 10,
  active: true,
  deleted_at: null,
  products: product,
};
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

test("switch off: the shown SR number cannot be changed", async ({ page, backend }) => {
  backend.onRpc("generate_sale_return_number", () => "SR/26-27/8");
  await page.goto(`/${E2E_ORG_SLUG}/sale-return-entry`);
  const box = page.getByTestId("sale-return-number");
  await expect(box).toHaveValue("SR/26-27/8", { timeout: 60_000 });
  await expect(box).toHaveAttribute("readonly", "");
});

test("switch on: a typed SR number is saved as typed", async ({ page, backend }) => {
  backend.tables.settings[0].purchase_settings = { manual_return_number: true };
  backend.addRows("products", [product]).addRows("product_variants", [variant]).addRows("sale_items", [soldLine]);
  backend.onRpc("generate_sale_return_number", () => "SR/26-27/8");
  backend.onRpc("get_sold_variant_ids", () => [{ product_id: "p1", variant_id: "v1" }]);
  backend.onRpc("save_return_with_items_atomic", (args) => {
    const header = args.p_header as Record<string, unknown>;
    const number = String(header.manual_return_number || "SR/26-27/8");
    return {
      return: { ...header, id: "ret-1", return_number: number },
      return_number: number,
      items_inserted: (args.p_items as unknown[]).length,
    };
  });

  await page.goto(`/${E2E_ORG_SLUG}/sale-return-entry`);
  const box = page.getByTestId("sale-return-number");
  await expect(box).toHaveValue("SR/26-27/8", { timeout: 60_000 });
  await expect(box).not.toHaveAttribute("readonly", "");
  await box.fill("OLD-SR-145");

  const scan = page.getByPlaceholder("SCAN BARCODE OR SEARCH BY NAME, BRAND, CATEGORY...");
  await scan.fill("100001");
  await scan.press("Enter");
  await expect(page.locator("tr", { hasText: "COTTON SHIRT" })).toHaveCount(1);

  const seriesCallsBeforeSave = backend.rpcCalls("generate_sale_return_number").length;
  await page.getByRole("button", { name: "Save Return" }).click();
  await expect(page.getByText(/Sale return OLD-SR-145 saved successfully/).first()).toBeVisible();

  const saves = backend.rpcCalls("save_return_with_items_atomic");
  expect(saves).toHaveLength(1);
  expect((saves[0] as { p_header: Record<string, unknown> }).p_header).toMatchObject({ manual_return_number: "OLD-SR-145" });
  expect(backend.rpcCalls("generate_sale_return_number")).toHaveLength(seriesCallsBeforeSave);
  // The shop's returns were checked for the number before saving.
  expect(backend.readsOf("sale_returns").some((r) => r.query.includes("return_number=eq.OLD-SR-145"))).toBe(true);
});
