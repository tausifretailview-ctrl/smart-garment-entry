import { describe, expect, it } from "vitest";
import {
  accountFacetStatus,
  facetsFromInvoiceOutstanding,
  facetsFromPartySignedBalance,
  summarizeAccountFacets,
} from "@/utils/customerAccountFacets";

describe("customerAccountFacets", () => {
  it("Aafra-shaped: JS list facets keep invoice outstanding and net after advance", () => {
    const f = facetsFromInvoiceOutstanding(14_800, 10_000);
    expect(f).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
    expect(accountFacetStatus(f)).toBe("outstanding");
  });

  it("Aafra-shaped: party SQL signed (netted) recovers same facets", () => {
    const f = facetsFromPartySignedBalance(4_800, 10_000);
    expect(f).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
  });

  it("pure unused advance: outstanding 0, net Cr", () => {
    const fromJs = facetsFromInvoiceOutstanding(0, 10_000);
    const fromSql = facetsFromPartySignedBalance(-10_000, 10_000);
    expect(fromJs).toEqual(fromSql);
    expect(fromJs.netPosition).toBe(-10_000);
    expect(accountFacetStatus(fromJs)).toBe("credit");
  });

  it("org totals: Outstanding + Credit Pool align with Net", () => {
    const rows = [
      facetsFromInvoiceOutstanding(14_800, 10_000), // Aafra
      facetsFromInvoiceOutstanding(5_000, 0),
      facetsFromInvoiceOutstanding(0, 2_000),
    ];
    const t = summarizeAccountFacets(rows);
    expect(t.totalOutstandingDr).toBe(14_800 + 5_000);
    expect(t.totalCreditPoolCr).toBe(10_000 + 2_000);
    expect(t.netReceivable).toBe(4_800 + 5_000 - 2_000);
  });
});
