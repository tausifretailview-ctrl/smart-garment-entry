/**
 * POS / Daily cashier cash-in helpers.
 *
 * Same-day invoice-linked receipts (reference_type=sale) must not be added on top of
 * sale tenders when tenders already include that money (POS Dashboard dual-write history).
 * Prior-day sale receipts and true customer/OB receipts still count in full.
 */

import { isHoldSaleNumber } from "@/utils/posHoldBill";

const OVERLAP_EPS = 0.5;

export type CashierSaleRow = {
  id?: string | null;
  payment_method?: string | null;
  payment_status?: string | null;
  sale_number?: string | null;
  net_amount?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  is_cancelled?: boolean | null;
};

export type CashierReceiptRow = {
  voucher_type?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  payment_method?: string | null;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
};

export type SaleForCashierOverlap = {
  id: string;
  net_amount?: number | null;
  paid_amount?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
};

export type CashierReceivableSale = SaleForCashierOverlap & {
  payment_status?: string | null;
  sale_number?: string | null;
  is_cancelled?: boolean | null;
};

/** Raw same-day invoice-linked receipt totals keyed by sale id. */
export function sumSameDaySaleLinkedReceiptsBySaleId(
  sales: SaleForCashierOverlap[],
  receipts: Array<{
    voucher_type?: string | null;
    reference_type?: string | null;
    reference_id?: string | null;
    total_amount?: number | null;
  }>,
): Map<string, number> {
  const salesById = new Map<string, SaleForCashierOverlap>();
  for (const s of sales) {
    if (s?.id) salesById.set(s.id, s);
  }

  const receiptSumBySale = new Map<string, number>();
  for (const v of receipts) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    if (!isInvoiceLinkedSaleReceipt(v.reference_type)) continue;
    const sid = v.reference_id;
    if (!sid || !salesById.has(sid)) continue;
    const amt = Number(v.total_amount) || 0;
    if (amt <= 0) continue;
    receiptSumBySale.set(sid, (receiptSumBySale.get(sid) || 0) + amt);
  }
  return receiptSumBySale;
}

/**
 * Same-day sale RCP increment for effective settlement — excludes receipts already
 * reflected in paid_amount (partial credit paid same day).
 */
export function sameDaySaleRcpIncrementForEffectivePaid(
  paid: number,
  tender: number,
  rcpSum: number,
  net: number,
): number {
  if (rcpSum <= OVERLAP_EPS) return 0;
  if (paid >= net - OVERLAP_EPS) return 0;
  if (paid >= tender + rcpSum - OVERLAP_EPS) return 0;
  return rcpSum;
}

export function computeEffectivePaidOnSale(
  net: number,
  paid: number,
  tender: number,
  sameDaySaleRcpSum: number,
): number {
  const increment = sameDaySaleRcpIncrementForEffectivePaid(
    paid,
    tender,
    sameDaySaleRcpSum,
    net,
  );
  return Math.min(Math.max(0, net), paid + increment);
}

/**
 * Cashier Report Actual Net Receivable:
 *   sum(effective paid on today's sales) + old-balance receipts + fees.
 * Same-day invoice RCP is folded into effective paid (not Old Payment Receipts).
 */
export function computeCashierActualNetReceivable(params: {
  sales: CashierReceivableSale[];
  receipts: CashierReceiptRow[];
  resolveNet: (sale: CashierReceivableSale) => number;
  feeTotal?: number;
}): {
  effectivePaidTotal: number;
  oldBalanceReceiptTotal: number;
  oldBalanceReceiptCount: number;
  actualNetReceivable: number;
} {
  const eligibleSales = params.sales.filter((sale) => {
    if (sale.is_cancelled) return false;
    if (sale.payment_status === "cancelled") return false;
    if (isHoldLikeSale(sale)) return false;
    return !!sale.id;
  });

  const salesById = new Set(eligibleSales.map((s) => s.id as string));
  const receiptSumBySale = sumSameDaySaleLinkedReceiptsBySaleId(
    eligibleSales,
    params.receipts,
  );

  let effectivePaidTotal = 0;
  for (const sale of eligibleSales) {
    const net = params.resolveNet(sale);
    const paid = Math.max(0, Number(sale.paid_amount) || 0);
    const tender = saleTenderTotal(sale);
    const rcpSum = receiptSumBySale.get(sale.id as string) || 0;
    effectivePaidTotal += computeEffectivePaidOnSale(net, paid, tender, rcpSum);
  }

  let oldBalanceReceiptTotal = 0;
  let oldBalanceReceiptCount = 0;
  for (const v of params.receipts) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    const amt = Number(v.total_amount) || 0;
    if (amt <= 0) continue;
    const sid = v.reference_id;
    if (isInvoiceLinkedSaleReceipt(v.reference_type) && sid && salesById.has(sid)) {
      continue;
    }
    oldBalanceReceiptTotal += amt;
    oldBalanceReceiptCount += 1;
  }

  const feeTotal = Number(params.feeTotal || 0);
  const actualNetReceivable = effectivePaidTotal + oldBalanceReceiptTotal + feeTotal;

  return {
    effectivePaidTotal: Math.round(effectivePaidTotal * 100) / 100,
    oldBalanceReceiptTotal: Math.round(oldBalanceReceiptTotal * 100) / 100,
    oldBalanceReceiptCount,
    actualNetReceivable: Math.round(actualNetReceivable * 100) / 100,
  };
}

/** Invoice-linked RCP (balance collect / FloatingPayments against a sale id). */
export function isInvoiceLinkedSaleReceipt(
  referenceType: string | null | undefined,
): boolean {
  return String(referenceType || "").toLowerCase() === "sale";
}

