/** Figures of the POS footer Pts / Cr / Adv boxes (PosFooterCreditFields), kept apart for unit tests. */

/** Tooltip of the points box: why it is disabled, or the most that can be redeemed. */
export function posPointsTitle(balance: number, minPoints: number, maxRedeemable: number): string {
  if (balance <= 0) return "No old points to redeem";
  if (balance < minPoints) return `Need at least ${minPoints} old pts (this bill's +pts are pending)`;
  return `Redeem old points only (max ${maxRedeemable})`;
}

/** Typed points: whole, never below 0 or above what this bill allows. */
export function posPointsFromTyped(raw: string, maxRedeemable: number): number {
  const value = parseInt(raw, 10) || 0;
  return Math.min(Math.max(0, value), maxRedeemable);
}

/**
 * Typed legacy credit ("Cr"): 0 clears; otherwise the amount capped to the credit balance and
 * what is left of the bill (or as typed when that cap is 0, so the apply step explains why).
 */
export function posLegacyCreditFromTyped(
  raw: string,
  availableCreditBalance: number,
  amountBeforeCredit: number,
): { clear: true; amount: 0 } | { clear: false; amount: number } {
  const value = parseFloat(raw) || 0;
  if (value <= 0) return { clear: true, amount: 0 };
  const maxApplicable = Math.min(value, availableCreditBalance, amountBeforeCredit);
  return { clear: false, amount: maxApplicable > 0 ? maxApplicable : value };
}
