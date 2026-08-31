import type { GstTaxType } from "@/utils/gstRegisterUtils";
import { computePosBillGst, computePosFlatDiscount } from "@/utils/posGstTotals";
import { maxCombinedDiscountForGross } from "@/utils/saleSettlement";
import { extraDiscountOnSchemeLine } from "./lineMath";
import type { PosBillTotals, PosCartItem, PosFlatDiscountMode } from "./types";

export type ComputePosBillTotalsInput = {
  items: PosCartItem[];
  taxType: GstTaxType;
  flatDiscountValue: number;
  flatDiscountMode: PosFlatDiscountMode;
  saleReturnAdjust?: number;
  creditApplied?: number;
  /** Current round-off applied to final (manual or auto). */
  roundOff?: number;
  pointsToRedeem?: number;
  /** Injected — same formula as useCustomerPoints.calculateRedemptionValue. */
  calculateRedemptionValue?: (points: number) => number;
};

/**
 * POS bill totals pipeline (characterisation target).
 * Order preserved from POSSales: flat → GST → amountBeforeRoundOff → round → points.
 */
export function computePosBillTotals(input: ComputePosBillTotalsInput): PosBillTotals {
  const items = input.items;
  const saleReturnAdjust = Number(input.saleReturnAdjust) || 0;
  const creditApplied = Number(input.creditApplied) || 0;
  const roundOff = Number(input.roundOff) || 0;
  const pointsToRedeem = Number(input.pointsToRedeem) || 0;
  // Default matches useCustomerPoints defaultPointsSettings.points_redemption_value = 1.
  const redeem = input.calculateRedemptionValue ?? ((points: number) => points);

  const totals = {
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    mrp: items.reduce((sum, item) => sum + item.mrp * item.quantity, 0),
    discount: items.reduce((sum, item) => {
      if (item.categoryTierApplied) {
        const schemeLine = (Number(item.unitCost) || 0) * (Number(item.quantity) || 0);
        const extra = extraDiscountOnSchemeLine(item, schemeLine);
        const implicitRateDiscount = Math.max(0, (item.mrp - item.unitCost) * item.quantity);
        return sum + extra + implicitRateDiscount;
      }
      const baseAmount = item.mrp * item.quantity;
      const percentDiscount = (baseAmount * item.discountPercent) / 100;
      const implicitRateDiscount = Math.max(0, (item.mrp - item.unitCost) * item.quantity);
      return sum + percentDiscount + item.discountAmount + implicitRateDiscount;
    }, 0),
    subtotal: items.reduce((sum, item) => sum + item.netAmount, 0),
    savings: items.reduce(
      (sum, item) => sum + Math.max(0, item.mrp * item.quantity - item.netAmount),
      0,
    ),
  };

  const rawFlatDiscount = computePosFlatDiscount({
    mrpTotal: totals.mrp,
    saleReturnAdjust,
    flatDiscountValue: input.flatDiscountValue,
    flatDiscountMode: input.flatDiscountMode,
  });
  const maxFlatDiscountForGross = Math.max(
    0,
    Math.round((maxCombinedDiscountForGross(totals.mrp) - totals.discount) * 100) / 100,
  );
  const flatDiscountAmount = Math.min(rawFlatDiscount.flatDiscountAmount, maxFlatDiscountForGross);
  const flatDiscountPercent =
    input.flatDiscountMode === "percent"
      ? input.flatDiscountValue
      : maxFlatDiscountForGross > 0.005 && totals.mrp > 0.005
        ? (flatDiscountAmount / Math.max(0.01, totals.mrp - saleReturnAdjust)) * 100
        : rawFlatDiscount.flatDiscountPercent;
  const flatDiscountCapped = rawFlatDiscount.flatDiscountAmount > maxFlatDiscountForGross + 0.01;

  const posGst = computePosBillGst(items, input.taxType, flatDiscountAmount);

  // CRITICAL: Inclusive totalGst is an extracted breakdown only (tax already in price).
  // Never add posGst.totalGst on inclusive / no_gst — would overcharge the customer.
  const amountBeforeRoundOff =
    input.taxType === "exclusive"
      ? posGst.taxableSubtotal -
        flatDiscountAmount -
        saleReturnAdjust -
        creditApplied +
        posGst.totalGst
      : totals.subtotal - flatDiscountAmount - saleReturnAdjust - creditApplied;

  const calculatedRoundOff = Math.round(amountBeforeRoundOff) - amountBeforeRoundOff;
  const pointsRedemptionValue = redeem(pointsToRedeem);
  const finalAmount = amountBeforeRoundOff + roundOff - pointsRedemptionValue;
  const amountBeforeCredit = finalAmount + creditApplied;

  return {
    quantity: totals.quantity,
    mrp: totals.mrp,
    discount: totals.discount,
    subtotal: totals.subtotal,
    savings: totals.savings,
    flatDiscountAmount,
    flatDiscountPercent,
    flatDiscountCapped,
    maxFlatDiscountForGross,
    taxableSubtotal: posGst.taxableSubtotal,
    totalGst: posGst.totalGst,
    amountBeforeRoundOff,
    calculatedRoundOff,
    pointsRedemptionValue,
    finalAmount,
    amountBeforeCredit,
  };
}
