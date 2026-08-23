import { describe, expect, it } from "vitest";
import type { CustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";
import {
  balanceGatePassed,
  BALANCE_GATE_TOLERANCE_RUPEE,
  verifyAlignedPartyRow,
  verifyCrossScreenHeadlineParity,
  verifyCustomerBalanceUnifiedGate,
  verifyLegacyPartyNetNotDoubleSubtracted,
  verifyPartialCnMemoExclusion,
  verifySnapshotFacetIdentities,
} from "@/utils/customerBalanceVerificationGate";
import { computeCustomerBalanceCore } from "@/utils/customerBalanceCore";
import { alignPartyRowWithSnapshot } from "@/utils/customerPartyBalanceSnapshot";

const aafraSnap: CustomerFinancialSnapshot = {
  outstandingDr: 4_800,
  advanceAvailable: 10_000,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
  grossOutstandingDr: 14_800,
  netPosition: 4_800,
};

const aafraPartyRow: CustomerPartyBalanceRpcRow = {
  customer_id: "c-aafra",
  customer_name: "AAFRA TEST",
  signed_balance: 4_800,
  advance_available: 10_000,
  direction: "Dr",
  net_position: -5_200,
  total_dr: 0,
  total_cr: 0,
  net_receivable: 0,
};

describe("verifySnapshotFacetIdentities", () => {
  it("passes for well-formed Aafra snapshot", () => {
    expect(balanceGatePassed(verifySnapshotFacetIdentities(aafraSnap))).toBe(true);
  });

  it("flags net_position drift", () => {
    const bad = { ...aafraSnap, netPosition: 0 };
    const v = verifySnapshotFacetIdentities(bad);
    expect(v.some((x) => x.gate === "snapshot_net_identity")).toBe(true);
  });

  it("flags gross_outstanding drift", () => {
    const bad = { ...aafraSnap, grossOutstandingDr: 4_800 };
    const v = verifySnapshotFacetIdentities(bad);
    expect(v.some((x) => x.gate === "snapshot_gross_identity")).toBe(true);
  });
});

describe("verifyLegacyPartyNetNotDoubleSubtracted", () => {
  it("detects pre-migration party net_position bug", () => {
    const v = verifyLegacyPartyNetNotDoubleSubtracted(aafraPartyRow, aafraSnap);
    expect(v).toHaveLength(1);
    expect(v[0]!.gate).toBe("legacy_party_net_double_subtract");
  });

  it("passes when party net already matches snapshot", () => {
    const fixedRow = { ...aafraPartyRow, net_position: 4_800 };
    expect(verifyLegacyPartyNetNotDoubleSubtracted(fixedRow, aafraSnap)).toEqual([]);
  });
});

describe("verifyAlignedPartyRow", () => {
  it("passes after snapshot alignment", () => {
    const aligned = alignPartyRowWithSnapshot(aafraPartyRow, "", aafraSnap);
    expect(balanceGatePassed(verifyAlignedPartyRow(aligned, aafraSnap))).toBe(true);
  });
});

describe("verifyCrossScreenHeadlineParity", () => {
  it("passes when hook, party, and activity agree within ₹1", () => {
    const v = verifyCrossScreenHeadlineParity({
      hookNet: 4_800,
      hookGross: 14_800,
      hookAdvance: 10_000,
      partyNet: 4_800,
      partyGross: 14_800,
      partyAdvance: 10_000,
      activityClosing: 4_800.5,
    });
    expect(balanceGatePassed(v)).toBe(true);
  });

  it("fails when net drift exceeds tolerance", () => {
    const v = verifyCrossScreenHeadlineParity({
      hookNet: 4_800,
      hookGross: 14_800,
      hookAdvance: 10_000,
      partyNet: 4_800 + BALANCE_GATE_TOLERANCE_RUPEE + 0.01,
      partyGross: 14_800,
      partyAdvance: 10_000,
    });
    expect(v.some((x) => x.gate === "hook_vs_party_net")).toBe(true);
  });
});

describe("verifyCustomerBalanceUnifiedGate — end-to-end offline", () => {
  it("passes unified gate for Aafra after alignment", () => {
    const v = verifyCustomerBalanceUnifiedGate({
      partyRow: aafraPartyRow,
      snap: aafraSnap,
      hookNet: 4_800,
      hookGross: 14_800,
      hookAdvance: 10_000,
      activityClosing: 4_800,
    });
    // Legacy party net flag is expected before alignment; unified gate includes it for raw row audit
    expect(v.some((x) => x.gate === "legacy_party_net_double_subtract")).toBe(true);

    const alignedViolations = verifyCustomerBalanceUnifiedGate({
      partyRow: { ...aafraPartyRow, net_position: 4_800 },
      snap: aafraSnap,
      hookNet: 4_800,
      hookGross: 14_800,
      hookAdvance: 10_000,
      activityClosing: 4_800,
    });
    expect(balanceGatePassed(alignedViolations)).toBe(true);
  });

  it("pure advance credit passes all facet identities", () => {
    const snap: CustomerFinancialSnapshot = {
      outstandingDr: -10_000,
      advanceAvailable: 10_000,
      cnAvailableTotal: 0,
      cnPendingCount: 0,
      grossOutstandingDr: 0,
      netPosition: -10_000,
    };
    const party: CustomerPartyBalanceRpcRow = {
      ...aafraPartyRow,
      signed_balance: -10_000,
      net_position: -10_000,
      advance_available: 10_000,
      direction: "Cr",
    };
    const v = verifyCustomerBalanceUnifiedGate({
      partyRow: party,
      snap,
      hookNet: -10_000,
      hookGross: 0,
      hookAdvance: 10_000,
    });
    expect(balanceGatePassed(v)).toBe(true);
  });
});

describe("verifyPartialCnMemoExclusion — Farhaan Fab regression", () => {
  const farhaanParams = {
    openingBalance: 0,
    sales: [
      { id: "inv-a", net_amount: 11800, sale_return_adjust: 0, items_gross: 11800 },
      { id: "inv-b", net_amount: 2800, sale_return_adjust: 0, items_gross: 2800 },
      { id: "inv-c", net_amount: 2700, sale_return_adjust: 2700, items_gross: 2700 },
    ],
    voucherEntries: [
      {
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-a",
        total_amount: 11800,
        payment_method: "cash",
      },
      {
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-b",
        total_amount: 2800,
        payment_method: "cash",
      },
      {
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "inv-c",
        total_amount: 2700,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted against invoice",
      },
    ],
    customerAdvances: [],
    advanceRefunds: [],
    saleReturns: [
      {
        net_amount: 2800,
        credit_status: "partially_adjusted",
        credit_available_balance: 100,
      },
    ],
  };

  it("passes when CN memo is excluded from receipt totals", () => {
    const aligned = computeCustomerBalanceCore({
      ...farhaanParams,
      options: { ledgerAlignedApplicationReceipts: true },
    });
    expect(aligned.balance).toBeCloseTo(-100, 0);
    expect(balanceGatePassed(verifyPartialCnMemoExclusion(farhaanParams, aligned))).toBe(
      true,
    );
  });

  it("flags when aligned balance still counts CN memo (simulated SQL drift)", () => {
    const buggyAligned = computeCustomerBalanceCore({
      ...farhaanParams,
      options: { ledgerAlignedApplicationReceipts: false },
    });
    const v = verifyPartialCnMemoExclusion(farhaanParams, buggyAligned);
    expect(v.some((x) => x.gate === "partial_cn_memo_exclusion_delta")).toBe(true);
  });
});
