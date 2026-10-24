import { trendzoDisplayedSettlement } from "@/utils/trendzoThermalPayment";

const round2 = (n: number): number => {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

/**
 * One money reading for every thermal receipt: POS screen, POS dashboard, and
 * WhatsApp PDF all render through InvoiceWrapper, so they must share this.
 *
 * A return that covers the bill is not a balance due. A minus net (−200) is the
 * cash refund. A caller that stuffed the full bill into Cash (dashboard used
 * net_amount) is clamped back to the amount actually paid.
 */
export function normalizeThermalReceiptMoney(input: {
  grandTotal: number;
  saleReturnAdjust?: number;
  paidAmount?: number;
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  refundCash?: number;
  /** Advance / gift voucher adjusted on the bill: settled, but not counter tender. */
  advanceAdjusted?: number;
}): {
  grandTotal: number;
  paidAmount: number;
  cashPaid: number;
  upiPaid: number;
  cardPaid: number;
  creditPaid: number;
  refundCash: number;
  balanceDue: number;
} {
  let cash = Math.max(0, round2(input.cashPaid || 0));
  let upi = Math.max(0, round2(input.upiPaid || 0));
  let card = Math.max(0, round2(input.cardPaid || 0));
  let credit = Math.max(0, round2(input.creditPaid || 0));
  let paid = Math.max(0, round2(input.paidAmount || 0));
  let refund = Math.abs(round2(input.refundCash || 0));
  let grand = round2(input.grandTotal);

  if (grand < -0.005) {
    refund = Math.max(refund, round2(Math.abs(grand)));
    grand = 0;
    paid = 0;
    cash = 0;
    upi = 0;
    card = 0;
    credit = 0;
  }

  // Credit is the part left on the customer's account (owed, not paid), so only the
  // tender modes are clamped to paid. A ₹500 cash + ₹500 credit bill keeps 500 / 500.
  const tenderSum = round2(cash + upi + card);
  if (tenderSum > paid + 0.5) {
    if (paid <= 0.5) {
      cash = 0;
      upi = 0;
      card = 0;
    } else {
      const scale = paid / tenderSum;
      cash = round2(cash * scale);
      upi = round2(upi * scale);
      card = round2(Math.max(0, paid - cash - upi));
    }
  }

  // paid without tender columns may already hold the advance (saved bill), so it is not added twice.
  const advance = grand > 0.005 ? Math.max(0, round2(input.advanceAdjusted || 0)) : 0;
  const collected = round2(cash + upi + card);
  const shown = trendzoDisplayedSettlement({
    grandTotal: grand,
    saleReturnAdjust: input.saleReturnAdjust,
    collected: round2((collected > 0.005 ? collected : Math.max(0, paid - advance)) + advance),
    refundCash: refund,
  });

  return {
    grandTotal: shown.grandTotal,
    paidAmount: shown.paid,
    cashPaid: cash,
    upiPaid: upi,
    cardPaid: card,
    creditPaid: credit,
    refundCash: shown.refundCash,
    balanceDue: shown.balanceDue,
  };
}

/**
 * Saved sale row → thermal tender. Never uses net_amount as cash received.
 * `advanceAdjusted` (advance / gift voucher on the bill) is in paid_amount but is not a tender mode.
 */
export function saleRowThermalTender(
  sale: {
    payment_method?: string | null;
    paid_amount?: number | null;
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
    credit_amount?: number | null;
  },
  advanceAdjusted = 0,
): {
  cashPaid: number;
  upiPaid: number;
  cardPaid: number;
  creditPaid: number;
  paidAmount: number;
} {
  const paid = Math.max(0, round2(sale.paid_amount || 0));
  let cash = Math.max(0, round2(sale.cash_amount || 0));
  let card = Math.max(0, round2(sale.card_amount || 0));
  let upi = Math.max(0, round2(sale.upi_amount || 0));
  let credit = Math.max(0, round2(sale.credit_amount || 0));
  const sum = round2(cash + card + upi + credit);
  const method = String(sale.payment_method || "").toLowerCase();
  const counterPaid = Math.max(0, round2(paid - Math.max(0, Number(advanceAdjusted) || 0)));
  if (sum <= 0.5 && counterPaid > 0.5) {
    if (method === "upi") upi = counterPaid;
    else if (method === "card") card = counterPaid;
    else if (method === "pay_later" || method === "credit") credit = counterPaid;
    else if (method === "cash") cash = counterPaid;
  }
  return { cashPaid: cash, upiPaid: upi, cardPaid: card, creditPaid: credit, paidAmount: paid };
}
