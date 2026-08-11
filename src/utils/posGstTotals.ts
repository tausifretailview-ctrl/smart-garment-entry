import type { GstTaxType } from "@/utils/gstRegisterUtils";

export type PosGstLineInput = {
  netAmount: number;
  gstPer: number;
};

/** GST amount on a taxable line (exclusive mode). */
export function posLineGstFromTaxable(taxable: number, gstPer: number): number {
  if (!gstPer || !taxable) return 0;
  return Math.round((taxable * gstPer) / 100 * 100) / 100;
}

/**
 * Extract GST embedded in an inclusive (tax-in) line amount — Sales Invoice parity.
 * GST = inclusive − inclusive / (1 + rate/100).
 */
export function posLineGstExtractFromInclusive(
  inclusiveAmount: number,
  gstPer: number,
): number {
  if (!gstPer || !inclusiveAmount) return 0;
  const taxable = inclusiveAmount / (1 + gstPer / 100);
  return Math.round((inclusiveAmount - taxable) * 100) / 100;
}

/** Line total shown on screen / print — exclusive adds GST; inclusive / no_gst keep typed price as final. */
export function posLineDisplayTotal(
  taxable: number,
  gstPer: number,
  taxType: GstTaxType,
): number {
  if (taxType === "exclusive") {
    return Math.round((taxable + posLineGstFromTaxable(taxable, gstPer)) * 100) / 100;
  }
  // inclusive + no_gst: sale price is final (no GST added)
  return taxable;
}

/** Bill-level flat discount applies after sale-return adjust (MRP − S/R, then % or ₹). */
export function computePosFlatDiscount(params: {
  mrpTotal: number;
  saleReturnAdjust: number;
  flatDiscountValue: number;
  flatDiscountMode: "percent" | "amount";
}): { flatDiscountAmount: number; flatDiscountPercent: number; flatDiscountBase: number } {
  const flatDiscountBase = Math.max(
    0,
    Math.round((params.mrpTotal - params.saleReturnAdjust) * 100) / 100,
  );
  const flatDiscountAmount =
    params.flatDiscountMode === "percent"
      ? Math.round((flatDiscountBase * params.flatDiscountValue) / 100 * 100) / 100
      : Math.min(Math.max(0, params.flatDiscountValue), flatDiscountBase);
  const flatDiscountPercent =
    params.flatDiscountMode === "percent"
      ? params.flatDiscountValue
      : flatDiscountBase > 0.005
        ? (flatDiscountAmount / flatDiscountBase) * 100
        : 0;
  return { flatDiscountAmount, flatDiscountPercent, flatDiscountBase };
}

/**
 * Bill-level GST for POS — flat discount allocated proportionally before GST
 * (matches Sale Invoice at ~SalesInvoice.tsx GST reduce).
 *
 * - exclusive: GST added on post-flat taxable (payable includes this totalGst)
 * - inclusive: GST extracted from post-flat inclusive price (breakdown only —
 *   must NEVER be added to payable; tax is already inside the price)
 * - no_gst: zero
 *
 * Item-level discounts are already in each line's `netAmount`.
 */
export function computePosBillGst(
  items: PosGstLineInput[],
  taxType: GstTaxType,
  flatDiscountAmount: number,
): { taxableSubtotal: number; totalGst: number } {
  const taxableSubtotal = items.reduce((s, i) => s + (i.netAmount || 0), 0);
  if (taxType === "no_gst" || taxableSubtotal <= 0.005) {
    return { taxableSubtotal, totalGst: 0 };
  }
  if (taxType !== "exclusive" && taxType !== "inclusive") {
    return { taxableSubtotal, totalGst: 0 };
  }

  const totalGst = items.reduce((sum, item) => {
    const share =
      taxableSubtotal > 0 ? (item.netAmount / taxableSubtotal) * flatDiscountAmount : 0;
    const adjusted = Math.round((item.netAmount - share) * 100) / 100;
    if (taxType === "inclusive") {
      return sum + posLineGstExtractFromInclusive(adjusted, item.gstPer);
    }
    return sum + posLineGstFromTaxable(adjusted, item.gstPer);
  }, 0);
  return { taxableSubtotal, totalGst: Math.round(totalGst * 100) / 100 };
}
