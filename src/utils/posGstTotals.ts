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

/** Line total shown on screen / print — inclusive keeps taxable+GST embedded; exclusive adds GST on top. */
export function posLineDisplayTotal(
  taxable: number,
  gstPer: number,
  taxType: GstTaxType,
): number {
  if (taxType === "exclusive") {
    return Math.round((taxable + posLineGstFromTaxable(taxable, gstPer)) * 100) / 100;
  }
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

/** Bill-level GST for POS — flat discount allocated proportionally before GST (matches Sale Invoice). */
export function computePosBillGst(
  items: PosGstLineInput[],
  taxType: GstTaxType,
  flatDiscountAmount: number,
): { taxableSubtotal: number; totalGst: number } {
  const taxableSubtotal = items.reduce((s, i) => s + (i.netAmount || 0), 0);
  if (taxType !== "exclusive" || taxableSubtotal <= 0.005) {
    return { taxableSubtotal, totalGst: 0 };
  }
  const totalGst = items.reduce((sum, item) => {
    const share =
      taxableSubtotal > 0 ? (item.netAmount / taxableSubtotal) * flatDiscountAmount : 0;
    const adjusted = Math.round((item.netAmount - share) * 100) / 100;
    return sum + posLineGstFromTaxable(adjusted, item.gstPer);
  }, 0);
  return { taxableSubtotal, totalGst: Math.round(totalGst * 100) / 100 };
}
