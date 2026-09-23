const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * After this sale's credit-note voucher is soft-deleted, `usedAmountAfterRelease`
 * is whatever other bills still hold. The return gets that remainder, not its
 * original net.
 */
export function restoredReturnCredit(params: {
  returnNet: number;
  creditAmount: number;
  usedAmountAfterRelease: number;
}): { balance: number; status: "pending" | "partially_adjusted" | "adjusted" } {
  const remaining = Math.max(
    0,
    round2(params.creditAmount - params.usedAmountAfterRelease),
  );
  if (remaining <= 0.01) {
    return { balance: 0, status: "adjusted" };
  }
  if (remaining + 0.01 < Math.max(0, params.returnNet)) {
    return { balance: remaining, status: "partially_adjusted" };
  }
  return { balance: remaining, status: "pending" };
}
