import type { GstTaxType } from "@/utils/gstRegisterUtils";
import type { PosBillTotals, PosCartItem } from "./types";

/** Shape expected by useSaveSale — keep field names byte-stable. */
export type PosSalePersistPayload = {
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  items: PosCartItem[];
  grossAmount: number;
  discountAmount: number;
  flatDiscountPercent: number;
  flatDiscountAmount: number;
  saleReturnAdjust: number;
  roundOff: number;
  netAmount: number;
  creditApplied: number;
  salesman: string | null;
  notes: string | null;
  pointsRedeemedAmount: number;
  taxType: GstTaxType;
  saleDate?: string;
};

/**
 * Value persisted to `sales.gross_amount`.
 * Exclusive: MRP + GST so dashboard "Sale Amount" matches "Net Sale" when there
 * is no discount. Inclusive / no_gst: unchanged MRP (pre-tax / as-priced) total.
 * On-screen discount math must keep using raw MRP — only the DB write uses this.
 */
export function resolvePersistedSaleGrossAmount(params: {
  taxType: GstTaxType | string | null | undefined;
  mrpTotal: number;
  totalGst: number;
}): number {
  const mrp = Math.round((Number(params.mrpTotal) || 0) * 100) / 100;
  const gst = Math.round((Number(params.totalGst) || 0) * 100) / 100;
  if (String(params.taxType || "").toLowerCase() === "exclusive" && gst > 0.005) {
    return Math.round((mrp + gst) * 100) / 100;
  }
  return mrp;
}

export function buildPosSalePersistPayload(params: {
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  items: PosCartItem[];
  totals: PosBillTotals;
  saleReturnAdjust: number;
  roundOff: number;
  creditApplied: number;
  salesman?: string | null;
  notes?: string | null;
  taxType: GstTaxType;
  saleDate?: string;
}): PosSalePersistPayload {
  return {
    customerId: params.customerId || null,
    customerName: params.customerName,
    customerPhone: params.customerPhone || null,
    items: params.items,
    grossAmount: resolvePersistedSaleGrossAmount({
      taxType: params.taxType,
      mrpTotal: params.totals.mrp,
      totalGst: params.totals.totalGst,
    }),
    discountAmount: params.totals.discount,
    flatDiscountPercent: params.totals.flatDiscountPercent,
    flatDiscountAmount: params.totals.flatDiscountAmount,
    saleReturnAdjust: params.saleReturnAdjust,
    roundOff: params.roundOff,
    netAmount: params.totals.finalAmount,
    creditApplied: params.creditApplied,
    salesman: params.salesman || null,
    notes: params.notes || null,
    pointsRedeemedAmount: params.totals.pointsRedemptionValue,
    taxType: params.taxType,
    saleDate: params.saleDate,
  };
}
