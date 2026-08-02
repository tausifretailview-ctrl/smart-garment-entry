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
    grossAmount: params.totals.mrp,
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
