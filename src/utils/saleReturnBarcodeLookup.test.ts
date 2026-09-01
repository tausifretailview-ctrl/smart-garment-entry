import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isLiveSaleReturnVariant,
  mapSaleReturnLookupRow,
  soldQtyOnLoadedSaleReturnBill,
  gateSaleReturnAgainstBillSold,
  gateSaleReturnAgainstHistory,
} from "./saleReturnBarcodeLookup";

const here = dirname(fileURLToPath(import.meta.url));

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

describe("soldQtyOnLoadedSaleReturnBill", () => {
  it("sums matching variant_id or barcode on the loaded bill", () => {
    const items = [
      { variant_id: "v1", barcode: "A", quantity: 1 },
      { variant_id: "v2", barcode: "B", quantity: 2 },
      { variant_id: "v1", barcode: "A", quantity: 1 },
    ];
    expect(soldQtyOnLoadedSaleReturnBill(items, "v1", "A")).toBe(2);
    expect(soldQtyOnLoadedSaleReturnBill(items, "v9", "B")).toBe(2);
    expect(soldQtyOnLoadedSaleReturnBill(items, "v9", "Z")).toBe(0);
  });
});

describe("gateSaleReturnAgainstBillSold", () => {
  it("blocks barcodes that were not on the bill and caps at sold qty", () => {
    expect(gateSaleReturnAgainstBillSold(0, 1)).toBe("not-sold");
    expect(gateSaleReturnAgainstBillSold(1, 1)).toBe("ok");
    expect(gateSaleReturnAgainstBillSold(1, 2)).toBe("over-limit");
  });
});

describe("gateSaleReturnAgainstHistory", () => {
  it("blocks never-sold and fully-returned items, allows remaining qty", () => {
    expect(gateSaleReturnAgainstHistory(0, 0, 1)).toBe("not-sold");
    expect(gateSaleReturnAgainstHistory(3, 0, 1)).toBe("over-limit");
    expect(gateSaleReturnAgainstHistory(3, 2, 2)).toBe("ok");
    expect(gateSaleReturnAgainstHistory(3, 2, 3)).toBe("over-limit");
  });
});

describe("FloatingSaleReturn add-path wiring", () => {
  it("blocks adds via bill and sold-history gates instead of a soft warning", () => {
    const source = readFileSync(resolve(here, "../components/FloatingSaleReturn.tsx"), "utf8");
    expect(source).toContain("countSoldAndReturnedForSaleReturn");
    expect(source).toContain("checkVariantAgainstBill");
    expect(source).toContain("checkVariantAgainstSoldHistory");
    expect(source).toContain("This barcode or product is not in the selected sale.");
    expect(source).toContain("This barcode or product has not been sold");
    expect(source).not.toContain("This item was not found in the specified bill");
  });
});
