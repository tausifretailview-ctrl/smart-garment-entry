import { describe, expect, it } from "vitest";
import {
  accountFacetStatus,
  facetsFromInvoiceOutstanding,
  facetsFromPartyRpcRow,
  facetsFromPartySignedBalance,
  partyDebtorNetFromRpcRow,
  partyNetPositionFromRpcRow,
  posFooterCustomerBalance,
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

  it("raw party RPC: unused Advance is not inside signed (ELLA 551-class)", () => {
    expect(facetsFromPartyRpcRow(0, 170_000)).toEqual({
      outstanding: 0,
      unusedAdvance: 170_000,
      netPosition: -170_000,
    });
    expect(facetsFromPartyRpcRow(39_000, 38_100)).toEqual({
      outstanding: 39_000,
      unusedAdvance: 38_100,
      netPosition: 900,
    });
    expect(facetsFromPartyRpcRow(14_800, 10_000)).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
  });

  it("already-netted pure Advance credit is not subtracted twice", () => {
    expect(facetsFromPartyRpcRow(-10_000, 10_000)).toEqual({
      outstanding: 0,
      unusedAdvance: 10_000,
      netPosition: -10_000,
    });
  });

  it("JS/enrich economic net uses signed + unused recovery", () => {
    expect(facetsFromPartyRpcRow(4_800, 10_000, { signedIsEconomicNet: true })).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
  });

  it("AARISH / Farhaan unused=0 rows stay signed net", () => {
    expect(facetsFromPartyRpcRow(-6_550, 0).netPosition).toBe(-6_550);
    expect(facetsFromPartyRpcRow(-100, 0).netPosition).toBe(-100);
  });

  it("partyDebtorNetFromRpcRow — Farhaan Cr nets to 0 Dr for Khata FIFO gate", () => {
    expect(partyNetPositionFromRpcRow({ signed_balance: -100 })).toBe(-100);
    expect(partyDebtorNetFromRpcRow({ signed_balance: -100 })).toBe(0);
    expect(partyDebtorNetFromRpcRow({ signed_balance: 158_700 })).toBe(158_700);
  });

  it("POS footer Customer Balance ignores unused advance (Adv field only)", () => {
    const unusedOnly = facetsFromInvoiceOutstanding(0, 1_000);
    expect(posFooterCustomerBalance(unusedOnly.outstanding)).toBe(0);
    expect(unusedOnly.unusedAdvance).toBe(1_000);
    expect(unusedOnly.netPosition).toBe(-1_000);

    const invoiceAndAdvance = facetsFromInvoiceOutstanding(500, 1_000);
    expect(posFooterCustomerBalance(invoiceAndAdvance.outstanding)).toBe(500);

    expect(posFooterCustomerBalance(-200)).toBe(-200);
  });
});