export function saleTenderTotal(sale: {
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
}): number {
  return (
    Math.max(0, Number(sale.cash_amount) || 0) +
    Math.max(0, Number(sale.card_amount) || 0) +
    Math.max(0, Number(sale.upi_amount) || 0)
  );
}

/**
 * Two-pass dedupe: when a sale on this reporting day has tenders + sale-linked
 * receipts exceeding net, strip that overlap from receipt cash-in (already in tenders).
 */
export function createSameDaySaleReceiptOverlapTracker(
  sales: SaleForCashierOverlap[],
  receipts: Array<{
    voucher_type?: string | null;
    reference_type?: string | null;
    reference_id?: string | null;
    total_amount?: number | null;
  }>,
) {
  const salesById = new Map<string, SaleForCashierOverlap>();
  for (const s of sales) {
    if (s?.id) salesById.set(s.id, s);
  }

  const receiptSumBySale = new Map<string, number>();
  for (const v of receipts) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    if (!isInvoiceLinkedSaleReceipt(v.reference_type)) continue;
    const sid = v.reference_id;
    if (!sid || !salesById.has(sid)) continue;
    const amt = Number(v.total_amount) || 0;
    if (amt <= 0) continue;
    receiptSumBySale.set(sid, (receiptSumBySale.get(sid) || 0) + amt);
  }

  const remainingOverlap = new Map<string, number>();
  for (const [sid, receiptSum] of receiptSumBySale) {
    const sale = salesById.get(sid);
    if (!sale) continue;
    const tender = saleTenderTotal(sale);
    const net = Math.max(0, Number(sale.net_amount) || 0);
    const overlap = Math.max(0, tender + receiptSum - net);
    if (overlap > OVERLAP_EPS) remainingOverlap.set(sid, overlap);
  }

  return {
    /**
     * How much of this receipt should enter Old Balance / RCP cash-in.
     * Non-sale refs and prior-day sale refs return full amount.
     */
    countableAmount(v: {
      voucher_type?: string | null;
      reference_type?: string | null;
      reference_id?: string | null;
      total_amount?: number | null;
    }): number {
      const raw = Number(v.total_amount) || 0;
      if (raw <= 0) return 0;
      if (String(v.voucher_type || "").toLowerCase() !== "receipt") return 0;
      if (!isInvoiceLinkedSaleReceipt(v.reference_type)) return raw;
      const sid = v.reference_id;
      if (!sid || !salesById.has(sid)) return raw;
      const left = remainingOverlap.get(sid) || 0;
      if (left <= OVERLAP_EPS) return raw;
      const strip = Math.min(raw, left);
      remainingOverlap.set(sid, left - strip);
      return Math.round((raw - strip) * 100) / 100;
    },
  };
}

function resolveMode(paymentMethod: string | null | undefined, description: string): string | null {
  const pm = (paymentMethod || "").toLowerCase().trim();
  if (pm === "upi") return "upi";
  if (pm === "card") return "card";
  if (pm === "bank" || pm === "cheque" || pm === "neft" || pm === "bank_transfer") return "bank";
  if (pm === "advance_adjustment" || pm === "credit_note") return null;
  if (pm === "cash") return "cash";
  const d = (description || "").toLowerCase();
  if (d.includes("upi")) return "upi";
  if (d.includes("card")) return "card";
  if (d.includes("bank") || d.includes("neft") || d.includes("cheque")) return "bank";
  return "cash";
}

function isHoldLikeSale(sale: CashierSaleRow): boolean {
  if (sale.payment_status === "hold") return true;
  return isHoldSaleNumber(sale.sale_number);
}

/** Mirrors FloatingPOSReports cash legs with same-day sale-RCP overlap stripped. */
export function reduceCashierCashIn(params: {
  sales: CashierSaleRow[];
  receipts: CashierReceiptRow[];
  advanceCash?: number;
}): {
  cashSale: number;
  receiptCash: number;
  totalCashIn: number;
} {
  let cashSale = 0;
  let receiptCash = 0;
  const advanceCash = Number(params.advanceCash || 0);

  const eligibleSales = params.sales.filter((sale) => {
    if (sale.is_cancelled) return false;
    if (sale.payment_status === "cancelled") return false;
    if (isHoldLikeSale(sale)) return false;
    return true;
  });

  for (const sale of eligibleSales) {
    const net = Number(sale.net_amount) || 0;
    if (sale.payment_method === "multiple") {
      cashSale += Number(sale.cash_amount) || 0;
    } else {
      switch (sale.payment_method) {
        case "cash":
          cashSale += Number(sale.cash_amount) || net;
          break;
        case "card":
        case "upi":
        case "pay_later":
          break;
        default:
          cashSale += net;
      }
    }
  }

  const overlapSales: SaleForCashierOverlap[] = eligibleSales
    .filter((s): s is CashierSaleRow & { id: string } => !!s.id)
    .map((s) => ({
      id: s.id,
      net_amount: s.net_amount,
      cash_amount: s.cash_amount,
      card_amount: s.card_amount,
      upi_amount: s.upi_amount,
    }));

  const tracker = createSameDaySaleReceiptOverlapTracker(overlapSales, params.receipts);

  for (const v of params.receipts) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    const m = resolveMode(v.payment_method, v.description || "");
    if (!m || m !== "cash") continue;
    receiptCash += tracker.countableAmount(v);
  }

  return {
    cashSale: Math.round(cashSale),
    receiptCash: Math.round(receiptCash),
    totalCashIn: Math.round(cashSale + advanceCash + receiptCash),
  };
}
