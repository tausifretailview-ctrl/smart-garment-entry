import { describe, expect, it } from "vitest";
import {
  buildPurchaseLinePatchFromProductEdit,
  persistedPurchaseItemIdsForEdit,
  persistedPurchaseItemIdsForProduct,
  purchaseItemBrandSyncRows,
  purchaseItemDbPatchFromLineEdit,
  purchaseLineMatchesProductEdit,
  resolvePurchaseLineBrand,
  type ProductEditFormSnapshot,
} from "./purchaseLineProductEdit";

const form = (overrides: Partial<ProductEditFormSnapshot> = {}): ProductEditFormSnapshot => ({
  product_name: "18602",
  brand: "BK-THAVKI",
  category: "",
  style: "18565",
  color: "",
  hsn_code: "",
  gst_per: 5,
  uom: "NOS",
  purchase_gst_percent: null,
  default_pur_price: 2331,
  default_sale_price: 3665,
  default_mrp: 4310,
  ...overrides,
});

describe("purchaseLineMatchesProductEdit", () => {
  const edited = {
    tempId: "line-4",
    barcode: "670001512",
    skuId: "sku-512",
  };

  it("updates the edited row and the same barcode only", () => {
    expect(
      purchaseLineMatchesProductEdit(
        { temp_id: "line-4", barcode: "670001512", sku_id: "sku-512" },
        edited,
      ),
    ).toBe(true);
    expect(
      purchaseLineMatchesProductEdit(
        { temp_id: "line-other", barcode: "670001512", sku_id: "sku-other" },
        edited,
      ),
    ).toBe(true);
    expect(
      purchaseLineMatchesProductEdit(
        { temp_id: "line-1", barcode: "670001509", sku_id: "sku-509" },
        edited,
      ),
    ).toBe(false);
  });

  it("does not match a sibling variant that only shares the variant id when barcodes differ", () => {
    expect(
      purchaseLineMatchesProductEdit(
        { temp_id: "line-1", barcode: "670001509", sku_id: "sku-512" },
        edited,
      ),
    ).toBe(false);
  });

  it("does not treat a blank barcode as a match for every blank line", () => {
    expect(
      purchaseLineMatchesProductEdit(
        { temp_id: "line-9", barcode: "", sku_id: "" },
        { tempId: "line-4", barcode: "  ", skuId: "" },
      ),
    ).toBe(false);
    expect(
      purchaseLineMatchesProductEdit(
        { temp_id: "line-4", barcode: "", sku_id: "sku-512" },
        { tempId: "line-x", barcode: "", skuId: "sku-512" },
      ),
    ).toBe(true);
  });
});

describe("buildPurchaseLinePatchFromProductEdit", () => {
  it("copies the saved name and edited rates onto a stale bill line", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ default_pur_price: 2400, default_sale_price: 3800 }),
      line: {
        product_name: "SAREE",
        brand: "BK-THAVKI",
        style: "18565",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["default_pur_price", "default_sale_price"]),
    });

    expect(patch).toEqual({
      product_name: "18602",
      pur_price: 2400,
      sale_price: 3800,
    });
  });

  it("leaves the line name alone when it already matches and only applies edited brand", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ product_name: "saree", brand: "NEW-BRAND" }),
      line: {
        product_name: "SAREE",
        brand: "BK-THAVKI",
        style: "18565",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["brand"]),
    });

    expect(patch).toEqual({ brand: "NEW-BRAND" });
  });

  it("does not blank style or brand the user did not edit", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ style: "", brand: "" }),
      line: {
        product_name: "18602",
        brand: "BK-THAVKI",
        style: "18565",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["default_mrp"]),
    });

    expect(patch).toEqual({});
  });

  it("copies the barcode colour onto a bill line that still has the old colour", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ color: "MYSTIC BLUE", product_name: "Y21 5G" }),
      line: {
        product_name: "Y21 5G",
        color: "",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["default_pur_price"]),
    });

    expect(patch.color).toBe("MYSTIC BLUE");
  });

  it("replaces a stale bill colour even when the colour field was not edited again", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ color: "NAVY", product_name: "Y21 5G" }),
      line: {
        product_name: "Y21 5G",
        brand: "BK-THAVKI",
        color: "MYSTIC BLUE",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(),
    });

    expect(patch).toEqual({ color: "NAVY" });
  });

  it("does not wipe a bill colour when the form colour is blank and was not edited", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ color: "  ", product_name: "Y21 5G" }),
      line: {
        product_name: "Y21 5G",
        color: "MYSTIC BLUE",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["default_mrp"]),
    });

    expect(patch.color).toBeUndefined();
  });

  it("copies the product master brand when the bill line still shows the old brand", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({
        product_name: "KURTI PANTS",
        brand: "LANGO",
        category: "HOISERY",
        style: "",
        color: "WHITE",
        default_pur_price: 425,
        default_sale_price: 680,
        default_mrp: 0,
      }),
      line: {
        product_name: "KURTI PANTS",
        brand: "SHINY",
        category: "HOISERY",
        style: "",
        color: "WHITE",
        pur_price: 425,
        sale_price: 680,
        mrp: 0,
      },
      modifiedFields: new Set(),
    });

    expect(patch).toEqual({ brand: "LANGO" });
  });

  it("clears the bill brand when the user clears it", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ brand: "" }),
      line: {
        product_name: "18602",
        brand: "BK-THAVKI",
        style: "18565",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["brand"]),
    });

    expect(patch.brand).toBe("");
  });

  it("clears the bill colour when the user clears it", () => {
    const patch = buildPurchaseLinePatchFromProductEdit({
      form: form({ color: "", product_name: "Y21 5G" }),
      line: {
        product_name: "Y21 5G",
        color: "MYSTIC BLUE",
        pur_price: 2331,
        sale_price: 3665,
        mrp: 4310,
      },
      modifiedFields: new Set(["color"]),
    });

    expect(patch.color).toBe("");
  });
});

