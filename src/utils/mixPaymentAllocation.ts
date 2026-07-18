/**
 * Mix Payment allocation helpers.
 * UI must not allow tender above the bill; save path still peels any legacy excess
 * so cash_amount/card_amount/upi_amount never store change.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Clamp one Mix Payment mode so cash+card+upi+bank+finance never exceeds bill. */
export function clampMixPaymentModeAmount(
  nextAmount: number,
  otherModesTotal: number,
  billAmount: number,
): number {
  const bill = Math.max(0, Number(billAmount) || 0);
  const others = Math.max(0, Number(otherModesTotal) || 0);
  const maxAllowed = Math.max(0, round2(bill - others));
  const raw = Math.max(0, Number(nextAmount) || 0);
  return round2(Math.min(raw, maxAllowed));
}

export type MixPaymentTenderInput = {
  billAmount: number;
  cashAmount: number;
  cardAmount: number;
  upiAmount: number;
  bankAmount?: number;
  financeAmount?: number;
};

export type MixPaymentAppliedAmounts = {
  cash: number;
  card: number;
  upi: number;
  /** Sum of applied mode amounts (≤ bill). */
  totalApplied: number;
  /** Original tender before capping. */
  tenderTotal: number;
  /** Tender excess returned as change (cash-first). */
  changeDue: number;
};

/**
 * Allocate mix tender to the bill. Excess is peeled from cash first (typical
 * retail change), then card/bank/finance, then UPI.
 */
export function allocateMixPaymentToBill(input: MixPaymentTenderInput): MixPaymentAppliedAmounts {
  let cash = Math.max(0, Number(input.cashAmount) || 0);
  let card =
    Math.max(0, Number(input.cardAmount) || 0) +
    Math.max(0, Number(input.bankAmount) || 0) +
    Math.max(0, Number(input.financeAmount) || 0);
  let upi = Math.max(0, Number(input.upiAmount) || 0);

  const tenderTotal = round2(cash + card + upi);
  const cap = Math.max(0, Number(input.billAmount) || 0);

  if (tenderTotal <= cap + 0.0001) {
    return {
      cash: round2(cash),
      card: round2(card),
      upi: round2(upi),
      totalApplied: tenderTotal,
      tenderTotal,
      changeDue: 0,
    };
  }

  let excess = round2(tenderTotal - cap);
  const peel = (amt: number): number => {
    const take = Math.min(amt, excess);
    excess = round2(excess - take);
    return round2(amt - take);
  };

  cash = peel(cash);
  card = peel(card);
  upi = peel(upi);

  const totalApplied = round2(cash + card + upi);
  return {
    cash,
    card,
    upi,
    totalApplied,
    tenderTotal,
    changeDue: round2(Math.max(0, tenderTotal - totalApplied)),
  };
}

/**
 * Scale / peel mode columns so they do not exceed the settled paid amount.
 * Used for dashboard display of historical over-tender rows.
 */
export function capPaymentModesToSettled(params: {
  cash: number;
  card: number;
  upi: number;
  settledPaid: number;
}): { cash: number; card: number; upi: number } {
  const allocated = allocateMixPaymentToBill({
    billAmount: Math.max(0, Number(params.settledPaid) || 0),
    cashAmount: Number(params.cash) || 0,
    cardAmount: Number(params.card) || 0,
    upiAmount: Number(params.upi) || 0,
  });
  return { cash: allocated.cash, card: allocated.card, upi: allocated.upi };
}
