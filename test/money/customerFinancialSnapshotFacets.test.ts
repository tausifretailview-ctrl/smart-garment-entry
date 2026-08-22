import { describe, expect, it } from "vitest";
import {
  accountFacetsFromFinancialSnapshot,
  grossOutstandingFromFinancialSnapshot,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { facetsFromPartySignedBalance } from "@/utils/customerAccountFacets";

describe("accountFacetsFromFinancialSnapshot", () => {
  it("Aafra-shaped: explicit SQL facets match recovery formula", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: 4_800,
      advanceAvailable: 10_000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 14_800,
      netPosition: 4_800,
    };
    expect(accountFacetsFromFinancialSnapshot(snap)).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
    expect(grossOutstandingFromFinancialSnapshot(snap)).toBe(14_800);
  });

  it("pre-migration fallback: derives gross from signed net + advance", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: 4_800,
      advanceAvailable: 10_000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 14_800,
      netPosition: 4_800,
    };
    // Simulate legacy RPC row without gross_outstanding_dr column
    const legacy = {
      outstandingDr: 4_800,
      advanceAvailable: 10_000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 4_800 + 10_000,
      netPosition: 4_800,
    };
    expect(accountFacetsFromFinancialSnapshot(legacy)).toEqual(
      facetsFromPartySignedBalance(legacy.outstandingDr, legacy.advanceAvailable),
    );
    expect(snap.grossOutstandingDr).toBe(14_800);
  });

  it("pure advance credit: net Cr, gross outstanding 0", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: -10_000,
      advanceAvailable: 10_000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 0,
      netPosition: -10_000,
    };
    const facets = accountFacetsFromFinancialSnapshot(snap);
    expect(facets.outstanding).toBe(0);
    expect(facets.netPosition).toBe(-10_000);
  });

  it("debtor with no advance: net equals gross", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: 5_000,
      advanceAvailable: 0,
      cnAvailableTotal: 500,
      cnPendingCount: 1,
      grossOutstandingDr: 5_000,
      netPosition: 5_000,
    };
    const facets = accountFacetsFromFinancialSnapshot(snap);
    expect(facets.outstanding).toBe(5_000);
    expect(facets.netPosition).toBe(5_000);
    expect(snap.cnAvailableTotal).toBe(500);
  });
});
