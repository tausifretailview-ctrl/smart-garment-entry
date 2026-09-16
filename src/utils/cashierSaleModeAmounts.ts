/**
 * Cashier-report payment-mode columns for sales rows.
 * Reuses POS Dashboard gap-fill so mix bills with paid_amount but missing tender
 * columns still appear in Cash/Card/UPI breakdown (display-only aggregation).
 */

import {
  buildSaleReceiptModeAmountMap,
  type SaleReceiptModeAmounts,
} from "@/utils/customerBalanceUtils";
import {
  getPosPaymentModeDisplayAmounts,
  type PosDashboardSaleLike,
} from "@/utils/posDashboardSettlement";
import type { SaleForCashierOverlap } from "@/utils/posCashierCashIn";
import { cashierSaleTenderAmount } from "@/utils/posCashierCashIn";

export type CashierSaleModeInput = PosDashboardSaleLike & {
  id?: string | null;
  customer_id?: string | null;
  paid_amount?: number | null;
};

export type CashierReceiptModeRow = {
  reference_id?: string | null;
  reference_type?: string | null;
  total_amount?: number | null;
  discount_amount?: number | null;
  payment_method?: string | null;
  description?: string | null;
};

/** Build per-sale Cash/Card/UPI from linked receipt vouchers (same as POS Dashboard). */
export function buildCashierReceiptModeMap(
  sales: Array<{
    id: string;
    sale_number?: string | null;
    customer_id?: string | null;
    net_amount?: number | null;
    sale_return_adjust?: number | null;
  }>,
  receiptRows: CashierReceiptModeRow[],
): Map<string, SaleReceiptModeAmounts> {
  if (sales.length === 0 || receiptRows.length === 0) {
    return new Map();
  }
  return buildSaleReceiptModeAmountMap(
    sales,
    receiptRows.map((row) => ({
      reference_id: row.reference_id ?? null,
      reference_type: row.reference_type ?? null,
      total_amount: row.total_amount ?? null,
      discount_amount: row.discount_amount ?? null,
      payment_method: row.payment_method ?? null,
      description: row.description ?? null,
      voucher_type: "receipt",
    })),
  );
}

/** Display Cash/Card/UPI for one sale row in cashier reports. */
export function getCashierSalePaymentModeAmounts(
  sale: CashierSaleModeInput,
  voucherModeAmounts?: SaleReceiptModeAmounts | null,
): SaleReceiptModeAmounts {
  const method = String(sale.payment_method || "").toLowerCase();
  const net = Math.max(0, Number(sale.net_amount) || 0);

  if (method === "pay_later") {
    return { cash: 0, card: 0, upi: 0 };
  }

  if (method === "multiple") {
    return getPosPaymentModeDisplayAmounts(sale, voucherModeAmounts ?? null);
  }

  switch (method) {
    case "cash":
      return {
        cash: cashierSaleTenderAmount(sale.cash_amount, net),
        card: 0,
        upi: 0,
      };
    case "card":
      return {
        cash: 0,
        card: cashierSaleTenderAmount(sale.card_amount, net),
        upi: 0,
      };
    case "upi":
      return {
        cash: 0,
        card: 0,
        upi: cashierSaleTenderAmount(sale.upi_amount, net),
      };
    default:
      return getPosPaymentModeDisplayAmounts(sale, voucherModeAmounts ?? null);
  }
}

export function sumCashierModeAmounts(
  modes: SaleReceiptModeAmounts,
): number {
  return Math.round((modes.cash + modes.card + modes.upi) * 100) / 100;
}

/** Overlap tracker should use display tender so gap-filled at-sale money strips matching RCP. */
export function toCashierOverlapSaleRow(
  sale: CashierSaleModeInput,
  displayModes: SaleReceiptModeAmounts,
): SaleForCashierOverlap {
  return {
    id: String(sale.id || ""),
    net_amount: sale.net_amount,
    paid_amount: sale.paid_amount,
    cash_amount: displayModes.cash,
    card_amount: displayModes.card,
    upi_amount: displayModes.upi,
  };
}
