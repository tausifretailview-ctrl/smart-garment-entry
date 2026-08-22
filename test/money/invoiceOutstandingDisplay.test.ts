import { describe, expect, it } from "vitest";
import {
  invoiceOutstandingAmount,
  saleReturnAdjustAmount,
} from "@/utils/recordInvoiceDashboardCashPayment";

describe("P0-3 invoice outstanding — sale_return_adjust only", () => {
  it("uses sale_return_adjust, not legacy credit_applied mirror", () => {
    const inv = {
      id: "s1",
      sale_number: "INV/26-27/1",
      net_amount: 10_000,
      paid_amount: 2_000,
      sale_return_adjust: 3_000,
    };
    expect(invoiceOutstandingAmount(inv)).toBe(5_000);
  });

  it("does not double-count when credit_applied legacy mirror exceeds SRA", () => {
    const withLegacyMirror = {
      id: "s2",
      sale_number: "INV/26-27/2",
      net_amount: 10_000,
      paid_amount: 0,
      sale_return_adjust: 2_000,
      credit_applied: 6_000,
    } as Parameters<typeof invoiceOutstandingAmount>[0] & { credit_applied: number };
    expect(invoiceOutstandingAmount(withLegacyMirror)).toBe(8_000);
  });

  it("respects precomputed outstanding field when present", () => {
    expect(
      invoiceOutstandingAmount({
        id: "s3",
        sale_number: "INV/26-27/3",
        net_amount: 5_000,
        paid_amount: 1_000,
        sale_return_adjust: 500,
        outstanding: 42,
      }),
    ).toBe(42);
  });

  it("saleReturnAdjustAmount reads sale_return_adjust only", () => {
    expect(saleReturnAdjustAmount({ sale_return_adjust: 1500 })).toBe(1500);
    expect(saleReturnAdjustAmount({ sale_return_adjust: null })).toBe(0);
  });
});
