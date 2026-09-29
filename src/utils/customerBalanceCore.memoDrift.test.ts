import { describe, expect, it } from "vitest";
import { computePaidAmountDrift } from "./customerBalanceCore";

const cnMemo = (saleId: string, amount: number) => ({
  voucher_type: "receipt",
  reference_type: "sale",
  reference_id: saleId,
  total_amount: amount,
  payment_method: "credit_note_adjustment",
  description: `Credit note adjusted (₹${amount}) against POS/26-27/325`,
});

describe("computePaidAmountDrift — CN / advance memos vs at-sale tender", () => {
  const aligned = { excludeSettlementMemos: true };

  it("keeps POS UPI when the rest of the bill is settled by a credit note (POS/26-27/325)", () => {
    const sale = { id: "s325", net_amount: 1500, sale_return_adjust: 1000, paid_amount: 500, upi_amount: 500 };
    expect(computePaidAmountDrift([sale], [cnMemo("s325", 1000)], aligned)).toBe(500);
  });

  it("does not double count older bills whose paid_amount already includes the CN", () => {
    const sale = { id: "old", net_amount: 1500, sale_return_adjust: 0, paid_amount: 1500, upi_amount: 500 };
    expect(computePaidAmountDrift([sale], [cnMemo("old", 1000)], aligned)).toBe(500);
  });

  it("still nets real receipt vouchers against the tender", () => {
    const sale = { id: "s", net_amount: 1000, paid_amount: 1000, cash_amount: 1000 };
    const receipt = { voucher_type: "receipt", reference_id: "s", total_amount: 1000, payment_method: "cash", description: "Payment" };
    expect(computePaidAmountDrift([sale], [receipt], aligned)).toBe(0);
  });

  it("no memo: unchanged", () => {
    const sale = { id: "s", net_amount: 800, paid_amount: 800, upi_amount: 800 };
    expect(computePaidAmountDrift([sale], [], aligned)).toBe(800);
  });

  it("legacy (non ledger-aligned) mode keeps the old behaviour", () => {
    const sale = { id: "s325", net_amount: 1500, sale_return_adjust: 1000, paid_amount: 500, upi_amount: 500 };
    expect(computePaidAmountDrift([sale], [cnMemo("s325", 1000)])).toBe(0);
  });
});
