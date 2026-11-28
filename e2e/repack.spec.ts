import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/** Repack (supermarket go-live, Nov 2026): one 50 kg sugar sack into 50 packets of 1 kg. */
const sack = { id: "p-sack", organization_id: E2E_ORG_ID, product_name: "SUGAR 50KG SACK", uom: "NOS", status: "active", deleted_at: null };
const pkt = { ...sack, id: "p-pkt", product_name: "SUGAR 1KG PKT" };
const v = (id: string, p: typeof sack, barcode: string, stock: number, price: number) => ({
  id, product_id: p.id, organization_id: E2E_ORG_ID, size: "None", barcode, stock_qty: stock, opening_qty: stock,
  pur_price: price, active: true, deleted_at: null, products: p,
});

test("Stock Adjustment → Repack: bulk out, packets in, one database step", async ({ page, backend }) => {
  backend.addRows("products", [sack, pkt]).addRows("product_variants", [v("v-sack", sack, "SACK50", 3, 2000), v("v-pkt", pkt, "PKT1", 10, 42)]);
  backend.onRpc("get_stock_reconciliation", () => []);
  backend.onRpc("repack_stock", () => ({ success: true, bill_number: "RPK-20261128-101038", from_stock_after: 2, to_stock_after: 60, to_pur_price: 41.17 }));

  await page.goto(`/${E2E_ORG_SLUG}/stock-adjustment`);
  await page.getByTestId("open-repack").click();
  const dialog = page.getByRole("dialog", { name: "Repack" });
  await expect(dialog).toBeVisible();

  await dialog.getByTestId("repack-from").getByPlaceholder("Scan barcode or type item name").fill("SACK50");
  await dialog.getByRole("button", { name: /SUGAR 50KG SACK/ }).click();
  await dialog.getByLabel(/Quantity taken/).fill("1");
  await dialog.getByLabel(/Packing cost/).fill("50");
  await dialog.getByTestId("repack-to").getByPlaceholder("Scan barcode or type item name").fill("PKT1");
  await dialog.getByRole("button", { name: /SUGAR 1KG PKT/ }).click();
  await dialog.getByLabel(/Packets made/).fill("50");
  await expect(dialog.getByTestId("repack-preview")).toContainText("₹41");

  await dialog.getByRole("button", { name: "Repack", exact: true }).click();
  await expect(dialog).toBeHidden();
  const [call] = backend.rpcCalls("repack_stock");
  expect(call).toMatchObject({
    p_organization_id: E2E_ORG_ID, p_from_variant_id: "v-sack", p_from_qty: 1, p_to_variant_id: "v-pkt", p_to_qty: 50, p_packing_cost: 50,
  });
});
