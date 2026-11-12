/** Figures of the POS footer Flat Disc box (PosFlatDiscountField), kept apart for unit tests. */
import { normalizeFlatDiscountInput } from "@/lib/posBilling/lineMath";
import type { PosFlatDiscountMode } from "@/lib/posBilling/types";
import { maxCombinedDiscountForGross } from "@/utils/saleSettlement";

const rupees0 = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

/** Value while typing: blank or "-" is 0, anything not a number is ignored (null), else whole. */
export function parseFlatDiscountTyped(raw: string): number | null {
  if (raw === "" || raw === "-") return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function flatDiscountCapMessage(maxRupees: number): string {
  return `Only ₹${rupees0(maxRupees)} discount can be applied to this bill`;
}

/**
 * On leaving the box: keep the discount within what this bill allows.
 * ₹ mode: at most maxFlatDiscountForGross. % mode, when the total discount hit the cap: the
 * percent that gives that rupee cap on (MRP − S/R). Returns the value to set and a warning.
 */
export function resolveFlatDiscountOnBlur(p: {
  value: number;
  mode: PosFlatDiscountMode;
  maxFlatDiscountForGross: number;
  flatDiscountCapped: boolean;
  mrp: number;
  saleReturnAdjust: number;
}): { next: number; warning: string | null } {
  const next = normalizeFlatDiscountInput(p.value);
  if (p.mode === "amount" && next > p.maxFlatDiscountForGross + 0.01) {
    return { next: Math.round(p.maxFlatDiscountForGross), warning: flatDiscountCapMessage(p.maxFlatDiscountForGross) };
  }
  if (p.mode === "percent" && p.flatDiscountCapped) {
    const base = Math.max(0.01, p.mrp - p.saleReturnAdjust);
    return {
      next: Math.min(100, Math.round((p.maxFlatDiscountForGross / base) * 100)),
      warning: flatDiscountCapMessage(maxCombinedDiscountForGross(p.mrp)),
    };
  }
  return { next, warning: null };
}
