import { describe, expect, it } from "vitest";
import { maxSupportedPaid, shouldPersistReconciledPaid } from "@/utils/customerBalanceUtils";

const sale = (net: number, extra: Record<string, number> = {}) => ({ net_amount: net, sale_return_adjust: 0, ...extra });
const split = (cash: number, discount = 0, adv = 0, cn = 0) => ({ cash, cn, adv, discount });

describe("maxSupportedPaid", () => {
  it("VAVIA INV/25-26/746: cash 15,339 + discount 1,007 supports 16,346, not the 19,367 bill", () => {
    expect(maxSupportedPaid(sale(19367), split(15339, 1007))).toBe(16346);
  });

  it("VAVIA INV/25-26/825: cash 3,717 + discount 127 supports 3,844", () => {
    expect(maxSupportedPaid(sale(4225), split(3717, 127))).toBe(3844);
  });

  it("counts counter tender (cash/card/upi columns)", () => {
    expect(maxSupportedPaid(sale(1000, { cash_amount: 300, upi_amount: 200 }), split(0))).toBe(500);
  });

  it("counts a credit note only above the bill's own S/R adjust, and never exceeds the bill", () => {
    expect(maxSupportedPaid(sale(1000, { sale_return_adjust: 400 }), split(0, 0, 0, 400))).toBe(0);
    expect(maxSupportedPaid(sale(1000, { sale_return_adjust: 400 }), split(0, 0, 0, 700))).toBe(300);
    expect(maxSupportedPaid(sale(1000), split(900, 300))).toBe(1000);
  });

  it("no receipts and no tender supports nothing", () => {
    expect(maxSupportedPaid(sale(5000), null)).toBe(0);
  });
});

describe("shouldPersistReconciledPaid", () => {
  it("blocks raising paid to an amount nothing supports", () => {
    expect(shouldPersistReconciledPaid(16346, 19367, 16346)).toBe(false);
  });

  it("allows raising paid up to the supported amount, keeping it, or lowering it", () => {
    expect(shouldPersistReconciledPaid(0, 16346, 16346)).toBe(true);
    expect(shouldPersistReconciledPaid(19367, 19367, 16346)).toBe(true);
    expect(shouldPersistReconciledPaid(19367, 16346, 16346)).toBe(true);
  });
});
