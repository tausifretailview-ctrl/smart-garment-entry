import { describe, expect, it } from "vitest";
import { groupPurchaseSearchByProductMaster } from "./purchaseProductSearchGroup";

const shirt = (over: Partial<Parameters<typeof groupPurchaseSearchByProductMaster>[0][0]> = {}) => ({
  id: "v1",
  product_id: "p1",
  product_name: "SHIRT",
  brand: "RLX",
  style: "PUL",
  color: "BK",
  size: "7",
  barcode: "90001001",
  pur_price: 100,
  sale_price: 200,
  ...over,
});

describe("groupPurchaseSearchByProductMaster", () => {
  it("merges barcode/size rows into one product-master row", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "a", size: "7", barcode: "111" }),
      shirt({ id: "b", size: "8", barcode: "222" }),
      shirt({ id: "c", size: "9", barcode: "333" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].barcode).toBe("");
    expect(grouped[0].size).toBe("");
    expect(grouped[0].groupedVariantCount).toBe(3);
    expect(grouped[0].product_name).toBe("SHIRT");
  });

  it("keeps size and barcode on a single-SKU (Free Size) row", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "fs1", size: "Free", barcode: "90001999" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].size).toBe("Free");
    expect(grouped[0].barcode).toBe("90001999");
    expect(grouped[0].groupedVariantCount).toBe(1);
  });

  it("keeps different colours as separate master rows", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ color: "BK", barcode: "1" }),
      shirt({ id: "v2", color: "WH", barcode: "2" }),
    ]);
    expect(grouped).toHaveLength(2);
  });

  it("splits KS FOOTWEAR BHG73 into two cards when MRP tiers differ", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({
        id: "open-8",
        product_id: "p-open",
        product_name: "BHG73",
        brand: "BHG",
        style: "RLX",
        color: "BK",
        size: "8",
        mrp: 179.5,
        pur_price: 108.88,
        sale_price: 125.65,
      }),
      shirt({
        id: "relaxo-6",
        product_id: "p-relaxo",
        product_name: "BHG73",
        brand: "BHG",
        style: "RLX",
        color: "BK",
        size: "6",
        mrp: 244.5,
        pur_price: 148.33,
        sale_price: 244.5,
      }),
      shirt({
        id: "relaxo-7",
        product_id: "p-relaxo",
        product_name: "BHG73",
        brand: "BHG",
        style: "RLX",
        color: "BK",
        size: "7",
        mrp: 244.5,
        pur_price: 148.33,
        sale_price: 244.5,
      }),
    ]);
    expect(grouped).toHaveLength(2);
    const mrps = grouped.map((g) => g.mrp).sort((a, b) => (a || 0) - (b || 0));
    expect(mrps).toEqual([179.5, 244.5]);
    expect(grouped.every((g) => g.groupedMrpTierCount === 2)).toBe(true);
    const opening = grouped.find((g) => g.mrp === 179.5);
    const relaxo = grouped.find((g) => g.mrp === 244.5);
    expect(opening?.groupedVariantCount).toBe(1);
    expect(relaxo?.groupedVariantCount).toBe(2);
  });

  it("still collapses same-MRP sizes into one row", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "s6", size: "6", mrp: 244.5, pur_price: 148.33 }),
      shirt({ id: "s7", size: "7", mrp: 244.5, pur_price: 148.33 }),
      shirt({ id: "s8", size: "8", mrp: 244.5, pur_price: 148.33 }),
      shirt({ id: "s10", size: "10", mrp: 244.5, pur_price: 148.33 }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupedVariantCount).toBe(4);
    expect(grouped[0].mrp).toBe(244.5);
    expect(grouped[0].groupedMrpTierCount).toBe(1);
  });
});
