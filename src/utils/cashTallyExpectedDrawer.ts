/**
 * Expected drawer cash — same formula FloatingCashTally uses.
 *
 * expected = opening + cash in − cash out
 * cash in  = POS sales + invoice sales + countable receipts + advances (cash legs)
 * cash out = supplier + expense + salary + third-party + sale-return refunds + advance refunds (cash legs)
 *
 * Presentation layers (Cashier Report headline, Cash Tally dialog) must call these
 * helpers rather than re-deriving the identity.
 */

import { allocateMixPaymentToBill } from "@/utils/mixPaymentAllocation";
import {
  cashierSaleTenderAmount,
  createSameDaySaleReceiptOverlapTracker,
} from "@/utils/posCashierCashIn";
import { classifyDailyTallyPaymentOutflow } from "@/utils/accounting/thirdPartyVoucherCash";

export type CashTallyModeBreakdown = {
  cash: number;
  upi: number;
  card: number;
  bank: number;
  credit: number;
  total: number;
};

export const emptyCashTallyBreakdown = (): CashTallyModeBreakdown => ({
  cash: 0,
  upi: 0,
  card: 0,
  bank: 0,
  credit: 0,
  total: 0,
});

/** FloatingCashTally / DailyTally expected-cash identity. */
export function computeExpectedDrawerCash(
  openingCash: number,
  cashIn: number,
  cashOut: number,
): number {
  return (Number(openingCash) || 0) + (Number(cashIn) || 0) - (Number(cashOut) || 0);
}

export function resolveCashTallyPaymentMode(
  paymentMethod: string | null | undefined,
  description: string,
): keyof Omit<CashTallyModeBreakdown, "total" | "credit"> {
  const pm = (paymentMethod || "").toLowerCase().trim();
  if (pm === "upi") return "upi";
  if (pm === "card") return "card";
  if (pm === "bank" || pm === "cheque" || pm === "neft" || pm === "rtgs" || pm === "bank_transfer") {
    return "bank";
  }
  if (pm === "cash") return "cash";
  const d = (description || "").toLowerCase();
  if (d.includes("upi")) return "upi";
  if (d.includes("card")) return "card";
  if (d.includes("cheque") || d.includes("bank") || d.includes("neft") || d.includes("rtgs")) {
    return "bank";
  }
  return "cash";
}

export type CashTallySaleInput = {
  id?: string | null;
  sale_type?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  sale_number?: string | null;
  net_amount?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  is_cancelled?: boolean | null;
};

export type CashTallyVoucherInput = {
  voucher_type?: string | null;
  total_amount?: number | null;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  category?: string | null;
  payment_method?: string | null;
};

export type CashTallyAdvanceInput = {
  amount?: number | null;
  payment_method?: string | null;
};

export type CashTallySaleReturnInput = {
  net_amount?: number | null;
  refund_type?: string | null;
};

export type CashTallyAdvanceRefundInput = {
  refund_amount?: number | null;
  payment_method?: string | null;
};

export type CashTallyDrawerFlows = {
  posSales: CashTallyModeBreakdown;
  invoiceSales: CashTallyModeBreakdown;
  receipts: CashTallyModeBreakdown;
  advances: CashTallyModeBreakdown;
  supplierPayments: CashTallyModeBreakdown;
  expenses: CashTallyModeBreakdown;
  employeeSalary: CashTallyModeBreakdown;
  thirdPartyPayments: CashTallyModeBreakdown;
  saleReturnRefunds: CashTallyModeBreakdown;
  advanceRefunds: CashTallyModeBreakdown;
  cashIn: number;
  cashOut: number;
};

const isHoldLikeSale = (s: CashTallySaleInput) => {
  if (s?.payment_status === "hold") return true;
  return s?.payment_status === "pending" && String(s?.sale_number || "").startsWith("Hold/");
};

/**
 * Aggregate money-in / money-out the same way FloatingCashTally does.
 * Used by Cash Tally UI and the Cashier Report "Expected cash in drawer" headline.
 */
