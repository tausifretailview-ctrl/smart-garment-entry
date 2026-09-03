/**
 * Invoice footer Prev Bal / Balance / Total Due.
 *
 * Prev Bal is the customer-account outstanding excluding this bill.
 * Total Due is Prev Bal + this bill's unpaid Balance — the account after this invoice.
 *
 * Gurukrupa POS A5 (SHUBHANGI SATPUTE POS/26-27/1728, 2026-09-03):
 *   Prev Bal ₹7,500 + Bill Balance ₹2,400 = Total Due ₹9,900.
 *
 * On POS save, `useCustomerBalance` is still the pre-sale account (this bill not in cache).
 * On dashboard reprint the canonical account already includes this sale — subtract this
 * bill's printed Balance or Total Due double-counts it.
 */

export function invoiceThisBillBalance(billTotal: number, receivedToday: number): number {
  return Math.max(0, Math.round((Number(billTotal) - Number(receivedToday)) * 100) / 100);
}

export function invoicePreviousBalanceFromAccount(opts: {
  /** Canonical customer outstanding (`getCustomerAccountState` / `useCustomerBalance` netPosition). */
  accountOutstanding: number;
  thisBillBalance: number;
  /** True when the account snapshot already includes this invoice (reprint). */
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
