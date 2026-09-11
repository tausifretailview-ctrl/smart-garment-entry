import type { PosCartItem } from "./types";

export type PosLiveMarginInputItem = {
  quantity?: number | null;
  purPrice?: number | null;
};

export type PosLiveMargin = {
  profit: number;
  marginPercent: number;
  totalCost: number;
  totalSale: number;
};

function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Owner-only POS margin chip: profit vs what the bill will collect after
 * line disc, flat disc, S/R, round-off, and points — not raw line netAmount.
 */
export function computePosLiveMargin(input: {
  items: PosLiveMarginInputItem[];
  billNet: number;
}): PosLiveMargin {
  let totalCost = 0;
  for (const item of input.items) {
    const qty = Number(item.quantity) || 0;
    totalCost += (Number(item.purPrice) || 0) * qty;
  }
  totalCost = roundMoney(totalCost);
  const totalSale = roundMoney(input.billNet);
  const profit = roundMoney(totalSale - totalCost);
  const marginPercent = totalSale > 0.005 ? (profit / totalSale) * 100 : 0;
  return { profit, marginPercent, totalCost, totalSale };
}

export function applyPurchasePricesToPosCart(
  items: PosCartItem[],
  purPriceByVariantId: Record<string, number>,
): PosCartItem[] {
  let changed = false;
  const next = items.map((item) => {
    const vid = item.variantId;
    if (!vid || !Object.prototype.hasOwnProperty.call(purPriceByVariantId, vid)) {
      return item;
    }
    const purPrice = Number(purPriceByVariantId[vid]) || 0;
    if (item.purPrice === purPrice) return item;
    changed = true;
    return { ...item, purPrice };
  });
  return changed ? next : items;
}
