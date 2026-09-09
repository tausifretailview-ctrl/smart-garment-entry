import { describe, expect, it, vi } from "vitest";
import {
  alignPartyRowFromRpc,
  alignPartyRowWithSnapshot,
  applyCanonicalStateToPartyRow,
  fetchCustomerPartyBalancesPayload,
  partyBalanceOrgWindowFromRpcRow,
  partyBalanceRowFacets,
} from "@/utils/customerPartyBalanceSnapshot";

vi.mock("@/utils/fetchAllRows", () => ({
  fetchAllCustomers: vi.fn(),
  fetchAllCustomerPartyBalances: vi.fn(),
  fetchCustomerPhoneMap: vi.fn(),
}));

import {
  fetchAllCustomers,
  fetchAllCustomerPartyBalances,
  fetchCustomerPhoneMap,
} from "@/utils/fetchAllRows";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";
import type { CustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";

describe("partyBalanceRowFacets", () => {
  it("reads snapshot-aligned row fields directly", () => {
    expect(
      partyBalanceRowFacets({
        gross_outstanding: 14_800,
        advance_available: 10_000,
        net_position: 4_800,
        cn_available: 0,
      }),
    ).toEqual({
      outstanding: 14_800,
      unusedAdvance: 10_000,
      netPosition: 4_800,
      cnAvailable: 0,
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
      cnAvailable: 0,
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
      cnAvailable: 0,
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

describe("fetchCustomerPartyBalancesPayload", () => {
  it("returns searchable customer rows when party RPC times out", async () => {
    vi.mocked(fetchCustomerPhoneMap).mockResolvedValue(new Map([["c1", "9999999999"]]));
    vi.mocked(fetchAllCustomers).mockResolvedValue([
      {
        id: "c1",
        customer_name: "NIXC FOOTWEAR",
        phone: "9999999999",
        email: null,
        gst_number: null,
        address: null,
        opening_balance: 500,
        points_balance: null,
        discount_percent: null,
      },
    ]);
    vi.mocked(fetchAllCustomerPartyBalances).mockRejectedValue({
      code: "57014",
      message: "canceling statement due to statement timeout",
    });

    const payload = await fetchCustomerPartyBalancesPayload("org-ks");
    expect(payload.partyBalancesComplete).toBe(false);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].customer_name).toBe("NIXC FOOTWEAR");
    expect(payload.rows[0].net_position).toBe(500);
    expect(payload.rows[0].phone).toBe("9999999999");
  });

  it("returns full party rows when RPC succeeds", async () => {
    vi.mocked(fetchCustomerPhoneMap).mockResolvedValue(new Map([["c1", "8888888888"]]));
    vi.mocked(fetchAllCustomers).mockResolvedValue([]);
    vi.mocked(fetchAllCustomerPartyBalances).mockResolvedValue([
      {
        customer_id: "c1",
        customer_name: "NIXC FOOTWEAR",
        signed_balance: 4_800,
        advance_available: 0,
        direction: "Dr",
        net_position: 4_800,
        total_dr: 0,
        total_cr: 0,
        net_receivable: 4_800,
      },
    ]);

    const payload = await fetchCustomerPartyBalancesPayload("org-ks");
    expect(payload.partyBalancesComplete).toBe(true);
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0].net_position).toBe(4_800);
  });
});

describe("applyCanonicalStateToPartyRow", () => {
  const aarish: CustomerPartyBalanceAlignedRow = {
    customer_id: "aarish",
    customer_name: "AARISH",
    signed_balance: -6550,
    advance_available: 0,
    direction: "Cr",
    net_position: -6550,
    total_dr: 0,
    total_cr: 0,
    net_receivable: 0,
    phone: "",
    gross_outstanding: -6550,
    cn_available: 0,
  };

  it("writes pending CN even when signed net already matches SQL", () => {
    const patched = applyCanonicalStateToPartyRow(aarish, {
      netPosition: -6550,
      unusedAdvancePool: 0,
      unclaimedSaleReturnCredit: 6550,
      totalInvoicedGross: 0,
      totalRealPayments: 0,
    });
    expect(patched.signed_balance).toBe(-6550);
    expect(patched.advance_available).toBe(0);
    expect(patched.cn_available).toBe(6550);
    expect(patched.net_position).toBe(-6550);
    expect(partyBalanceRowFacets(patched)).toEqual({
      outstanding: -6550,
      unusedAdvance: 0,
      netPosition: -6550,
      cnAvailable: 6550,
    });
  });

  it("does not subtract CN from Net when flipping a drifted Dr row to Cr", () => {
    const drifted = { ...aarish, signed_balance: 6550, direction: "Dr", gross_outstanding: 6550, net_position: 6550 };
    const patched = applyCanonicalStateToPartyRow(drifted, {
      netPosition: -6550,
      unusedAdvancePool: 0,
      unclaimedSaleReturnCredit: 6550,
      totalInvoicedGross: 0,
      totalRealPayments: 0,
    });
    expect(patched.signed_balance).toBe(-6550);
    expect(patched.direction).toBe("Cr");
    expect(patched.cn_available).toBe(6550);
    expect(patched.net_position).toBe(-6550);
    expect(patched.net_position).not.toBe(0);
  });

  it("keeps unused Advance separate from CN", () => {
    const row: CustomerPartyBalanceAlignedRow = {
      ...aarish,
      customer_id: "aafra",
      customer_name: "AAFRA",
      signed_balance: 4800,
      direction: "Dr",
      gross_outstanding: 14800,
      net_position: 4800,
    };
    const patched = applyCanonicalStateToPartyRow(row, {
      netPosition: 4800,
      unusedAdvancePool: 10_000,
      unclaimedSaleReturnCredit: 2_000,
      totalInvoicedGross: 20_000,
      totalRealPayments: 8_000,
    });
    expect(patched.advance_available).toBe(10_000);
    expect(patched.cn_available).toBe(2_000);
    expect(patched.net_position).toBe(4_800);
    expect(patched.gross_outstanding).toBe(14_800);
  });
});

describe("partyBalanceOrgWindowFromRpcRow", () => {
  it("reads window net_receivable, not a single signed_balance", () => {
    expect(
      partyBalanceOrgWindowFromRpcRow({
        net_receivable: 457_518,
      }),
    ).toEqual({ netReceivable: 457_518 });
  });

  it("treats a missing row as zero", () => {
    expect(partyBalanceOrgWindowFromRpcRow(undefined)).toEqual({ netReceivable: 0 });
  });
});
