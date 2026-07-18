import { describe, expect, it } from "vitest";
import { getPosPaymentModeDisplayAmounts } from "./posDashboardSettlement";

describe("getPosPaymentModeDisplayAmounts", () => {
  it("shows full mix breakdown when bank/finance was omitted from card_amount", () => {
    const amounts = getPosPaymentModeDisplayAmounts({
      payment_method: "multiple",
      net_amount: 5349,
      paid_amount: 5349,
      cash_amount: 1500,
      card_amount: 0,
      upi_amount: 0,
    });
    expect(amounts.cash).toBe(1500);
    expect(amounts.card).toBe(3849);
    expect(amounts.upi).toBe(0);
  });

  it("merges receipt voucher mode amounts with at-sale tender", () => {
    const amounts = getPosPaymentModeDisplayAmounts(
      {
        payment_method: "multiple",
        net_amount: 5349,
        paid_amount: 5349,
        cash_amount: 1500,
        card_amount: 0,
        upi_amount: 0,
      },
      { cash: 0, card: 3849, upi: 0 },
    );
    expect(amounts.cash).toBe(1500);
    expect(amounts.card).toBe(3849);
  });

  it("keeps a correct saved mix breakdown unchanged", () => {
    const amounts = getPosPaymentModeDisplayAmounts({
      payment_method: "multiple",
      net_amount: 5349,
      paid_amount: 5349,
      cash_amount: 1500,
      card_amount: 0,
      upi_amount: 3849,
    });
    expect(amounts.cash).toBe(1500);
    expect(amounts.upi).toBe(3849);
    expect(amounts.card).toBe(0);
  });

  it("caps over-tender cash (ALBELI: ₹8000 tender on ₹4500 bill) to settled paid", () => {
    const amounts = getPosPaymentModeDisplayAmounts({
      payment_method: "multiple",
      net_amount: 4500,
      paid_amount: 4500,
      cash_amount: 8000,
      card_amount: 0,
      upi_amount: 0,
    });
    expect(amounts.cash).toBe(4500);
    expect(amounts.card).toBe(0);
    expect(amounts.upi).toBe(0);
  });
});
