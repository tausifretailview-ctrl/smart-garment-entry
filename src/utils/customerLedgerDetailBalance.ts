/**
 * Customer Ledger detail / PDF — unused advance & net position.
 * Party-list rows (bulk RPC + React Query) can lag or mis-label CN-adjust
 * economics as advance; per-customer audit bundle via useCustomerBalance is canonical.
 */

export function customerLedgerDetailUnusedAdvance(opts: {
  isSchool: boolean;
  balanceHookLoading: boolean;
  hookUnusedAdvance: number;
  listUnusedAdvance: number;
}): number {
  if (opts.isSchool) {
    return Math.max(0, Math.round(Number(opts.listUnusedAdvance) || 0));
  }
  if (opts.balanceHookLoading) {
    return 0;
  }
  return Math.max(0, Math.round(Number(opts.hookUnusedAdvance) || 0));
}

export function customerLedgerDetailNetPosition(opts: {
  isSchool: boolean;
  balanceHookLoading: boolean;
  hookNetPosition: number;
  invoiceOutstanding: number;
  detailUnusedAdvance: number;
}): number {
  if (opts.isSchool) {
    return Math.round(Number(opts.invoiceOutstanding) || 0);
  }
  if (!opts.balanceHookLoading) {
    return Math.round(Number(opts.hookNetPosition) || 0);
  }
  return Math.round(
    (Number(opts.invoiceOutstanding) || 0) - (Number(opts.detailUnusedAdvance) || 0),
  );
}
