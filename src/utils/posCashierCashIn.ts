/**
 * Pure cash-in reducer for POS cashier panels (FloatingPOSReports / DailyTally shape).
 * Isolated so Phase 1 can assert: after dual-write stop, totalCashIn has no tender∩receipt overlap.
 */
export type CashierSaleRow = {
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
  payment_method?: string | null;
  description?: string | null;
  reference_type?: string | null;
};

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
  return sale.payment_status === "pending" && String(sale.sale_number || "").startsWith("Hold/");
}

/** Mirrors FloatingPOSReports.calculateTotals cash legs (no advances/outflows). */
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

  for (const sale of params.sales) {
    if (sale.is_cancelled) continue;
    if (sale.payment_status === "cancelled") continue;
    if (isHoldLikeSale(sale)) continue;
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

  for (const v of params.receipts) {
    if (String(v.voucher_type || "").toLowerCase() !== "receipt") continue;
    const amt = Number(v.total_amount) || 0;
    if (amt <= 0) continue;
    const m = resolveMode(v.payment_method, v.description || "");
    if (!m || m !== "cash") continue;
    receiptCash += amt;
  }

  return {
    cashSale: Math.round(cashSale),
    receiptCash: Math.round(receiptCash),
    totalCashIn: Math.round(cashSale + advanceCash + receiptCash),
  };
}
