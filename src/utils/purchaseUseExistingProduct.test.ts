import { describe, expect, it } from "vitest";
import {
  buildUseExistingProductConfirmMessage,
  purchaseLinePricesDiffer,
  purchaseLinePricesFromUseExisting,
} from "@/utils/purchaseUseExistingProduct";

describe("purchaseUseExistingProduct", () => {
  it("detects meaningful sale/pur price drift vs stored variant", () => {
    expect(
      purchaseLinePricesDiffer(
        { pur_price: 200, sale_price: 250 },
        { pur_price: 180, sale_price: 200 },
      ),
    ).toBe(true);
  });

  it("treats tiny rounding differences as a match", () => {
    expect(
      purchaseLinePricesDiffer(
        { pur_price: 200, sale_price: 250.004 },
        { pur_price: 200, sale_price: 250 },
      ),
    ).toBe(false);
  });

  it("keeps user-typed prices on the purchase line", () => {
    expect(
      purchaseLinePricesFromUseExisting(
        { barcode: "8901326331101", pur_price: 524, sale_price: 749 },
        { pur_price: 510, sale_price: 729, mrp: 0 },
      ),
    ).toEqual({ pur_price: 524, sale_price: 749, mrp: 0 });
  });

  it("builds confirmation copy for price drift", () => {
    const message = buildUseExistingProductConfirmMessage(
      { pur_price: 180, sale_price: 200 },
      { pur_price: 200, sale_price: 250 },
    );
    expect(message).toContain("₹200");
    expect(message).toContain("₹250");
    expect(message).toContain("stored price");
  });
});
