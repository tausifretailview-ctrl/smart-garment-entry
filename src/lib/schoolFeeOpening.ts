/**
 * Imported / carried opening used with fee structures and liability.
 * When `openingIsNet` is true (promotion carry-forward), `closing_fees_balance` already
 * reflects unpaid dues — do not subtract prior-session receipts again.
 */
export function resolveImportedOpeningBalance(
  grossClosing: number,
  latePrevPaid: number,
  openingIsNet: boolean
): number {
  if (openingIsNet) return Math.max(0, grossClosing);
  return Math.max(0, grossClosing - latePrevPaid);
}
