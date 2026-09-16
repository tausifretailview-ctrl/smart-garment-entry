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

import {
  buildCashierReceiptModeMap,
  getCashierSalePaymentModeAmounts,
  toCashierOverlapSaleRow,
} from "@/utils/cashierSaleModeAmounts";
import { createSameDaySaleReceiptOverlapTracker } from "@/utils/posCashierCashIn";
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
  customer_id?: string | null;
  sale_type?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  sale_number?: string | null;
  net_amount?: number | null;
  paid_amount?: number | null;
  sale_return_adjust?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  is_cancelled?: boolean | null;
};

export type CashTallyVoucherInput = {
  voucher_type?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
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

  const receiptVouchers = (params.vouchers || []).filter(
    (v) => String(v.voucher_type || "").toLowerCase() === "receipt",
  );
  const receiptModeBySale = buildCashierReceiptModeMap(
    (params.sales || [])
      .filter((s) => s?.id && !isHoldLikeSale(s))
      .map((s) => ({
        id: s.id as string,
        sale_number: s.sale_number,
        customer_id: s.customer_id,
        net_amount: s.net_amount,
        sale_return_adjust: s.sale_return_adjust,
      })),
    receiptVouchers.map((v) => ({
      reference_id: v.reference_id,
      reference_type: v.reference_type,
      total_amount: v.total_amount,
      discount_amount: v.discount_amount,
      payment_method: v.payment_method,
      description: v.description,
    })),
  );

  const displayModesBySaleId = new Map<
    string,
    ReturnType<typeof getCashierSalePaymentModeAmounts>
  >();

  for (const s of params.sales || []) {
    if (isHoldLikeSale(s)) continue;
    const net = getEffectiveNet(s);
    const target = s.sale_type === "pos" ? posSales : invoiceSales;
    const receiptModes = s.id ? receiptModeBySale.get(s.id) : undefined;
    const displayModes = getCashierSalePaymentModeAmounts(s, receiptModes);
    if (s.id) {
      displayModesBySaleId.set(s.id, displayModes);
    }

    if (s.payment_method === "pay_later") {
      target.credit += net;
    } else {
      target.cash += displayModes.cash;
      target.card += displayModes.card;
      target.upi += displayModes.upi;
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
      .map((s) => {
        const displayModes =
          displayModesBySaleId.get(s.id as string) ??
          getCashierSalePaymentModeAmounts(
            s,
            receiptModeBySale.get(s.id as string),
          );
        return toCashierOverlapSaleRow(s, displayModes);
      }),
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
