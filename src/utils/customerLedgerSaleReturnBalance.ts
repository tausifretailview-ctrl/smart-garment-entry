/**
 * Pure helpers for Customer Ledger sale-return running-balance rules.
 * Kept out of the 6k-line component so Hanif-class regressions are unit-testable.
 */

/**
 * Advance (credit) applied to the running Balance column for a visible sale-return row.
 * Always the return's GROSS `net_amount` — matching Credit-column `displayCredit`.
 * Remaining CN availability must NOT be used here (that double-deducts applied CN
 * when the linked invoice still debits gross).
 */
export function saleReturnRunningBalanceCredit(grossNetAmount: number): number {
  return Math.max(0, Number(grossNetAmount) || 0);
}

/**
 * Amount that feeds recon `saleReturns` / CN Available from a non-memo return row
 * (`transaction.credit`): remaining after CN application / SRA absorption.
 */
export function saleReturnRemainingCredit(params: {
  grossNetAmount: number;
  consumedAmount: number;
}): number {
  return Math.max(0, Number(params.grossNetAmount) || 0) - Math.max(0, Number(params.consumedAmount) || 0);
}

/** Hanif bhai walk: column totals gap must equal last running balance. */
export function walkLedgerSignedBalance(
  rows: Array<{ debit?: number; credit?: number; displayDebit?: number; displayCredit?: number; informational?: boolean }>,
): number {
  let bal = 0;
  for (const r of rows) {
    if (r.informational) continue;
    const d = r.displayDebit ?? r.debit ?? 0;
    const c = r.displayCredit ?? r.credit ?? 0;
    bal += d - c;
  }
  return bal;
}
