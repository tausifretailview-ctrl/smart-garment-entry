import { describe, expect, it } from "vitest";
import { isLiveSaleReturnVariant, mapSaleReturnLookupRow } from "./saleReturnBarcodeLookup";

describe("isLiveSaleReturnVariant", () => {
  const liveProduct = { id: "p1", status: "active", deleted_at: null };

  it("rejects deleted or inactive variants", () => {
    expect(isLiveSaleReturnVariant({ deleted_at: "2026-08-21", products: liveProduct })).toBe(
      false,
    );
    expect(isLiveSaleReturnVariant({ deleted_at: null, active: false, products: liveProduct })).toBe(
      false,
    );
  });

  it("accepts active variant on an active product", () => {
    expect(
      isLiveSaleReturnVariant({ deleted_at: null, active: true, products: liveProduct }),
    ).toBe(true);
  });
});

describe("mapSaleReturnLookupRow", () => {
  it("keeps the scanned sale barcode on the cart line when live SKU differs", () => {
    const mapped = mapSaleReturnLookupRow(
      {
        id: "v-live",
        product_id: "p1",
        size: "7",
        color: "NAVY",
        sale_price: 307.65,
        stock_qty: 15,
        barcode: "40003197",
        active: true,
        deleted_at: null,
        products: {
          id: "p1",
          product_name: "FL2068",
          brand: "FL",
          category: "MN",
          hsn_code: null,
          gst_per: 5,
          status: "active",
          deleted_at: null,
        },
      },
      "40003251",
      true,
    );
    expect(mapped?.variant.barcode).toBe("40003251");
    expect(mapped?.variant.id).toBe("v-live");
    expect(mapped?.resolvedViaSaleLine).toBe(true);
  });
});
