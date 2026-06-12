import { describe, expect, it } from "vitest";
import { isSaleInvoiceCancelled } from "./saleInvoiceStatus";

describe("isSaleInvoiceCancelled", () => {
  it("detects is_cancelled flag", () => {
    expect(isSaleInvoiceCancelled({ is_cancelled: true, payment_status: "completed" })).toBe(true);
  });

  it("detects legacy payment_status cancelled", () => {
    expect(isSaleInvoiceCancelled({ is_cancelled: false, payment_status: "cancelled" })).toBe(true);
  });

  it("returns false for active invoices", () => {
    expect(isSaleInvoiceCancelled({ is_cancelled: false, payment_status: "completed" })).toBe(false);
    expect(isSaleInvoiceCancelled(null)).toBe(false);
  });
});
