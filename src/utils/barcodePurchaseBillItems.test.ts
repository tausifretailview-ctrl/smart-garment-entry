import { describe, expect, it } from "vitest";
import {
  BARCODE_PRINT_PURCHASE_BILL_QUERY,
  barcodePrintingPathWithBill,
  resolvePurchaseLabelIdentity,
} from "./barcodePurchaseBillItems";

describe("barcodePurchaseBillItems", () => {
  it("builds org-relative barcode printing path with purchaseBillId query", () => {
    const billId = "550e8400-e29b-41d4-a716-446655440000";
    expect(barcodePrintingPathWithBill(billId)).toBe(
      `/barcode-printing?${BARCODE_PRINT_PURCHASE_BILL_QUERY}=${encodeURIComponent(billId)}`,
    );
  });

  it("keeps each purchase barcode's style when the shared product style is older", () => {
    const identity = resolvePurchaseLabelIdentity(
      {
        product_name: "SAREE",
        brand: "BK-THAVKI",
        style: "18565",
        color: "",
        category: "",
      },
      {
        product_name: "SAREE",
        brand: "BK-THAVKI",
        style: "18546",
        color: "",
        category: "SAREE",
      },
    );

    expect(identity.style).toBe("18565");
    expect(identity.product_name).toBe("SAREE");
    expect(identity.brand).toBe("BK-THAVKI");
    expect(identity.category).toBe("SAREE");
  });

  it("falls back to the catalog when the bill line has no style or name", () => {
    expect(
      resolvePurchaseLabelIdentity(
        { product_name: "-", brand: "", style: "  ", color: null, category: "-" },
        { product_name: "SAREE", brand: "BK-THAVKI", style: "18546", color: "RED", category: "" },
      ),
    ).toEqual({
      product_name: "SAREE",
      brand: "BK-THAVKI",
      style: "18546",
      color: "RED",
      category: "",
    });
  });
});
