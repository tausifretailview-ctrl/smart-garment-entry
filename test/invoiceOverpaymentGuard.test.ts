import { describe, expect, it } from "vitest";
import {
  formatInvoiceOverpaymentConfirmMessage,
  INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE,
} from "../src/utils/invoiceOverpaymentGuard";

describe("invoiceOverpaymentGuard", () => {
  it("uses ₹1 rounding tolerance constant", () => {
    expect(INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE).toBe(1);
  });

  it("formats confirm message with invoice, paid, net, amount, excess", () => {
    const msg = formatInvoiceOverpaymentConfirmMessage({
      saleNumber: "INV/26-27/28",
      netAmount: 1000,
      paidSettled: 1000,
      proposedSettlement: 1000,
      excess: 1000,
    });
    expect(msg).toContain("INV/26-27/28");
    expect(msg).toContain("₹1,000.00");
    expect(msg).toContain("exceeds the balance");
    expect(msg).toContain("advance");
    expect(msg).toContain("Continue?");
  });
});
