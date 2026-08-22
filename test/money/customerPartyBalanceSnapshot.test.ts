import { describe, expect, it } from "vitest";
import {
  alignPartyRowFromRpc,
  alignPartyRowWithSnapshot,
  partyBalanceRowFacets,
} from "@/utils/customerPartyBalanceSnapshot";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";
import type { CustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";

describe("partyBalanceRowFacets", () => {
  it("reads snapshot-aligned row fields directly", () => {
    expect(
      partyBalanceRowFacets({
        gross_outstanding: 14_800,
        advance_available: 10_000,
        net_position: 4_800,
      }),
    ).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
  });
});

describe("alignPartyRowFromRpc", () => {
  const baseRow: CustomerPartyBalanceRpcRow = {
    customer_id: "c1",
    customer_name: "AAFRA TEST",
    signed_balance: 4_800,
    advance_available: 10_000,
    direction: "Dr",
    net_position: -5_200,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
  };

  it("derives Aafra facets from signed_balance + advance (ignores legacy net_position)", () => {
    const aligned = alignPartyRowFromRpc(baseRow, "9999999999");
    expect(aligned.gross_outstanding).toBe(14_800);
    expect(aligned.net_position).toBe(4_800);
    expect(aligned.advance_available).toBe(10_000);
    expect(aligned.net_position).not.toBe(-5_200);
    expect(partyBalanceRowFacets(aligned)).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
  });

  it("pure advance credit shows Cr direction from signed net", () => {
    const aligned = alignPartyRowFromRpc(
      { ...baseRow, signed_balance: -10_000, direction: "Settled", net_position: -20_000 },
      "",
    );
    expect(aligned.gross_outstanding).toBe(0);
    expect(aligned.direction).toBe("Cr");
  });
});

describe("alignPartyRowWithSnapshot", () => {
  const baseRow: CustomerPartyBalanceRpcRow = {
    customer_id: "c1",
    customer_name: "AAFRA TEST",
    signed_balance: 4_800,
    advance_available: 10_000,
    direction: "Dr",
    net_position: -5_200,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
  };

  const aafraSnap: CustomerFinancialSnapshot = {
    outstandingDr: 4_800,
    advanceAvailable: 10_000,
    cnAvailableTotal: 0,
    cnPendingCount: 0,
    grossOutstandingDr: 14_800,
    netPosition: 4_800,
  };

  it("replaces legacy party net_position double-subtract with snapshot facets", () => {
    const aligned = alignPartyRowWithSnapshot(baseRow, "9999999999", aafraSnap);
    expect(aligned.gross_outstanding).toBe(14_800);
    expect(aligned.net_position).toBe(4_800);
    expect(aligned.advance_available).toBe(10_000);
    expect(aligned.signed_balance).toBe(4_800);
    expect(aligned.net_position).not.toBe(-5_200);
    expect(partyBalanceRowFacets(aligned)).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
    });
  });

  it("pure advance credit shows Cr direction from snapshot net", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: -10_000,
      advanceAvailable: 10_000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 0,
      netPosition: -10_000,
    };
    const aligned = alignPartyRowWithSnapshot(
      { ...baseRow, direction: "Settled", signed_balance: 0 },
      "",
      snap,
    );
    expect(aligned.gross_outstanding).toBe(0);
    expect(aligned.direction).toBe("Cr");
  });
});
