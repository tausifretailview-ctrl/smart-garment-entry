import { describe, expect, it } from "vitest";
import {
  EMPTY_MIX_RECEIPT_AMOUNTS,
  allocateMixLegsToLines,
  applyMixAmountEdit,
  formatMixReceiptLabel,
  mixBankProbeMethod,
  mixReceiptLegs,
  mixVoucherSuffix,
  validateMixReceipt,
  type MixReceiptMethod,
} from "./mixReceiptSplit";

describe("mixReceiptLegs / validateMixReceipt", () => {
  it("keeps non-zero legs in Cash, UPI, Card, Bank order", () => {
    const legs = mixReceiptLegs({ cash: "3000", upi: "2552", card: "", bank_transfer: "0" });
    expect(legs).toEqual([
      { method: "cash", amount: 3000 },
      { method: "upi", amount: 2552 },
    ]);
  });

  it("requires the split to equal the amount received", () => {
    const ok = validateMixReceipt({ ...EMPTY_MIX_RECEIPT_AMOUNTS, cash: "3000", upi: "2552" }, 5552);
    expect(ok.ok).toBe(true);
    const short = validateMixReceipt({ ...EMPTY_MIX_RECEIPT_AMOUNTS, cash: "3000" }, 5552);
    expect(short.ok).toBe(false);
    const empty = validateMixReceipt(EMPTY_MIX_RECEIPT_AMOUNTS, 5552);
    expect(empty.ok).toBe(false);
  });
});

describe("applyMixAmountEdit", () => {
  it("fills the remainder into the first untouched box (UPI first)", () => {
    const touched = new Set<MixReceiptMethod>();
    const next = applyMixAmountEdit(
      { ...EMPTY_MIX_RECEIPT_AMOUNTS, cash: "5552" },
      touched,
      "cash",
      "3000",
      5552,
    );
    expect(next.cash).toBe("3000");
    expect(next.upi).toBe("2552");
  });

  it("moves on to Card once UPI was typed by the user", () => {
    const next = applyMixAmountEdit(
      { cash: "3000", upi: "2552", card: "", bank_transfer: "" },
      new Set<MixReceiptMethod>(["cash", "upi"]),
      "upi",
      "2000",
      5552,
    );
    expect(next.card).toBe("552");
  });

  it("does not auto-fill when every other box was typed", () => {
    const next = applyMixAmountEdit(
      { cash: "1", upi: "1", card: "1", bank_transfer: "1" },
      new Set<MixReceiptMethod>(["cash", "upi", "card", "bank_transfer"]),
      "cash",
      "10",
      100,
    );
    expect(next).toEqual({ cash: "10", upi: "1", card: "1", bank_transfer: "1" });
  });
});

describe("allocateMixLegsToLines", () => {
  it("spreads modes over lines in order", () => {
    const out = allocateMixLegsToLines(
      [
        { method: "cash", amount: 3000 },
        { method: "upi", amount: 2000 },
      ],
      [1000, 2500, 1500],
    );
    expect(out).toEqual([
      [{ method: "cash", amount: 1000 }],
      [
        { method: "cash", amount: 2000 },
        { method: "upi", amount: 500 },
      ],
      [{ method: "upi", amount: 1500 }],
    ]);
  });

  it("gives a fully discounted line one zero voucher in the first mode", () => {
    const out = allocateMixLegsToLines([{ method: "upi", amount: 500 }], [0, 500]);
    expect(out[0]).toEqual([{ method: "upi", amount: 0 }]);
    expect(out[1]).toEqual([{ method: "upi", amount: 500 }]);
  });
});

describe("labels", () => {
  it("formats the receipt mode text", () => {
    expect(
      formatMixReceiptLabel([
        { method: "cash", amount: 3000 },
        { method: "upi", amount: 2552 },
      ]),
    ).toBe("Mix (Cash ₹3,000 + UPI ₹2,552)");
  });

  it("asks for a receiving bank only when a non-cash leg exists", () => {
    expect(mixBankProbeMethod({ ...EMPTY_MIX_RECEIPT_AMOUNTS, cash: "10" })).toBe("cash");
    expect(mixBankProbeMethod({ ...EMPTY_MIX_RECEIPT_AMOUNTS, cash: "10", card: "5" })).toBe("upi");
  });

  it("numbers extra mix vouchers B, C, D", () => {
    expect([0, 1, 2, 3].map(mixVoucherSuffix)).toEqual(["", "B", "C", "D"]);
  });
});
