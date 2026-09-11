/**
 * Shared Outstanding / Unused Advance / Net facets for list + KPI cards.
 *
 * Invoice outstanding must NOT net unused advances (JS balance / strip model).
 * SQL party `signed_balance` still nets unused_advances — recover outstanding as
 * signed + advance_available (Aafra: 4,800 + 10,000 = 14,800).
 */

export type CustomerAccountFacets = {
  /** Invoice + OB outstanding (Dr when > 0). Unused advance not subtracted. */
  outstanding: number;
  unusedAdvance: number;
  /** outstanding − unusedAdvance (economic net). */
  netPosition: number;
  /**
   * Unused sale-return credit-note pool (display). Already inside outstanding / net —
   * do not subtract again (AARISH / Zohra double-count).
   */
  cnAvailable?: number;
};

export type CustomerAccountFacetTotals = {
  /** Σ max(0, outstanding) — debtors / amount pending on invoices. */
  totalOutstandingDr: number;
  /** Σ unusedAdvance + Σ max(0, −outstanding) — advances / invoice credits held. */
  totalCreditPoolCr: number;
  /** Σ netPosition. */
  netReceivable: number;
};

const SETTLED = 0.5;

function roundRupee(n: number): number {
  return Math.round(Number(n) || 0);
}

/**
 * POS footer Customer Balance chip.
 * Unused booking advance stays in the Adv field — pass invoice leftover
 * (`outstanding` / `useCustomerBalance.grossOutstanding`), never `netPosition`.
 */
export function posFooterCustomerBalance(invoiceOutstanding: number): number {
  return roundRupee(invoiceOutstanding);
}

/** From Customer Ledger list row (JS balance already excludes unused advance). */
export function facetsFromInvoiceOutstanding(
  invoiceOutstanding: number,
  unusedAdvance: number,
): CustomerAccountFacets {
  const outstanding = roundRupee(invoiceOutstanding);
  const unused = Math.max(0, roundRupee(unusedAdvance));
  return {
    outstanding,
    unusedAdvance: unused,
    netPosition: roundRupee(outstanding - unused),
  };
}

/**
 * From Customer Balances SQL row where `signed_balance` is signed net receivable.
 * gross outstanding = signed + advance_available; net_position = signed (after migration 20260822183000).
 */
export function facetsFromPartySignedBalance(
  signedBalance: number,
  advanceAvailable: number,
): CustomerAccountFacets {
  const unused = Math.max(0, roundRupee(advanceAvailable));
  const signed = roundRupee(signedBalance);
  return {
    outstanding: roundRupee(signed + unused),
    unusedAdvance: unused,
    netPosition: signed,
  };
}

/**
 * Live `get_customer_party_balances` on ELLA NOOR (2026-09-10): `signed_balance`
 * is invoice leftover (JS `balance`) — unused Advance is NOT inside it. 551 parties
 * had snapshot net = signed − unused (Sana ₹0 + ₹1,70,000 Advance → ₹1,70,000 Cr).
 *
 * The page used {@link facetsFromPartySignedBalance}, which assumes signed is
 * already economic net and adds Advance again (fake Dr + Net too high).
 *
 * Raw RPC: treat signed as invoice leftover unless it is already a netted
 * pure-advance credit (signed ≈ −unused).
 * JS / enrich already pass economic net — set `signedIsEconomicNet`.
 */
export function facetsFromPartyRpcRow(
  signedBalance: number,
  advanceAvailable: number,
  opts?: { signedIsEconomicNet?: boolean },
): CustomerAccountFacets {
  const unused = Math.max(0, roundRupee(advanceAvailable));
  const signed = roundRupee(signedBalance);
  if (opts?.signedIsEconomicNet) {
    return facetsFromPartySignedBalance(signed, unused);
  }
  if (unused > SETTLED && signed < -SETTLED && Math.abs(signed + unused) <= 1) {
    return facetsFromPartySignedBalance(signed, unused);
  }
  if (unused > SETTLED) {
    return facetsFromInvoiceOutstanding(signed, unused);
  }
  return facetsFromPartySignedBalance(signed, unused);
}

export function summarizeAccountFacets(
  rows: CustomerAccountFacets[],
): CustomerAccountFacetTotals {
  let totalOutstandingDr = 0;
  let totalCreditPoolCr = 0;
  let netReceivable = 0;
  for (const r of rows) {
    if (r.outstanding > SETTLED) totalOutstandingDr += r.outstanding;
    totalCreditPoolCr += Math.max(0, r.unusedAdvance);
    if (r.outstanding < -SETTLED) totalCreditPoolCr += Math.abs(r.outstanding);
    netReceivable += r.netPosition;
  }
  return {
    totalOutstandingDr: roundRupee(totalOutstandingDr),
    totalCreditPoolCr: roundRupee(totalCreditPoolCr),
    netReceivable: roundRupee(netReceivable),
  };
}

/** Status badge from net position (+ unused when net settled but advance held). */
export function accountFacetStatus(
  facets: CustomerAccountFacets,
): "outstanding" | "credit" | "settled" {
  if (facets.netPosition > SETTLED) return "outstanding";
  if (facets.netPosition < -SETTLED) return "credit";
  if (facets.unusedAdvance > SETTLED) return "credit";
  return "settled";
}

/** Debtor net (Dr) from post-fix party RPC row — max(0, signed net receivable). */
export function partyDebtorNetFromRpcRow(
  row: Pick<{ signed_balance?: number | null }, "signed_balance">,
): number {
  return Math.max(0, roundRupee(Number(row.signed_balance) || 0));
}

/** Signed net receivable from party RPC row (Cr when negative). */
export function partyNetPositionFromRpcRow(
  row: Pick<{ signed_balance?: number | null }, "signed_balance">,
): number {
  return roundRupee(Number(row.signed_balance) || 0);
}

export function formatNetFacetLabel(netPosition: number): string {
  const abs = Math.abs(roundRupee(netPosition)).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (Math.abs(netPosition) <= SETTLED) return `₹${abs}`;
  return netPosition > 0 ? `₹${abs} Dr` : `₹${abs} Cr`;
}
