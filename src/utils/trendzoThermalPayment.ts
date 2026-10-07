/**
 * Trendzo 80mm payment + party-account rows.
 *
 * Mix bills used to print "CASH + CREDIT" with no amounts. Put the rupee
 * split on one pair-row, and Prev Bal / Advance on one pair-row.
 */

export type TrendzoPaymentLine = { label: string; amount: number };

const SHOW_THRESHOLD = 0.5;

export function formatTrendzoMoney(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function buildTrendzoPaymentLines(opts: {
  cashPaid?: number;
  upiPaid?: number;
  cardPaid?: number;
  creditPaid?: number;
  paidAmount?: number;
  paymentMethod?: string;
}): TrendzoPaymentLine[] {
  const cash = Number(opts.cashPaid) || 0;
  const upi = Number(opts.upiPaid) || 0;
  const card = Number(opts.cardPaid) || 0;
  const credit = Number(opts.creditPaid) || 0;
  const lines: TrendzoPaymentLine[] = [];
  if (cash > 0.005) lines.push({ label: "CASH", amount: cash });
  if (upi > 0.005) lines.push({ label: "UPI", amount: upi });
  if (card > 0.005) lines.push({ label: "CARD", amount: card });
  if (credit > 0.005) lines.push({ label: "CREDIT", amount: credit });
  if (lines.length === 0) {
    const paid = Number(opts.paidAmount) || 0;
    if (paid > 0.005) {
      lines.push({
        label: (opts.paymentMethod || "CASH").toUpperCase().replace(/_/g, " "),
        amount: paid,
      });
    }
  }
  return lines;
}

/** "CASH + CREDIT" — keep the Payment | Paid row short so Paid is not clipped. */
export function formatTrendzoPaymentModeLabel(
  lines: TrendzoPaymentLine[],
  paymentMethod?: string,
): string {
  if (lines.length > 0) {
    return lines.map((line) => line.label).join(" + ");
  }
  return (paymentMethod || "CASH").toUpperCase().replace(/_/g, " ");
}

function formatTrendzoPaymentPart(line: TrendzoPaymentLine): string {
  return `${line.label} ${formatTrendzoMoney(line.amount)}`;
}

/**
 * Mix rupee split on one pair-row: CASH ₹2,000.00 | CREDIT ₹2,500.00.
 * Single-mode bills skip this — Paid already shows the amount.
 */
export function trendzoMixAmountPair(
  lines: TrendzoPaymentLine[],
): { left: string; right?: string } | null {
  if (lines.length < 2) return null;
  if (lines.length === 2) {
    return {
      left: formatTrendzoPaymentPart(lines[0]),
      right: formatTrendzoPaymentPart(lines[1]),
    };
  }
  const mid = Math.ceil(lines.length / 2);
  return {
    left: lines.slice(0, mid).map(formatTrendzoPaymentPart).join(" + "),
    right: lines.slice(mid).map(formatTrendzoPaymentPart).join(" + "),
  };
}

const round2 = (n: number): number => {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
};

/**
 * WhatsApp PDF snapshot stores Rule B `netAmount` (full bill) plus S/R on its own line.
 * Grand total and balance are what the customer still has to pay after that return.
 * A cash refund (return bigger than the new bill) is not a balance due.
 *
 * POS/26-27/167: bill ₹3,300, S/R ₹3,300, cash refund ₹200 → grand ₹0, balance ₹0, refund ₹200.
 * The old PDF printed grand ₹3,300, paid ₹3,300, and balance due ₹3,300.
 */
export function posWhatsAppReceiptFigures(input: {
  netAmount: number;
  saleReturnAdjust?: number;
  paidAmount?: number;
  refundAmount?: number;
}): {
  grandTotal: number;
  saleReturnAdjust: number;
  paidAmount: number;
  balanceDue: number;
  refundCash: number;
} {
  const net = round2(input.netAmount);
  const saleReturnAdjust = Math.max(0, round2(input.saleReturnAdjust || 0));
  const paidAmount = Math.max(0, round2(input.paidAmount || 0));
  const refundCash = Math.abs(round2(input.refundAmount || 0));
  const grandTotal = Math.max(0, round2(net - saleReturnAdjust));
  const balanceDue = Math.max(0, round2(grandTotal - paidAmount));
  return { grandTotal, saleReturnAdjust, paidAmount, balanceDue, refundCash };
}

/**
 * Trendzo callers pass grand total two ways: full bill (WhatsApp snapshot before this fix)
 * or payable already net of S/R (POS print). Subtract S/R only when it covers the figure
 * shown and nothing was collected — a partial return whose grand total is already the
 * leftover (₹2,300 after ₹1,000 S/R) must stay ₹2,300.
 */
export function trendzoDisplayedSettlement(opts: {
  grandTotal: number;
  saleReturnAdjust?: number;
  collected?: number;
  refundCash?: number;
}): { grandTotal: number; paid: number; balanceDue: number; refundCash: number } {
  const grand = round2(opts.grandTotal);
  const sra = Math.max(0, round2(opts.saleReturnAdjust || 0));
  const collected = Math.max(0, round2(opts.collected || 0));
  const refundCash = Math.abs(round2(opts.refundCash || 0));
  const srSettlesGrand = sra > 0.5 && grand > 0.5 && sra + 0.5 >= grand && collected <= 0.5;
  const grandTotal = srSettlesGrand ? Math.max(0, round2(grand - sra)) : grand;
  const paid =
    collected > 0.005 ? collected : srSettlesGrand || refundCash > 0.5 ? 0 : Math.max(0, grand);
  const balanceDue = Math.max(0, round2(grandTotal - collected));
  return { grandTotal, paid, balanceDue, refundCash };
}

export function trendzoPartyAccountPair(opts: {
  previousBalance?: number;
  unusedAdvance?: number;
}): { left: string; right?: string } | null {
  const prev = Number(opts.previousBalance) || 0;
  const adv = Number(opts.unusedAdvance) || 0;
  const showPrev = prev > SHOW_THRESHOLD;
  const showAdv = adv > SHOW_THRESHOLD;
  if (!showPrev && !showAdv) return null;
  if (showPrev && showAdv) {
    return {
      left: `Prev Bal ${formatTrendzoMoney(prev)}`,
      right: `Advance ${formatTrendzoMoney(adv)}`,
    };
  }
  if (showPrev) return { left: `Prev Bal ${formatTrendzoMoney(prev)}` };
  return { left: `Advance ${formatTrendzoMoney(adv)}` };
}
