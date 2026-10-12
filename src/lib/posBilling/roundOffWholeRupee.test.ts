import { describe, expect, it } from "vitest";
import { computePosBillTotals, snapRoundOffToWholeRupee } from "./billTotals";

describe("snapRoundOffToWholeRupee", () => {
  it("absorbs paise when the cashier types a whole-rupee round-off (VELVET POS/26-27/3121)", () => {
    // Subtotal 8119 − 10% (811.90) = 7307.10; cashier typed Round -7.
    const ro = snapRoundOffToWholeRupee(7307.1, -7);
    expect(ro).toBe(-7.1);
    expect(Math.round((7307.1 + ro) * 100) / 100).toBe(7300);
  });

  it("matches auto round-off when nothing is typed", () => {
    expect(snapRoundOffToWholeRupee(7307.1, 0)).toBe(-0.1);
    expect(snapRoundOffToWholeRupee(1249.6, 0)).toBe(0.4);
  });

  it("leaves an already-whole bill alone", () => {
    expect(snapRoundOffToWholeRupee(3798, 0)).toBe(0);
    expect(snapRoundOffToWholeRupee(3798, -8)).toBe(-8);
  });

  it("works for round-up and for a Net Amount typed with paise", () => {
    expect(snapRoundOffToWholeRupee(7307.1, 3)).toBe(2.9);
    expect(snapRoundOffToWholeRupee(7307.1, 7300.4 - 7307.1)).toBe(-7.1);
  });

  it("feeds a whole-rupee final amount into the bill totals", () => {
    const items = [
      {
        id: "l1",
        barcode: "BC1",
        productName: "Item",
        size: "M",
        color: "",
        quantity: 1,
        mrp: 8119,
        originalMrp: 8119,
        gstPer: 0,
        discountPercent: 0,
        discountAmount: 0,
        unitCost: 8119,
        netAmount: 8119,
        productId: "p1",
        variantId: "v1",
      },
    ] as unknown as Parameters<typeof computePosBillTotals>[0]["items"];
    const base = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 10,
      flatDiscountMode: "percent",
    });
    expect(base.amountBeforeRoundOff).toBeCloseTo(7307.1, 2);
    const roundOff = snapRoundOffToWholeRupee(base.amountBeforeRoundOff, -7);
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 10,
      flatDiscountMode: "percent",
      roundOff,
    });
    expect(Math.round(t.finalAmount * 100) / 100).toBe(7300);
  });
});
