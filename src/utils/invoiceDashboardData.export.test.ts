import { describe, expect, it } from "vitest";
import {
  filterInvoiceDashboardRowsByPaymentStatus,
  formatInvoiceDashboardPaymentStatusLabel,
} from "./invoiceDashboardData";

describe("formatInvoiceDashboardPaymentStatusLabel", () => {
  it("exports Paid for completed, not the raw pending column", () => {
    expect(formatInvoiceDashboardPaymentStatusLabel({ payment_status: "completed" })).toBe("Paid");
    expect(formatInvoiceDashboardPaymentStatusLabel({ payment_status: "pending" })).toBe("Not Paid");
    expect(formatInvoiceDashboardPaymentStatusLabel({ payment_status: "partial" })).toBe("Partial");
  });
});

describe("filterInvoiceDashboardRowsByPaymentStatus", () => {
  it("drops reconciled Paid bills from Pending + Partial export", () => {
    const rows = [
      { sale_number: "INV/1", payment_status: "pending" },
      { sale_number: "INV/2", payment_status: "partial" },
      { sale_number: "INV/3", payment_status: "completed" },
    ];
    const exported = filterInvoiceDashboardRowsByPaymentStatus(rows, ["pending", "partial"]);
    expect(exported.map((r) => r.sale_number)).toEqual(["INV/1", "INV/2"]);
  });
});
