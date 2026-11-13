import { describe, expect, it } from "vitest";
import { posHasRefundDue, posMixDialogBillAmount, posPaymentKeyRoute, posRefundDueAmount } from "./refundRoute";

describe("posHasRefundDue / posRefundDueAmount", () => {
  it("a negative net or an exchange refund means money goes back", () => {
    expect(posHasRefundDue(-200, 0)).toBe(true);
    expect(posHasRefundDue(0, 150)).toBe(true);
    expect(posHasRefundDue(-0.004, 0)).toBe(false); // half a paisa is not a refund
    expect(posHasRefundDue(0, 0.004)).toBe(false);
    expect(posHasRefundDue(999, 0)).toBe(false);
  });
  it("owes the larger of the negative net and the exchange refund", () => {
    expect(posRefundDueAmount(-200, 0)).toBe(200);
    expect(posRefundDueAmount(0, 150)).toBe(150);
    expect(posRefundDueAmount(-100, 150)).toBe(150);
    expect(posRefundDueAmount(500, 0)).toBe(0);
  });
});

describe("posPaymentKeyRoute", () => {
  it("no refund: every key saves with no cash refund", () => {
    for (const m of ["cash", "card", "upi", "pay_later"] as const) {
      expect(posPaymentKeyRoute(m, 999, 0)).toEqual({ kind: "save", cashExchangeRefund: 0 });
    }
  });
  it("refund due: Cash pays it now; UPI / card / credit open Mix", () => {
    expect(posPaymentKeyRoute("cash", -200, 0)).toEqual({ kind: "save", cashExchangeRefund: 200 });
    expect(posPaymentKeyRoute("cash", 0, 501)).toEqual({ kind: "save", cashExchangeRefund: 501 });
    expect(posPaymentKeyRoute("upi", -200, 0)).toEqual({ kind: "mix" });
    expect(posPaymentKeyRoute("card", 0, 501)).toEqual({ kind: "mix" });
    expect(posPaymentKeyRoute("pay_later", -200, 0)).toEqual({ kind: "mix" });
  });
});

describe("posMixDialogBillAmount", () => {
  it("opens with the refund as a negative figure, else the amount to collect", () => {
    expect(posMixDialogBillAmount(-200, 0, 0)).toBe(-200);
    expect(posMixDialogBillAmount(0, 501, 0)).toBe(-501);
    expect(posMixDialogBillAmount(1000, 0, 400)).toBe(400);
  });
});
