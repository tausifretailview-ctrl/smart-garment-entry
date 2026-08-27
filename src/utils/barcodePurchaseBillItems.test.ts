import { describe, expect, it } from "vitest";
import {
  BARCODE_PRINT_PURCHASE_BILL_QUERY,
  barcodePrintingPathWithBill,
} from "./barcodePurchaseBillItems";

describe("barcodePurchaseBillItems", () => {
  it("builds org-relative barcode printing path with purchaseBillId query", () => {
    const billId = "550e8400-e29b-41d4-a716-446655440000";
    expect(barcodePrintingPathWithBill(billId)).toBe(
      `/barcode-printing?${BARCODE_PRINT_PURCHASE_BILL_QUERY}=${encodeURIComponent(billId)}`,
    );
  });
});