export function aggregateCashTallyDrawerFlows(params: {
  sales: CashTallySaleInput[] | null | undefined;
  vouchers: CashTallyVoucherInput[] | null | undefined;
  advances: CashTallyAdvanceInput[] | null | undefined;
  saleReturns: CashTallySaleReturnInput[] | null | undefined;
  advanceRefunds: CashTallyAdvanceRefundInput[] | null | undefined;
}): CashTallyDrawerFlows {
  const posSales = emptyCashTallyBreakdown();
  const invoiceSales = emptyCashTallyBreakdown();
  const receipts = emptyCashTallyBreakdown();
  const advances = emptyCashTallyBreakdown();
  const supplierPayments = emptyCashTallyBreakdown();
  const expenses = emptyCashTallyBreakdown();
  const employeeSalary = emptyCashTallyBreakdown();
  const thirdPartyPayments = emptyCashTallyBreakdown();
  const saleReturnRefunds = emptyCashTallyBreakdown();
  const advanceRefundsBd = emptyCashTallyBreakdown();

  const getEffectiveNet = (s: CashTallySaleInput) => Number(s?.net_amount) || 0;

  for (const s of params.sales || []) {
    if (isHoldLikeSale(s)) continue;
    const net = getEffectiveNet(s);
    const target = s.sale_type === "pos" ? posSales : invoiceSales;
    if (s.payment_method === "multiple") {
      const applied = allocateMixPaymentToBill({
        billAmount: net,
        cashAmount: Number(s.cash_amount) || 0,
        cardAmount: Number(s.card_amount) || 0,
        upiAmount: Number(s.upi_amount) || 0,
      });
      target.cash += applied.cash;
      target.card += applied.card;
      target.upi += applied.upi;
    } else {
      switch (s.payment_method) {
        case "cash":
          target.cash += cashierSaleTenderAmount(s.cash_amount, net);
          break;
        case "card":
          target.card += cashierSaleTenderAmount(s.card_amount, net);
          break;
        case "upi":
          target.upi += cashierSaleTenderAmount(s.upi_amount, net);
          break;
        case "pay_later":
          target.credit += net;
          break;
        default:
          target.cash += net;
      }
    }
    target.total += net;
  }

  const receiptOverlap = createSameDaySaleReceiptOverlapTracker(
    (params.sales || [])
      .filter(
        (s) =>
          s?.id &&
          !isHoldLikeSale(s) &&
          !s?.is_cancelled &&
          s?.payment_status !== "cancelled",
      )
      .map((s) => ({
        id: s.id as string,
        net_amount: s.net_amount,
        cash_amount: s.cash_amount,
        card_amount: s.card_amount,
        upi_amount: s.upi_amount,
      })),
    params.vouchers || [],
  );

  const addToBreakdown = (b: CashTallyModeBreakdown, mode: keyof Omit<CashTallyModeBreakdown, "total" | "credit">, amt: number) => {
    b[mode] += amt;
    b.total += amt;
  };

  for (const v of params.vouchers || []) {
    const rawAmt = Number(v.total_amount) || 0;
    if (rawAmt <= 0) continue;
    const pm = (v.payment_method || "").toLowerCase();
    if (pm === "advance_adjustment" || pm === "credit_note" || pm === "advance") continue;

    const mode = resolveCashTallyPaymentMode(v.payment_method, v.description || "");

    if (v.voucher_type === "receipt") {
      const amt = receiptOverlap.countableAmount(v);
      if (amt > 0) addToBreakdown(receipts, mode, amt);
    } else if (v.voucher_type === "payment") {
      if (v.reference_type === "supplier") addToBreakdown(supplierPayments, mode, rawAmt);
      else if (v.reference_type === "employee") addToBreakdown(employeeSalary, mode, rawAmt);
      else if (classifyDailyTallyPaymentOutflow(v) === "third_party") {
        addToBreakdown(thirdPartyPayments, mode, rawAmt);
      } else if (v.reference_type === "customer") {
        addToBreakdown(saleReturnRefunds, mode, rawAmt);
      }
    } else if (v.voucher_type === "expense" || v.category === "expense") {
      addToBreakdown(expenses, mode, rawAmt);
    }
  }

  for (const a of params.advances || []) {
    const amt = Number(a.amount) || 0;
    const mode = (a.payment_method || "cash").toLowerCase();
    if (mode === "upi") advances.upi += amt;
    else if (mode === "card") advances.card += amt;
    else if (mode === "bank" || mode === "cheque") advances.bank += amt;
    else advances.cash += amt;
    advances.total += amt;
  }

  for (const r of params.saleReturns || []) {
    const refundType = (r.refund_type || "").toLowerCase();
    if (
      refundType === "cash_refund" ||
      refundType === "upi_refund" ||
      refundType === "bank_refund" ||
      refundType === "card_refund"
    ) {
      const amt = Number(r.net_amount) || 0;
      if (refundType === "upi_refund") saleReturnRefunds.upi += amt;
      else if (refundType === "bank_refund") saleReturnRefunds.bank += amt;
      else if (refundType === "card_refund") saleReturnRefunds.card += amt;
      else saleReturnRefunds.cash += amt;
      saleReturnRefunds.total += amt;
    }
  }

  for (const r of params.advanceRefunds || []) {
    const amt = Number(r.refund_amount) || 0;
    if (amt <= 0) continue;
    const mode = resolveCashTallyPaymentMode(r.payment_method, "");
    addToBreakdown(advanceRefundsBd, mode, amt);
  }

  const inParts = [posSales, invoiceSales, receipts, advances];
  const outParts = [
    supplierPayments,
    expenses,
    employeeSalary,
    thirdPartyPayments,
    saleReturnRefunds,
    advanceRefundsBd,
  ];

  const cashIn = inParts.reduce((sum, p) => sum + p.cash, 0);
  const cashOut = outParts.reduce((sum, p) => sum + p.cash, 0);

  return {
    posSales,
    invoiceSales,
    receipts,
    advances,
    supplierPayments,
    expenses,
    employeeSalary,
    thirdPartyPayments,
    saleReturnRefunds,
    advanceRefunds: advanceRefundsBd,
    cashIn,
    cashOut,
  };
}
