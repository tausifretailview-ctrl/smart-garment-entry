import type { CustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import { accountFacetsFromFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import {
  alignPartyRowWithSnapshot,
  type CustomerPartyBalanceAlignedRow,
} from "@/utils/customerPartyBalanceSnapshot";
import {
  computeCustomerBalanceCore,
  isCreditNoteApplicationReceiptLedgerAligned,
  type CustomerBalanceCoreParams,
  type CustomerBalanceCoreResult,
} from "@/utils/customerBalanceCore";
import type { CustomerPartyBalanceRpcRow } from "@/utils/fetchAllRows";

/** UI QA / cross-screen parity tolerance (₹1). */
export const BALANCE_GATE_TOLERANCE_RUPEE = 1;

/** SQL facet identity tolerance (paise). */
export const SNAPSHOT_FACET_TOLERANCE = 0.01;

export type BalanceGateViolation = {
  gate: string;
  message: string;
  delta?: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function withinTolerance(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(round2(actual - expected)) <= tolerance;
}

/**
 * Gate 1 — snapshot RPC facet identities (migration 20260822183000).
 * net_position = outstanding_dr; gross_outstanding_dr = net + max(0, advance).
 */
export function verifySnapshotFacetIdentities(
  snap: CustomerFinancialSnapshot,
): BalanceGateViolation[] {
  const violations: BalanceGateViolation[] = [];

  const netDrift = Math.abs(snap.netPosition - snap.outstandingDr);
  if (netDrift > SNAPSHOT_FACET_TOLERANCE) {
    violations.push({
      gate: "snapshot_net_identity",
      message: "net_position must equal outstanding_dr (signed net receivable)",
      delta: round2(netDrift),
    });
  }

  const expectedGross = snap.netPosition + Math.max(0, snap.advanceAvailable);
  const grossDrift = Math.abs(snap.grossOutstandingDr - expectedGross);
  if (grossDrift > SNAPSHOT_FACET_TOLERANCE) {
    violations.push({
      gate: "snapshot_gross_identity",
      message: "gross_outstanding_dr must equal net_position + max(0, advance_available)",
      delta: round2(grossDrift),
    });
  }

  return violations;
}

/**
 * Gate 2 — party list row after snapshot alignment matches headline RPC fields.
 */
export function verifyAlignedPartyRow(
  row: CustomerPartyBalanceAlignedRow,
  snap: CustomerFinancialSnapshot,
): BalanceGateViolation[] {
  const violations: BalanceGateViolation[] = [];
  const facets = accountFacetsFromFinancialSnapshot(snap);

  const checks: Array<[string, number, number]> = [
    ["party_net_position", row.net_position, facets.netPosition],
    ["party_signed_balance", row.signed_balance, facets.netPosition],
    ["party_gross_outstanding", row.gross_outstanding, facets.outstanding],
    ["party_advance_available", row.advance_available, facets.unusedAdvance],
    ["party_cn_available", row.cn_available, snap.cnAvailableTotal],
  ];

  for (const [gate, actual, expected] of checks) {
    if (!withinTolerance(actual, expected, SNAPSHOT_FACET_TOLERANCE)) {
      violations.push({
        gate,
        message: `${gate} drift from snapshot`,
        delta: round2(actual - expected),
      });
    }
  }

  return violations;
}

/**
 * Gate 3 — cross-screen headline parity (Ledger hook = Party = Activity within ₹1).
 */
export function verifyCrossScreenHeadlineParity(input: {
  hookNet: number;
  hookGross: number;
  hookAdvance: number;
  partyNet: number;
  partyGross: number;
  partyAdvance: number;
  activityClosing?: number | null;
}): BalanceGateViolation[] {
  const violations: BalanceGateViolation[] = [];
  const tol = BALANCE_GATE_TOLERANCE_RUPEE;

  const pairs: Array<[string, number, number]> = [
    ["hook_vs_party_net", input.hookNet, input.partyNet],
    ["hook_vs_party_gross", input.hookGross, input.partyGross],
    ["hook_vs_party_advance", input.hookAdvance, input.partyAdvance],
  ];

  if (input.activityClosing != null) {
    pairs.push(["hook_vs_activity_closing", input.hookNet, input.activityClosing]);
  }

  for (const [gate, a, b] of pairs) {
    if (!withinTolerance(a, b, tol)) {
      violations.push({
        gate,
        message: `${gate} exceeds ₹${tol} tolerance`,
        delta: round2(a - b),
      });
    }
  }

  return violations;
}

/**
 * Gate 4 — legacy party RPC net_position bug detector (signed − advance).
 * Returns violations when raw party row still carries the old double-subtract.
 */
export function verifyLegacyPartyNetNotDoubleSubtracted(
  partyRow: Pick<
    CustomerPartyBalanceRpcRow,
    "signed_balance" | "net_position" | "advance_available"
  >,
  snap: CustomerFinancialSnapshot,
): BalanceGateViolation[] {
  const legacyWrongNet = round2(
    partyRow.signed_balance - Math.max(0, partyRow.advance_available),
  );
  const snapNet = snap.netPosition;

  if (
    Math.abs(partyRow.net_position - legacyWrongNet) <= SNAPSHOT_FACET_TOLERANCE &&
    Math.abs(partyRow.net_position - snapNet) > SNAPSHOT_FACET_TOLERANCE
  ) {
    return [
      {
        gate: "legacy_party_net_double_subtract",
        message:
          "party net_position looks like signed_balance − advance (pre-20260822183000 bug); align with snapshot",
        delta: round2(partyRow.net_position - snapNet),
      },
    ];
  }

  return [];
}

/**
 * Gate 5 — partial CN: CN memo receipts must not inflate cash when invoice SRA already
 * counts the applied slice (Farhaan Fab: -2800 if memo counted, -100 when excluded).
 */
export function verifyPartialCnMemoExclusion(
  params: CustomerBalanceCoreParams,
  alignedResult?: CustomerBalanceCoreResult,
): BalanceGateViolation[] {
  const hasPartialCn = (params.saleReturns ?? []).some((sr) => {
    const status = String(sr.credit_status || "").toLowerCase();
    const remainder = Number(sr.credit_available_balance ?? 0);
    return status === "partially_adjusted" && remainder > 0.01;
  });
  if (!hasPartialCn) return [];

  const cnMemoTotal = params.voucherEntries
    .filter(isCreditNoteApplicationReceiptLedgerAligned)
    .reduce(
      (sum, v) =>
        sum + Math.max(0, Number(v.total_amount || 0) + Number(v.discount_amount || 0)),
      0,
    );
  if (cnMemoTotal <= 0.01) return [];

  const aligned =
    alignedResult ??
    computeCustomerBalanceCore({
      ...params,
      options: { ledgerAlignedApplicationReceipts: true },
    });
  const withoutExclusion = computeCustomerBalanceCore({
    ...params,
    options: { ledgerAlignedApplicationReceipts: false },
  });

  const violations: BalanceGateViolation[] = [];
  const exclusionDelta = round2(withoutExclusion.balance - aligned.balance);

  if (Math.abs(Math.abs(exclusionDelta) - cnMemoTotal) > SNAPSHOT_FACET_TOLERANCE) {
    violations.push({
      gate: "partial_cn_memo_exclusion_delta",
      message:
        "CN memo exclusion should change balance by memo total when partially_adjusted remainder exists",
      delta: round2(Math.abs(exclusionDelta) - cnMemoTotal),
    });
  }

  const sraTotal = aligned.totalSaleReturnAdjustOnInvoices;
  if (sraTotal > 0.01 && Math.abs(cnMemoTotal - sraTotal) > 1) {
    violations.push({
      gate: "partial_cn_memo_sra_mismatch",
      message: "CN memo total should match invoice sale_return_adjust for partial-CN fixture",
      delta: round2(cnMemoTotal - sraTotal),
    });
  }

  return violations;
}

/** Simulate party-page alignment and return all gate violations for one customer. */
export function verifyCustomerBalanceUnifiedGate(input: {
  partyRow: CustomerPartyBalanceRpcRow;
  snap: CustomerFinancialSnapshot;
  hookNet: number;
  hookGross: number;
  hookAdvance: number;
  activityClosing?: number | null;
  phone?: string;
}): BalanceGateViolation[] {
  const aligned = alignPartyRowWithSnapshot(
    input.partyRow,
    input.phone ?? "",
    input.snap,
  );

  return [
    ...verifySnapshotFacetIdentities(input.snap),
    ...verifyLegacyPartyNetNotDoubleSubtracted(input.partyRow, input.snap),
    ...verifyAlignedPartyRow(aligned, input.snap),
    ...verifyCrossScreenHeadlineParity({
      hookNet: input.hookNet,
      hookGross: input.hookGross,
      hookAdvance: input.hookAdvance,
      partyNet: aligned.net_position,
      partyGross: aligned.gross_outstanding,
      partyAdvance: aligned.advance_available,
      activityClosing: input.activityClosing,
    }),
  ];
}

export function balanceGatePassed(violations: BalanceGateViolation[]): boolean {
  return violations.length === 0;
}
