import { describe, expect, it } from "vitest";
import { partyLedgerListMoneyFields } from "./customerLedgerListFromPartyBalances";

describe("partyLedgerListMoneyFields", () => {
  it("does not copy org window total_dr/total_cr onto the row", () => {
    const money = partyLedgerListMoneyFields(
      {
        customer_id: "a",
        customer_name: "Aa Production",
        signed_balance: 8000,
        advance_available: 0,
        direction: "Dr",
        net_position: 8000,
        total_dr: 3_226_922,
        total_cr: 1_822_504,
        net_receivable: 1_404_418,
      },
      "",
    );
    expect(money.totalSales).toBe(0);
    expect(money.totalPaid).toBe(0);
    expect(money.balance).toBe(8000);
    expect(money.unusedAdvanceTotal).toBe(0);
  });
});

