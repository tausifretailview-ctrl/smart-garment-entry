import { describe, expect, it } from "vitest";
import {
  CUSTOMER_PARTY_BALANCES_PAGE_SIZE,
  matchesPartyBalanceSearch,
  partyBalanceDirection,
  partyBalanceDisplayAmount,
  partyBalanceTotalPages,
  slicePartyBalancePage,
} from "./customerPartyBalanceDisplay";

describe("partyBalanceDirection", () => {
  it("uses RPC direction when present (does not re-derive from sign)", () => {
    expect(partyBalanceDirection({ direction: "Cr", signed_balance: 20600 })).toBe("Cr");
    expect(partyBalanceDirection({ direction: "Dr", signed_balance: -500 })).toBe("Dr");
    expect(partyBalanceDirection({ direction: "Settled", signed_balance: 1000 })).toBe("Settled");
  });

  it("maps positive signed_balance to Dr when RPC direction is missing", () => {
    expect(partyBalanceDirection({ signed_balance: 20600 })).toBe("Dr");
    expect(partyBalanceDirection({ direction: "", signed_balance: 20600 })).toBe("Dr");
  });

  it("maps negative signed_balance to Cr when RPC direction is missing", () => {
    expect(partyBalanceDirection({ signed_balance: -12850 })).toBe("Cr");
    expect(partyBalanceDirection({ direction: null, signed_balance: -0.51 })).toBe("Cr");
  });

  it("treats near-zero balances as Settled", () => {
    expect(partyBalanceDirection({ signed_balance: 0 })).toBe("Settled");
    expect(partyBalanceDirection({ signed_balance: 0.4 })).toBe("Settled");
    expect(partyBalanceDirection({ signed_balance: -0.4 })).toBe("Settled");
  });
});

describe("partyBalanceDisplayAmount", () => {
  it("shows absolute value for Dr and Cr rows", () => {
    expect(partyBalanceDisplayAmount(20600)).toBe(20600);
    expect(partyBalanceDisplayAmount(-12850)).toBe(12850);
  });
});

describe("Shumama Baireli display fixture", () => {
  it("shows 20,600 Dr from RPC fields", () => {
    const row = { direction: "Dr", signed_balance: 20600 };
    expect(partyBalanceDirection(row)).toBe("Dr");
    expect(partyBalanceDisplayAmount(row.signed_balance)).toBe(20600);
  });
});

describe("matchesPartyBalanceSearch", () => {
  const row = { customer_name: "Shumama Baireli", phone: "+91 98765 43210" };

  it("matches customer name", () => {
    expect(matchesPartyBalanceSearch(row, "shumama")).toBe(true);
    expect(matchesPartyBalanceSearch(row, "baireli")).toBe(true);
  });

  it("matches phone raw or digits-only query", () => {
    expect(matchesPartyBalanceSearch(row, "98765")).toBe(true);
    expect(matchesPartyBalanceSearch(row, "9876543210")).toBe(true);
    expect(matchesPartyBalanceSearch(row, "+91")).toBe(true);
  });

  it("does not match unrelated queries", () => {
    expect(matchesPartyBalanceSearch(row, "unknown party")).toBe(false);
    expect(matchesPartyBalanceSearch(row, "11111")).toBe(false);
  });
});

describe("client-side pagination helpers", () => {
  const rows = Array.from({ length: 120 }, (_, i) => i + 1);

  it("slices 50 rows per page", () => {
    expect(slicePartyBalancePage(rows, 1)).toHaveLength(CUSTOMER_PARTY_BALANCES_PAGE_SIZE);
    expect(slicePartyBalancePage(rows, 1)[0]).toBe(1);
    expect(slicePartyBalancePage(rows, 2)[0]).toBe(51);
    expect(slicePartyBalancePage(rows, 3)).toHaveLength(20);
  });

  it("computes total pages", () => {
    expect(partyBalanceTotalPages(120)).toBe(3);
    expect(partyBalanceTotalPages(50)).toBe(1);
    expect(partyBalanceTotalPages(51)).toBe(2);
    expect(partyBalanceTotalPages(0)).toBe(1);
  });
});
