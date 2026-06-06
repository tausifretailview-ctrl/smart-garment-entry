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
