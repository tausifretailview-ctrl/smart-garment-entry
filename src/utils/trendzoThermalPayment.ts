/**
 * Trendzo 80mm payment + party-account rows.
 *
 * Mix bills used to print "CASH + CREDIT" with no amounts. Put the rupee
 * split on that same Payment line, and Prev Bal / Advance on one pair-row.
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

/** "CASH ₹2,000.00 + CREDIT ₹2,500.00" — mix details on one payment row. */
export function formatTrendzoPaymentModeLabel(
  lines: TrendzoPaymentLine[],
  paymentMethod?: string,
): string {
  if (lines.length > 0) {
    return lines.map((line) => `${line.label} ${formatTrendzoMoney(line.amount)}`).join(" + ");
  }
  return (paymentMethod || "CASH").toUpperCase().replace(/_/g, " ");
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
