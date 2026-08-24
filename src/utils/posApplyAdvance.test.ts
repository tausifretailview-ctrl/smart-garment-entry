import { describe, expect, it } from "vitest";
import {
  capPosAdvanceApplyAmount,
  POS_ADVANCE_OB_REFUSE_THRESHOLD,
  POS_ADVANCE_OB_TOAST,
  POS_ADVANCE_REFUND_TOAST,
  posAdvanceApplyBlockReason,
  posAdvanceApplyBlockToast,
  posTenderDueAfterAdvance,
} from "./posApplyAdvance";

describe("posAdvanceApplyBlockReason", () => {
  const base = {
    customerId: "cust-1",
    availableAdvanceBalance: 500,
    billRoom: 1000,
    openingBalanceRemaining: 0,
    exchangeRefundDue: 0,
  };

  it("allows apply when customer has unused advance, bill room, and no OB/refund", () => {
    expect(posAdvanceApplyBlockReason(base)).toBeNull();
  });

  it("requires a customer", () => {
    expect(posAdvanceApplyBlockReason({ ...base, customerId: "" })).toBe("no_customer");
    expect(posAdvanceApplyBlockToast("no_customer")).toMatch(/customer/i);
  });

  it("refuses when remaining opening balance is above the threshold", () => {
    expect(
      posAdvanceApplyBlockReason({ ...base, openingBalanceRemaining: 0.02 }),
    ).toBe("ob_remaining");
    expect(
      posAdvanceApplyBlockReason({
        ...base,
        openingBalanceRemaining: POS_ADVANCE_OB_REFUSE_THRESHOLD,
      }),
    ).toBeNull();
    expect(posAdvanceApplyBlockToast("ob_remaining")).toBe(POS_ADVANCE_OB_TOAST);
  });

  it("disables apply in exchange refund mode", () => {
    expect(posAdvanceApplyBlockReason({ ...base, exchangeRefundDue: 100 })).toBe("refund_mode");
    expect(posAdvanceApplyBlockToast("refund_mode")).toBe(POS_ADVANCE_REFUND_TOAST);
  });

  it("blocks when there is no unused booking or no bill room", () => {
    expect(posAdvanceApplyBlockReason({ ...base, availableAdvanceBalance: 0 })).toBe(
      "none_available",
    );
    expect(posAdvanceApplyBlockReason({ ...base, billRoom: 0 })).toBe("no_room");
  });
});

describe("capPosAdvanceApplyAmount", () => {
  it("caps at unused booking remainder", () => {
    expect(
      capPosAdvanceApplyAmount({
        requested: 800,
        availableAdvanceBalance: 500,
        billRoom: 1000,
      }),
    ).toBe(500);
  });

  it("caps at remaining bill (CN already in finalAmount / billRoom)", () => {
    expect(
      capPosAdvanceApplyAmount({
        requested: 800,
        availableAdvanceBalance: 900,
        billRoom: 300,
      }),
    ).toBe(300);
  });

  it("caps at the requested amount when it is the smallest", () => {
    expect(
      capPosAdvanceApplyAmount({
        requested: 120,
        availableAdvanceBalance: 500,
        billRoom: 1000,
      }),
    ).toBe(120);
  });

  it("never returns negative", () => {
    expect(
      capPosAdvanceApplyAmount({
        requested: -50,
        availableAdvanceBalance: 500,
        billRoom: 1000,
      }),
    ).toBe(0);
  });
});

describe("posTenderDueAfterAdvance", () => {
  it("leaves persisted-style net unchanged as the minuend and floors at 0", () => {
    expect(posTenderDueAfterAdvance(1000, 400)).toBe(600);
    expect(posTenderDueAfterAdvance(1000, 1500)).toBe(0);
    expect(posTenderDueAfterAdvance(1000, 0)).toBe(1000);
  });

  it("does not bake advance into the bill net (cashier due is a separate figure)", () => {
    const persistedNet = 1050;
    const advanceApplied = 200;
    expect(posTenderDueAfterAdvance(persistedNet, advanceApplied)).toBe(850);
    expect(persistedNet).toBe(1050);
  });
});
