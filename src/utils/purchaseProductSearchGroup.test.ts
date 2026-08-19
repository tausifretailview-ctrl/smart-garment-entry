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

  it("keeps different colours as separate master rows", () => {
    const grouped = groupPurchaseSearchByProductMaster([
      shirt({ color: "BK", barcode: "1" }),
      shirt({ id: "v2", color: "WH", barcode: "2" }),
    ]);
    expect(grouped).toHaveLength(2);
  });
});
