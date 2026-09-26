import { describe, expect, it } from "vitest";
import {
  groupPurchaseSearchByProductMaster,
  purchaseGroupMrpFilter,
  purchaseSearchRateLabels,
  purchaseStyleKey,
} from "./purchaseProductSearchGroup";

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

  it("merges different colours into one master row", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ color: "BK", barcode: "1" }),
      shirt({ id: "v2", color: "WH", barcode: "2" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupedVariantCount).toBe(2);
    expect(grouped[0].color).toBe("");
  });

  it("keeps different product names separate", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ product_name: "SHIRT", barcode: "1" }),
      shirt({ id: "v2", product_name: "SHIRT-TEST", barcode: "2" }),
      shirt({ id: "v3", product_name: "SHIRT-TEST-2", barcode: "3" }),
    ]);
    expect(grouped).toHaveLength(3);
    expect(grouped.map((g) => g.product_name).sort()).toEqual([
      "SHIRT",
      "SHIRT-TEST",
      "SHIRT-TEST-2",
    ]);
  });

  it("splits KS FOOTWEAR BHG73 into two cards when showMrp and MRP tiers differ", () => {
    const grouped = groupPurchaseSearchByProductMaster(
      [
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
      ],
      { showMrp: true },
    );
    expect(grouped).toHaveLength(2);
    const mrps = grouped.map((g) => g.mrp).sort((a, b) => (a || 0) - (b || 0));
    expect(mrps).toEqual([179.5, 244.5]);
    expect(grouped.every((g) => g.groupedMrpTierCount === 2)).toBe(true);
    const opening = grouped.find((g) => g.mrp === 179.5);
    const relaxo = grouped.find((g) => g.mrp === 244.5);
    expect(opening?.groupedVariantCount).toBe(1);
    expect(relaxo?.groupedVariantCount).toBe(2);
    expect(purchaseGroupMrpFilter(opening!)).toBe(179.5);
    expect(purchaseGroupMrpFilter(relaxo!)).toBe(244.5);
  });

  it("does not split by MRP when showMrp is false even if MRP values differ", () => {
    const grouped = groupPurchaseSearchByProductMaster(
      [
        shirt({ id: "a", mrp: 100, size: "6" }),
        shirt({ id: "b", mrp: 200, size: "7" }),
      ],
      { showMrp: false },
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupedVariantCount).toBe(2);
    expect(grouped[0].groupedMrpTierCount).toBe(1);
    expect(purchaseGroupMrpFilter(grouped[0])).toBeUndefined();
  });

  it("does not split by MRP when showMrp is omitted (defaults off)", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "a", mrp: 100, size: "6" }),
      shirt({ id: "b", mrp: 200, size: "7" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupedMrpTierCount).toBe(1);
  });

  it("still collapses same-MRP sizes into one row when showMrp is on", () => {
    const grouped = groupPurchaseSearchByProductMaster(
      [
        shirt({ id: "s6", size: "6", mrp: 244.5, pur_price: 148.33 }),
        shirt({ id: "s7", size: "7", mrp: 244.5, pur_price: 148.33 }),
        shirt({ id: "s8", size: "8", mrp: 244.5, pur_price: 148.33 }),
        shirt({ id: "s10", size: "10", mrp: 244.5, pur_price: 148.33 }),
      ],
      { showMrp: true },
    );
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupedVariantCount).toBe(4);
    expect(grouped[0].mrp).toBe(244.5);
    expect(grouped[0].groupedMrpTierCount).toBe(1);
    expect(purchaseGroupMrpFilter(grouped[0])).toBeUndefined();
  });

  it("flags salePricesDiffer when collapsed variants have different sale prices", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "a", size: "6", sale_price: 200, color: "BK" }),
      shirt({ id: "b", size: "7", sale_price: 250, color: "WH" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].salePricesDiffer).toBe(true);
  });

  it("still gives MRP/Buy/Sale labels when sizes in one MRP tier have different rates", () => {
    const grouped = groupPurchaseSearchByProductMaster(
      [
        shirt({ id: "a", size: "3", mrp: 279.5, pur_price: 160, sale_price: 185 }),
        shirt({ id: "b", size: "9", mrp: 279.5, pur_price: 169.57, sale_price: 195.65 }),
        shirt({ id: "c", size: "7", mrp: 309.5, pur_price: 187.86, sale_price: 216.65 }),
      ],
      { showMrp: true },
    );
    expect(grouped).toHaveLength(2);
    const tier = grouped.find((g) => g.mrp === 279.5)!;
    expect(tier.salePricesDiffer).toBe(true);
    expect(purchaseSearchRateLabels(tier)).toEqual({
      mrp: "₹279.50",
      buy: "₹160.00 – ₹169.57",
      sale: "₹185.00 – ₹195.65",
    });
  });

  it("gives single-value labels when all rates match", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "a", size: "6", mrp: 300 }),
      shirt({ id: "b", size: "7", mrp: 300 }),
    ]);
    expect(purchaseSearchRateLabels(grouped[0])).toEqual({
      mrp: "₹300.00",
      buy: "₹100.00",
      sale: "₹200.00",
    });
  });

  it("does not flag salePricesDiffer when all sale prices match", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "a", size: "6", sale_price: 200 }),
      shirt({ id: "b", size: "7", sale_price: 200 }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].salePricesDiffer).toBe(false);
  });

  it("collects groupedProductIds across duplicate masters in one style group", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ id: "a", product_id: "p1", size: "6", color: "BK" }),
      shirt({ id: "b", product_id: "p2", size: "7", color: "WH" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].groupedProductIds?.sort()).toEqual(["p1", "p2"]);
  });

  it("purchaseStyleKey ignores color", () => {
    expect(
      purchaseStyleKey({ product_name: "SHIRT", brand: "RLX", style: "PUL" }),
    ).toBe(
      purchaseStyleKey({ product_name: " shirt ", brand: "Rlx", style: "pul" }),
    );
  });
});
