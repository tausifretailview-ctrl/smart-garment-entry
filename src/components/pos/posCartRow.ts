/** Figures shown on a POS cart line (PosCartRow), kept apart for unit tests. */

type LineMoney = {
  mrp?: number | null;
  quantity?: number | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
  unitCost?: number | null;
};

/**
 * Line discount as the cart shows it: Disc Rs when typed, else Disc % of (MRP × qty); the list
 * unit is MRP, or the rate when there is no MRP.
 */
export function posLineDiscountFigures(item: LineMoney): {
  listUnit: number;
  lineDiscRs: number;
  discPct: number;
  hasLineDisc: boolean;
} {
  const mrp = Number(item.mrp) || 0;
  const listUnit = Number(item.mrp) > 0.005 ? Number(item.mrp) : Number(item.unitCost) || 0;
  const baseAmount = Math.max(0, mrp * (Number(item.quantity) || 0));
  const percentAmount = baseAmount > 0 ? (baseAmount * (Number(item.discountPercent) || 0)) / 100 : 0;
  const lineDiscRs = Number(item.discountAmount) > 0 ? Number(item.discountAmount) : percentAmount;
  const discPct = Number(item.discountPercent) || 0;
  return { listUnit, lineDiscRs, discPct, hasLineDisc: lineDiscRs > 0.005 || discPct > 0.005 };
}

/** Value of the Disc Rs box: rupees to 2 decimals, or blank when there is none. */
export function posLineDiscRsBoxValue(item: LineMoney): number | "" {
  const { lineDiscRs } = posLineDiscountFigures(item);
  return lineDiscRs > 0 ? Number(lineDiscRs.toFixed(2)) : "";
}

/** "-10%" / "-12.5%" label of a line discount. */
export function posDiscPctLabel(discPct: number): string {
  return `-${discPct % 1 === 0 ? discPct.toFixed(0) : discPct.toFixed(1)}%`;
}

/**
 * MRP column hidden: the bill Discount still counts MRP − rate, so the line shows the MRP
 * (struck through) or the cashier sees a footer discount with every line box at 0.
 */
export function posHiddenMrpGap(item: LineMoney, enableMrp: boolean, hasLineDisc: boolean): boolean {
  return !enableMrp && !hasLineDisc && Number(item.mrp) > (Number(item.unitCost) || 0) + 0.005;
}
