const TOLERANCE = 0.01;

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export type PosUpdateCreditPlan = {
  /** Credit the bill already holds (row S/R or live CN vouchers, whichever is larger). */
  heldCredit: number;
  /** Run release_sale_credit before the bill is rewritten. */
  release: boolean;
  /** sale_return_adjust written with the bill update. */
  headerSaleReturnAdjust: number;
  /** Apply S/R + Cr credit through apply_pos_credit after the update (as a new bill does). */
  applyCredit: boolean;
  /** Pass the exchange excess to applyPosBillCredit (only when nothing was released). */
  passExchangeExcess: boolean;
};

/**
 * POS full edit (Save / Mix on an existing bill): decide what happens to the
 * S/R + Cr credit already applied to the bill.
 *
 * Credit that is unchanged stays on the bill and is not taken from the
 * customer's returns again. Before this, every edit of a bill with S/R ran
 * the S/R consume a second time: the return was already used by this bill,
 * so the save failed with "no available credit notes" after the items had
 * been rewritten, or it silently used up another pending return.
 */
export function planPosUpdateCredit(params: {
  customerId: string | null | undefined;
  previousCustomerId: string | null | undefined;
  storedSaleReturnAdjust: number;
  liveCreditNoteAdjust: number;
  saleReturnAdjust: number;
  creditApplied: number;
}): PosUpdateCreditPlan {
  const customerId = String(params.customerId || "").trim() || null;
  const previousCustomerId = String(params.previousCustomerId || "").trim() || null;
  const stored = Math.max(0, roundMoney(params.storedSaleReturnAdjust));
  const live = Math.max(0, roundMoney(params.liveCreditNoteAdjust));
  const heldCredit = Math.max(stored, live);
  const nextSr = Math.max(0, roundMoney(params.saleReturnAdjust));
  const nextCredit = roundMoney(nextSr + Math.max(0, roundMoney(params.creditApplied)));

  if (!customerId) {
    // Walk-in: the same-bill return is stored directly on the row (as on a new bill).
    // Credit vouchers left from a customer who was removed from the bill go back to them.
    return {
      heldCredit,
      release: !!previousCustomerId && heldCredit > TOLERANCE,
      headerSaleReturnAdjust: nextSr,
      applyCredit: false,
      passExchangeExcess: false,
    };
  }

  const customerChanged = previousCustomerId !== customerId;
  const changed = customerChanged || Math.abs(nextCredit - heldCredit) > TOLERANCE;
  if (!changed) {
    return {
      heldCredit,
      release: false,
      headerSaleReturnAdjust: heldCredit,
      applyCredit: false,
      passExchangeExcess: false,
    };
  }

  const release = heldCredit > TOLERANCE;
  return {
    heldCredit,
    release,
    // apply_pos_credit adds the credit to the row; writing it here would double it.
    headerSaleReturnAdjust: 0,
    applyCredit: nextCredit > TOLERANCE,
    // A released bill's earlier exchange consume is not given back by the release,
    // so consuming the excess again would take it twice.
    passExchangeExcess: !release,
  };
}
