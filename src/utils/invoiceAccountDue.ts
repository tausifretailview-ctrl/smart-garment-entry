/**
 * Invoice footer Prev Bal / Balance / Total Due.
 *
 * Prev Bal is the customer-account outstanding excluding this bill.
 * Total Due is Prev Bal + this bill's unpaid Balance — the live account after this invoice.
 *
 * Use invoice leftover (`getCustomerAccountState.outstanding` / POS footer chip), not
 * netPosition. Net folds unused advance and can print Total Due ₹0 while invoices remain.
 *
 * Gurukrupa POS A5 (SHUBHANGI SATPUTE POS/26-27/1728, 2026-09-03):
 *   Prev Bal ₹7,500 + Bill Balance ₹2,400 = Total Due ₹9,900.
 *
 * On POS save, fetch the account after commit (`accountIncludesThisBill: true`) so
 * Total Due is the live outstanding. A cached `useCustomerBalance` can still be 0/stale.
 * On dashboard reprint the canonical account already includes this sale — subtract this
 * bill's printed Balance or Total Due double-counts it.
 */

export function invoiceThisBillBalance(billTotal: number, receivedToday: number): number {
  return Math.max(0, Math.round((Number(billTotal) - Number(receivedToday)) * 100) / 100);
}

export function invoicePreviousBalanceFromAccount(opts: {
  /** Invoice leftover outstanding (POS footer / `state.outstanding`), not net-of-advance. */
  accountOutstanding: number;
  thisBillBalance: number;
  /** True when the account snapshot already includes this invoice (save print / reprint). */
  accountIncludesThisBill: boolean;
}): number {
  const account = Math.round((Number(opts.accountOutstanding) || 0) * 100) / 100;
  const bill = Math.round((Number(opts.thisBillBalance) || 0) * 100) / 100;
  if (!opts.accountIncludesThisBill) return account;
  return Math.round((account - bill) * 100) / 100;
}

export function invoiceTotalDue(previousBalance: number, thisBillBalance: number): number {
  return Number(previousBalance) + Number(thisBillBalance);
}

/**
 * Gurukrupa A5 account lines: print Outstanding and Advance separately.
 * Outstanding is live invoice leftover (Prev Bal + this-bill Balance).
 * Total Due = outstanding − unused advance (net), so both facets stay visible.
 */
export function gurukrupaInvoiceAccountLines(opts: {
  previousBalance: number;
  thisBillBalance: number;
  unusedAdvance: number;
}): { outstanding: number; advance: number; totalDue: number } {
  const outstanding = Math.round(invoiceTotalDue(opts.previousBalance, opts.thisBillBalance) * 100) / 100;
  const advance = Math.max(0, Math.round((Number(opts.unusedAdvance) || 0) * 100) / 100);
  return {
    outstanding,
    advance,
    totalDue: Math.round((outstanding - advance) * 100) / 100,
  };
}

/** Prev Bal + this-bill Balance + Total Due from one account snapshot. */
export function invoicePrintBalances(opts: {
  accountOutstanding: number;
  billTotal: number;
  receivedToday: number;
  accountIncludesThisBill: boolean;
}): { previousBalance: number; thisBillBalance: number; totalDue: number } {
  const thisBillBalance = invoiceThisBillBalance(opts.billTotal, opts.receivedToday);
  const previousBalance = invoicePreviousBalanceFromAccount({
    accountOutstanding: opts.accountOutstanding,
    thisBillBalance,
    accountIncludesThisBill: opts.accountIncludesThisBill,
  });
  return {
    previousBalance,
    thisBillBalance,
    totalDue: invoiceTotalDue(previousBalance, thisBillBalance),
  };
}
