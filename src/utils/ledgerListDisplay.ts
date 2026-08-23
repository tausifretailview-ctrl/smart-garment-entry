/**
 * Customer Ledger list cells for Total Sales / Total Paid.
 * Party RPC window columns (`out_total_dr` / `out_total_cr`) are org totals
 * repeated on every row — never copy them onto a customer.
 */

const RUPEE = 0.5;

export function looksLikePartyWindowOrgTotals(
  totalSales: number,
  totalPaid: number,
  orgNettedDr: number,
  orgNettedCr: number,
): boolean {
  if (orgNettedDr <= RUPEE && orgNettedCr <= RUPEE) return false;
  return (
    Math.abs(Math.round(totalSales) - Math.round(orgNettedDr)) <= RUPEE &&
    Math.abs(Math.round(totalPaid) - Math.round(orgNettedCr)) <= RUPEE
  );
}

/** Drop SQL window totals so a spread party row cannot paint org figures. */
export function stripPartyWindowTotals<T extends Record<string, unknown>>(row: T): T {
  const {
    total_dr: _td,
    total_cr: _tc,
    net_receivable: _nr,
    out_total_dr: _otd,
    out_total_cr: _otc,
    out_net_receivable: _onr,
    ...rest
  } = row as T & {
    total_dr?: unknown;
    total_cr?: unknown;
    net_receivable?: unknown;
    out_total_dr?: unknown;
    out_total_cr?: unknown;
    out_net_receivable?: unknown;
  };
  return rest as T;
}

export function ledgerListSalesPaidDisplay(
  totalSales: number,
  totalPaid: number,
  orgNettedDr: number,
  orgNettedCr: number,
): { sales: number | null; paid: number | null } {
  if (looksLikePartyWindowOrgTotals(totalSales, totalPaid, orgNettedDr, orgNettedCr)) {
    return { sales: null, paid: null };
  }
  return { sales: totalSales, paid: totalPaid };
}

/** Same Total Sales + Total Paid on 3+ rows = org window leak, not per-customer history. */
export function listHasRepeatedSalesPaid(
  rows: Array<{ totalSales?: number | null; totalPaid?: number | null }>,
): boolean {
  if (rows.length < 3) return false;
  const s0 = Math.round(Number(rows[0]?.totalSales ?? 0));
  const p0 = Math.round(Number(rows[0]?.totalPaid ?? 0));
  if (s0 <= 0 && p0 <= 0) return false;
  return rows.every(
    (r) => Math.round(Number(r.totalSales ?? 0)) === s0 && Math.round(Number(r.totalPaid ?? 0)) === p0,
  );
}

export function clearRepeatedOrgSalesPaid<T extends { totalSales: number; totalPaid: number }>(
  rows: T[],
): T[] {
  if (!listHasRepeatedSalesPaid(rows)) return rows;
  return rows.map((r) => ({ ...r, totalSales: 0, totalPaid: 0 }));
}
