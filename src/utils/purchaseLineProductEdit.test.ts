import { describe, expect, it } from "vitest";
import {
  buildPurchaseLinePatchFromProductEdit,
  purchaseLineMatchesProductEdit,
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
});
