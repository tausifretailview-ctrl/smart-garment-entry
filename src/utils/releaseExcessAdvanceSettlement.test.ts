import { describe, expect, it } from "vitest";
import { computeReleasableAdvanceExcess } from "@/utils/releaseExcessAdvanceSettlement";

describe("computeReleasableAdvanceExcess", () => {
  it("releases full advance when invoice was advance-paid then fully SRA'd", () => {
    const r = computeReleasableAdvanceExcess({
      netAmount: 12150,
      saleReturnAdjust: 12150,
      advanceVoucherTotal: 12150,
      nonCnReceiptTotal: 12150,
    });
    expect(r.releasable).toBe(12150);
    expect(r.maxRelease).toBe(12150);
  });

  it("releases nothing when advance settles the bill with no SRA", () => {
    const r = computeReleasableAdvanceExcess({
      netAmount: 4750,
      saleReturnAdjust: 0,
      advanceVoucherTotal: 4750,
      nonCnReceiptTotal: 4750,
    });
    expect(r.releasable).toBe(0);
  });

  it("keeps cash settlement and only releases excess advance after partial SRA", () => {
    // net 10k, cash 5k + advance 5k, SRA 5k → can free all 5k advance
    const r = computeReleasableAdvanceExcess({
      netAmount: 10000,
      saleReturnAdjust: 5000,
      advanceVoucherTotal: 5000,
      nonCnReceiptTotal: 10000,
    });
    expect(r.releasable).toBe(5000);
  });

  it("does not release more advance than exists", () => {
    const r = computeReleasableAdvanceExcess({
      netAmount: 10000,
      saleReturnAdjust: 8000,
      advanceVoucherTotal: 2000,
      nonCnReceiptTotal: 10000,
    });
    expect(r.maxRelease).toBe(8000);
    expect(r.releasable).toBe(2000);
  });

  it("ignores sub-rupee noise under tolerance", () => {
    const r = computeReleasableAdvanceExcess({
      netAmount: 1000,
      saleReturnAdjust: 0.25,
      advanceVoucherTotal: 1000,
      nonCnReceiptTotal: 1000,
    });
    expect(r.releasable).toBe(0);
  });
});
