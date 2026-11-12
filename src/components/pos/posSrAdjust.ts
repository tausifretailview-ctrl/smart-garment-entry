/**
 * Rules of the POS footer S/R Adj box (PosSrAdjustField), kept apart for unit tests.
 * Same-bill exchange may exceed the bill (excess goes to Mix refund / credit note); a named
 * customer's typed old credit is capped to this bill and must be backed by a saved credit note.
 */
import { manualSrShortfall } from "@/utils/manualSaleReturnCredit";

/**
 * While typing: blank / "-" clears S/R and the same-bill return gross; junk is ignored (null).
 * A walk-in amount above the bill marks a same-bill exchange (gross raised, never lowered).
 */
export function srAdjustTyped(
  raw: string,
  hasCustomer: boolean,
  maxSrFromBill: number,
): { kind: "clear" } | { kind: "set"; adjust: number; raiseGrossTo: number | null } | null {
  if (raw === "" || raw === "-") return { kind: "clear" };
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return null;
  return {
    kind: "set",
    adjust: Math.max(0, n),
    raiseGrossTo: !hasCustomer && n > maxSrFromBill + 0.005 ? n : null,
  };
}

export type SrAdjustBlurAction =
  /** Nothing or ≤ 0: S/R and same-bill return gross back to 0. */
  | { kind: "clear" }
  /** Exchange / over-bill S/R: keep it all (blur often fires on a cart-line delete click). */
  | { kind: "exchange"; amount: number }
  /**
   * Old credit for this bill. A named customer's amount is capped to the bill (warning), then
   * either a missing part is recorded first (prompt) or the amount is applied (clamp).
   */
  | {
      kind: "credit";
      forBill: number;
      capWarning: string | null;
      prompt: { requested: number; shortfall: number } | null;
    };

export function resolveSrAdjustOnBlur(p: {
  requested: number;
  hasCustomer: boolean;
  sameBillReturnGross: number;
  maxSrFromBill: number;
  availableSrCredit: number;
}): SrAdjustBlurAction {
  const requested = p.requested;
  if (requested <= 0) return { kind: "clear" };
  if (p.sameBillReturnGross > 0.005 || (!p.hasCustomer && requested > p.maxSrFromBill + 0.005)) {
    return { kind: "exchange", amount: requested };
  }
  const forBill = p.hasCustomer ? Math.min(requested, p.maxSrFromBill) : requested;
  const capWarning =
    p.hasCustomer && requested > forBill + 0.01
      ? `Only ₹${forBill.toLocaleString("en-IN", { maximumFractionDigits: 2 })} of S/R can be adjusted on this bill`
      : null;
  const shortfall = p.hasCustomer ? manualSrShortfall(forBill, p.availableSrCredit) : 0;
  return {
    kind: "credit",
    forBill,
    capWarning,
    prompt: shortfall > 0 ? { requested: forBill, shortfall } : null,
  };
}
