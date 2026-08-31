import { describe, expect, it } from "vitest";
import { mobileInvoicePaymentBadge } from "./mobileInvoicePaymentBadge";

describe("mobileInvoicePaymentBadge", () => {
  it("maps DB completed + fully paid to Paid (not Pending)", () => {
    expect(mobileInvoicePaymentBadge("completed", 0, 1250)).toEqual({
      label: "Paid",
      tone: "paid",
    });
  });

  it("treats paid_amount covering the bill as Paid even if status is stale pending", () => {
    expect(mobileInvoicePaymentBadge("pending", 0, 1250)).toEqual({
      label: "Paid",
      tone: "paid",
    });
  });

  it("keeps Partial when some amount is still due", () => {
    expect(mobileInvoicePaymentBadge("partial", 200, 1050)).toEqual({
      label: "Partial",
      tone: "partial",
    });
  });

  it("keeps Pending when nothing is paid", () => {
    expect(mobileInvoicePaymentBadge("pending", 1250, 0)).toEqual({
      label: "Pending",
      tone: "pending",
    });
  });
});
