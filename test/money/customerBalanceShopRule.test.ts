import { describe, expect, it } from "vitest";
import { alignPartyRowFromRpc } from "@/utils/customerPartyBalanceSnapshot";
import { accountFacetsFromFinancialSnapshot, type CustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";

/**
 * Shop rule (owner decision, 12 Nov 2026): a customer's balance is the bills still unpaid.
 * An unused advance is shown beside it ("Advance"), never subtracted from it.
 * Example: bills unpaid ₹5,000, unused advance ₹1,000 → Balance ₹5,000 Dr, Advance ₹1,000.
 *
 * Live SQL (checked 12 Nov 2026): _get_customer_party_balances_rows(uuid, text) and
 * get_customer_financial_snapshot_all subtract the unused advance, so their signed / outstanding_dr
 * is ₹4,000 here; screens must show signed + advance (gross) as the balance.
 */
describe("customer balance shop rule: bills due, advance separate", () => {
  it("party list row: ₹4,000 net + ₹1,000 advance shows ₹5,000 balance and ₹1,000 advance", () => {
    const row = alignPartyRowFromRpc(
      {
        customer_id: "c1",
        customer_name: "A",
        signed_balance: 4000,
        advance_available: 1000,
        direction: "Dr",
        net_position: 3000,
      } as never,
      "",
    );
    expect(row.gross_outstanding).toBe(5000);
    expect(row.advance_available).toBe(1000);
    expect(row.net_position).toBe(4000);
  });

  it("financial snapshot: grossOutstandingDr is the bills-due balance", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: 4000,
      advanceAvailable: 1000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 5000,
      netPosition: 4000,
    };
    const f = accountFacetsFromFinancialSnapshot(snap);
    expect(f.outstanding).toBe(5000);
    expect(f.unusedAdvance).toBe(1000);
  });

  it("an advance with no unpaid bills shows ₹0 balance and the advance on its own", () => {
    const row = alignPartyRowFromRpc(
      { customer_id: "c2", customer_name: "B", signed_balance: -2000, advance_available: 2000, direction: "Cr" } as never,
      "",
    );
    expect(row.gross_outstanding).toBe(0);
    expect(row.advance_available).toBe(2000);
  });
});

import { snapshotBillsDueAndAdvance } from "@/utils/customerFinancialSnapshot";

describe("snapshotBillsDueAndAdvance (messages and lists)", () => {
  it("gives bills due and the advance separately", () => {
    expect(snapshotBillsDueAndAdvance({ grossOutstandingDr: 5000, advanceAvailable: 1000 })).toEqual({ billsDue: 5000, advance: 1000 });
    expect(snapshotBillsDueAndAdvance(null)).toEqual({ billsDue: 0, advance: 0 });
    expect(snapshotBillsDueAndAdvance({ grossOutstandingDr: 0, advanceAvailable: -5 })).toEqual({ billsDue: 0, advance: 0 });
  });
});
