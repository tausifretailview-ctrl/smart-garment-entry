import { test, expect } from "./support/test";
import { E2E_ORG_ID, E2E_ORG_SLUG } from "./support/mockBackend";

/**
 * Master → Product Master (Nov 2026): field lists added one by one, and items typed row by
 * row in a sheet instead of the Add New Product window.
 */
test("Product Master: add a brand to the list, then create two items from the sheet", async ({ page, backend }) => {
  backend.addRows("product_attribute_values", [
    { id: "a1", organization_id: E2E_ORG_ID, kind: "brand", value: "TATA" },
    { id: "a2", organization_id: E2E_ORG_ID, kind: "category", value: "Grocery" },
  ]);
  backend.onRpc("generate_next_barcode", () => "500001");

  const label = (text: string) => page.getByLabel(text, { exact: true }).filter({ visible: true });
  await page.goto(`/${E2E_ORG_SLUG}/product-master`);
  await expect(page.getByRole("heading", { name: "Product Master" }).filter({ visible: true })).toBeVisible({ timeout: 60_000 });

  // Brands list: TATA is there; add PARLE.
  await expect(page.getByTestId("product-master-list-brand").filter({ visible: true })).toContainText("TATA");
  await label("New brand").fill("PARLE");
  await label("New brand").press("Enter");
  await expect.poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "product_attribute_values").length).toBeGreaterThan(0);
  expect(backend.calls.find((c) => c.kind === "insert" && c.name === "product_attribute_values")?.body).toMatchObject({
    organization_id: E2E_ORG_ID, kind: "brand", value: "PARLE",
  });

  // Create products sheet.
  await page.getByRole("tab", { name: "Create products" }).filter({ visible: true }).click();
  await label("Product name row 1").fill("Tata Salt 1kg");
  await label("Brand row 1").fill("TATA");
  await label("Category row 1").fill("Grocery");
  await label("GST % row 1").fill("0");
  await label("MRP row 1").fill("28");
  await label("Barcode row 1").fill("8901058000016");
  await label("Product name row 2").fill("Sugar loose");
  await label("Unit row 2").fill("KG");
  await label("Opening qty row 2").fill("25.5");
  await page.getByTestId("product-master-save").filter({ visible: true }).click();

  await expect.poll(() => backend.calls.filter((c) => c.kind === "insert" && c.name === "product_variants").length).toBe(2);
  const productInserts = backend.calls.filter((c) => c.kind === "insert" && c.name === "products").map((c) => c.body);
  expect(productInserts).toEqual([
    expect.objectContaining({ product_name: "Tata Salt 1kg", brand: "TATA", category: "Grocery", gst_per: 0 }),
    expect.objectContaining({ product_name: "Sugar loose", uom: "KG" }),
  ]);
  const variantInserts = backend.calls.filter((c) => c.kind === "insert" && c.name === "product_variants").map((c) => c.body);
  expect(variantInserts).toEqual([
    expect.objectContaining({ barcode: "8901058000016", barcode_source: "external", mrp: 28, size: "None" }),
    expect.objectContaining({ barcode: "500001", stock_qty: 25.5, opening_qty: 25.5 }),
  ]);
  // Saved rows leave the sheet.
  await expect(label("Product name row 1")).toHaveValue("");
});
