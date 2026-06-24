import { describe, expect, it } from "vitest";
import {
  SUPPLIER_PARTY_BALANCES_PAGE_SIZE,
  matchesSupplierPartyBalanceSearch,
  matchesSupplierPartyDirectionFilter,
  supplierPartyBalanceDirection,
  supplierPartyBalanceDisplayAmount,
  supplierPartyBalanceTotalPages,
} from "./supplierPartyBalanceDisplay";

describe("supplierPartyBalanceDirection", () => {
  it("positive balance is Cr (payable)", () => {
    expect(supplierPartyBalanceDirection({ signed_balance: 1000 })).toBe("Cr");
    expect(supplierPartyBalanceDirection({ direction: "Cr", signed_balance: 1000 })).toBe("Cr");
  });

  it("negative balance is Dr (advance)", () => {
    expect(supplierPartyBalanceDirection({ signed_balance: -500 })).toBe("Dr");
  });

  it("near-zero is Settled", () => {
    expect(supplierPartyBalanceDirection({ signed_balance: 0.2 })).toBe("Settled");
  });
});

describe("matchesSupplierPartyDirectionFilter", () => {
  it("filters Cr and Dr", () => {
    expect(matchesSupplierPartyDirectionFilter({ signed_balance: 100 }, "Cr")).toBe(true);
    expect(matchesSupplierPartyDirectionFilter({ signed_balance: 100 }, "Dr")).toBe(false);
    expect(matchesSupplierPartyDirectionFilter({ signed_balance: -100 }, "Dr")).toBe(true);
  });
});

describe("matchesSupplierPartyBalanceSearch", () => {
  const row = { supplier_name: "SRK TELELINK", phone: "9876543210" };

  it("matches name and phone", () => {
    expect(matchesSupplierPartyBalanceSearch(row, "telelink")).toBe(true);
    expect(matchesSupplierPartyBalanceSearch(row, "98765")).toBe(true);
  });
});

describe("supplierPartyBalanceDisplayAmount", () => {
  it("uses absolute value", () => {
    expect(supplierPartyBalanceDisplayAmount(-12850)).toBe(12850);
  });
});

describe("pagination", () => {
  it("uses 55 rows per page", () => {
    expect(SUPPLIER_PARTY_BALANCES_PAGE_SIZE).toBe(55);
    expect(supplierPartyBalanceTotalPages(120)).toBe(3);
  });
});
