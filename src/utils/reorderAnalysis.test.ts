import { describe, expect, it } from "vitest";
import {
  daysRemainingTone,
  groupApprovedRowsBySupplier,
  toPurchaseOrderItems,
  type ReorderRowForPo,
} from "./reorderAnalysis";

function row(partial: Partial<ReorderRowForPo> & Pick<ReorderRowForPo, "variantId">): ReorderRowForPo {
  return {
    productId: "p1",
    productName: "TEE",
    size: "M",
    barcode: "1",
    color: "RED",
    approvedQty: 10,
    purPrice: 100,
    gstPercent: 5,
    hsnCode: "6109",
    primarySupplierId: "sup-a",
    primarySupplier: "Vendor A",
    ...partial,
  };
}

describe("daysRemainingTone", () => {
  it("marks under 2 days critical and under 5 warning", () => {
    expect(daysRemainingTone(1.5)).toBe("critical");
    expect(daysRemainingTone(4.9)).toBe("warning");
    expect(daysRemainingTone(5)).toBe("ok");
    expect(daysRemainingTone(null)).toBe("ok");
  });
});

describe("groupApprovedRowsBySupplier", () => {
  it("drops zero qty and rows without a supplier, then groups the rest", () => {
    const groups = groupApprovedRowsBySupplier([
      row({ variantId: "v1", primarySupplierId: "sup-a", approvedQty: 4 }),
      row({ variantId: "v2", primarySupplierId: "sup-a", approvedQty: 2 }),
      row({ variantId: "v3", primarySupplierId: "sup-b", approvedQty: 8 }),
      row({ variantId: "v4", primarySupplierId: null, approvedQty: 9 }),
      row({ variantId: "v5", primarySupplierId: "sup-b", approvedQty: 0 }),
    ]);
    expect([...groups.keys()]).toEqual(["sup-a", "sup-b"]);
    expect(groups.get("sup-a")?.map((r) => r.variantId)).toEqual(["v1", "v2"]);
    expect(groups.get("sup-b")?.map((r) => r.variantId)).toEqual(["v3"]);
  });
});

describe("toPurchaseOrderItems", () => {
  it("maps to PurchaseOrderEntry orderData.purchase_order_items", () => {
    expect(toPurchaseOrderItems([row({ variantId: "v1", approvedQty: 7 })])).toEqual([
      {
        product_id: "p1",
        variant_id: "v1",
        product_name: "TEE",
        size: "M",
        barcode: "1",
        order_qty: 7,
        unit_price: 100,
        gst_percent: 5,
        hsn_code: "6109",
        color: "RED",
      },
    ]);
  });
});
