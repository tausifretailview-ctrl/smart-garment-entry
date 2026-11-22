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

/**
 * Pay Later balance left by a Mix Payment. Under ₹1 is paise, not credit: a sale
 * return with paise (₹845.24) leaves a net like ₹1,154.76, the cashier collects
 * ₹1,154, and the DB settlement tolerance (₹1) marks that bill paid anyway. Treating
 * the ₹0.76 as credit asked walk-in customers for a name for no reason.
 */
export const MIX_CREDIT_MIN_RUPEE = 1;

export function mixPaymentCreditDue(payableBill: number, totalPaid: number): number {
  const due = round2(Math.max(0, (Number(payableBill) || 0) - (Number(totalPaid) || 0)));
  return due < MIX_CREDIT_MIN_RUPEE ? 0 : due;
}

/**
 * Balance a Mix Payment leaves unpaid on the bill, which is what needs a named customer.
 * The bill is first reduced by the sale return and credit used on it, then by the advance
 * (consumed after save), exactly as the amounts to store are worked out.
 *
 * The save used to compare the tender with the full bill. A walk-in bill settled by a sale
 * return was then seen as "on credit": Mix Payment after an S/R adjust, and the refund of a
 * return worth more than the bill, were refused with "Customer Name Required".
 */
export function mixPaymentUnpaidOnBill(p: {
  netAmount: number;
  saleReturnAdjust?: number;
  creditApplied?: number;
  advanceApplied?: number;
  totalPaid: number;
}): number {
  const afterReturns = Math.max(
    0,
    round2((Number(p.netAmount) || 0) - Math.max(0, Number(p.saleReturnAdjust) || 0) - Math.max(0, Number(p.creditApplied) || 0)),
  );
  const payable = Math.max(0, round2(afterReturns - Math.max(0, Number(p.advanceApplied) || 0)));
  return mixPaymentCreditDue(payable, p.totalPaid);
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
