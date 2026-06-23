import { describe, expect, it } from "vitest";
import {
  formatSupplierOverpaymentConfirmMessage,
  SUPPLIER_OVERPAYMENT_WARN_TOLERANCE_RUPEE,
} from "../src/utils/supplierOverpaymentGuard";

describe("supplierOverpaymentGuard", () => {
  it("uses ₹1 rounding tolerance constant", () => {
    expect(SUPPLIER_OVERPAYMENT_WARN_TOLERANCE_RUPEE).toBe(1);
  });

  it("formats supplier-level overpayment confirm message", () => {
    const msg = formatSupplierOverpaymentConfirmMessage({
      supplierName: "SRK TELELINK",
      payable: 50000,
      proposedSettlement: 75000,
      excess: 25000,
      context: "supplier",
    });
    expect(msg).toContain("SRK TELELINK");
    expect(msg).toContain("₹50,000.00");
    expect(msg).toContain("₹75,000.00");
    expect(msg).toContain("supplier credit");
    expect(msg).toContain("Continue?");
  });

  it("formats selected-bills overpayment confirm message", () => {
    const msg = formatSupplierOverpaymentConfirmMessage({
      supplierName: "ACME",
      payable: 100000,
      proposedSettlement: 60000,
      excess: 10000,
      context: "selected_bills",
      selectedBillsPending: 50000,
    });
    expect(msg).toContain("selected bills need");
    expect(msg).toContain("₹50,000.00");
    expect(msg).toContain("may create supplier credit");
  });
});