describe("resolvePurchaseLineBrand", () => {
  it("uses the product master brand when the bill line still has the old one", () => {
    expect(resolvePurchaseLineBrand("SHINY", "LANGO")).toBe("LANGO");
    expect(resolvePurchaseLineBrand("SHINY", "  ")).toBe("SHINY");
    expect(resolvePurchaseLineBrand("", "LANGO")).toBe("LANGO");
    expect(resolvePurchaseLineBrand("", "")).toBe("");
  });

  it("lists only lines that still store a different brand", () => {
    const masters = new Map<string, string>([
      ["kurti", "LANGO"],
      ["saree", ""],
    ]);
    expect(
      purchaseItemBrandSyncRows(
        [
          { id: "line-1", product_id: "kurti", brand: "SHINY" },
          { id: "line-2", product_id: "kurti", brand: "LANGO" },
          { id: "line-3", product_id: "saree", brand: "BK" },
          { id: "", product_id: "kurti", brand: "SHINY" },
        ],
        masters,
      ),
    ).toEqual([{ id: "line-1", brand: "LANGO" }]);
  });
});

describe("purchase item persistence", () => {
  it("writes colour onto purchase_items and skips unsaved rows", () => {
    expect(purchaseItemDbPatchFromLineEdit({ color: " NAVY ", product_name: "Y21 5G" })).toEqual({
      color: "NAVY",
      product_name: "Y21 5G",
    });
    expect(purchaseItemDbPatchFromLineEdit({ color: "" })).toEqual({ color: null });

    const lines = [
      { temp_id: "saved-imei-1", barcode: "86347684412", sku_id: "sku-1" },
      { temp_id: "saved-imei-2", barcode: "86347684165", sku_id: "sku-2" },
      { temp_id: "draft-row", barcode: "86347684412", sku_id: "sku-1" },
    ];
    expect(
      persistedPurchaseItemIdsForEdit(
        lines,
        { tempId: "saved-imei-1", barcode: "86347684412", skuId: "sku-1" },
        new Set(["saved-imei-1", "saved-imei-2"]),
      ),
    ).toEqual(["saved-imei-1"]);
  });

  it("includes every saved size of the product when the brand changes", () => {
    const lines = [
      { temp_id: "plus", barcode: "150013077", sku_id: "sku-plus", product_id: "kurti" },
      { temp_id: "xl", barcode: "150013078", sku_id: "sku-xl", product_id: "kurti" },
      { temp_id: "other", barcode: "999", sku_id: "sku-other", product_id: "saree" },
      { temp_id: "draft", barcode: "150013079", sku_id: "sku-draft", product_id: "kurti" },
    ];
    expect(
      persistedPurchaseItemIdsForProduct(
        lines,
        "kurti",
        new Set(["plus", "xl", "other"]),
      ),
    ).toEqual(["plus", "xl"]);
  });
});
