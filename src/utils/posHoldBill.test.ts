import { describe, expect, it } from "vitest";
import {
  isHoldSaleNumber,
  posBillHasExchangeRefundDue,
  shouldPromoteHoldNumberToPos,
} from "./posHoldBill";

describe("POS Hold vs Mix Payment on S/R exchange refund", () => {
  it("detects Hold/ invoice numbers", () => {
    expect(isHoldSaleNumber("Hold/26-27/2")).toBe(true);
    expect(isHoldSaleNumber("POS/26-27/612")).toBe(false);
    expect(isHoldSaleNumber(null)).toBe(false);
  });

  it("treats return 900 / new bill 700 as refund-due (cannot Hold)", () => {
    expect(posBillHasExchangeRefundDue(-200, 200)).toBe(true);
    expect(posBillHasExchangeRefundDue(0, 200)).toBe(true);
    expect(posBillHasExchangeRefundDue(700, 0)).toBe(false);
  });

  it("promotes Hold/ to POS when Mix/Cash completes, not while still on hold", () => {
    expect(shouldPromoteHoldNumberToPos("Hold/26-27/2", "completed")).toBe(true);
    expect(shouldPromoteHoldNumberToPos("Hold/26-27/2", "partial")).toBe(true);
    expect(shouldPromoteHoldNumberToPos("Hold/26-27/2", "pending")).toBe(true);
    expect(shouldPromoteHoldNumberToPos("Hold/26-27/2", "hold")).toBe(false);
    expect(shouldPromoteHoldNumberToPos("POS/26-27/612", "completed")).toBe(false);
  });
});
