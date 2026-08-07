import { describe, expect, it } from "vitest";
import {
  formatPaymentExceedsOutstandingMessage,
  INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE,
  paymentExceedsOutstandingCap,
} from "../src/utils/invoiceOverpaymentGuard";

describe("invoiceOverpaymentGuard", () => {
  it("uses ₹1 rounding tolerance constant", () => {
    expect(INVOICE_OVERPAYMENT_WARN_TOLERANCE_RUPEE).toBe(1);
  });

  it("allows exact and within-tolerance overages", () => {
    expect(paymentExceedsOutstandingCap(10_000, 10_000)).toBe(false);
    expect(paymentExceedsOutstandingCap(10_000.5, 10_000)).toBe(false);
    expect(paymentExceedsOutstandingCap(10_001, 10_000)).toBe(false);
  });

  it("blocks when proposed exceeds cap by more than ₹1", () => {
    expect(paymentExceedsOutstandingCap(10_001.01, 10_000)).toBe(true);
    expect(paymentExceedsOutstandingCap(80_000, 10_000)).toBe(true);
  });

  it("formats block message with outstanding cap", () => {
    const msg = formatPaymentExceedsOutstandingMessage(10_000);
    expect(msg).toContain("Amount exceeds total outstanding");
    expect(msg).toContain("₹10,000.00");
    expect(msg).not.toContain("advance");
  });
});
