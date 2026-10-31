import { describe, expect, it } from "vitest";
import { voucherChangesSaleJournal } from "@/utils/accounting/historicalMigration";

const receipt = {
  voucher_type: "receipt",
  reference_type: "sale",
  reference_id: "sale-1",
  payment_method: "cash",
  description: "Payment received for INV/26-27/12",
};

describe("voucherChangesSaleJournal", () => {
  it("a later receipt or advance applied to a bill changes its Sale journal", () => {
    expect(voucherChangesSaleJournal(receipt)).toBe(true);
    expect(voucherChangesSaleJournal({ ...receipt, payment_method: "UPI" })).toBe(true);
    expect(voucherChangesSaleJournal({ ...receipt, payment_method: "advance_adjustment" })).toBe(true);
  });

  it("counter payments, credit notes and book adjustments do not", () => {
    expect(
      voucherChangesSaleJournal({ ...receipt, description: "Counter payment received for sale INV/26-27/12" }),
    ).toBe(false);
    expect(voucherChangesSaleJournal({ ...receipt, payment_method: "credit_note_adjustment" })).toBe(false);
    expect(voucherChangesSaleJournal({ ...receipt, payment_method: "balance_adjustment" })).toBe(false);
    expect(voucherChangesSaleJournal({ ...receipt, payment_method: "round_off" })).toBe(false);
  });

  it("only receipts against a bill", () => {
    expect(voucherChangesSaleJournal({ ...receipt, reference_type: "customer" })).toBe(false);
    expect(voucherChangesSaleJournal({ ...receipt, reference_id: null })).toBe(false);
    expect(voucherChangesSaleJournal({ ...receipt, voucher_type: "payment" })).toBe(false);
  });
});
