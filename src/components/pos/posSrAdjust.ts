/**
 * Rules of the POS footer S/R Adj box (PosSrAdjustField), kept apart for unit tests.
 * Same-bill exchange may exceed the bill (excess goes to Mix refund / credit note). A named
 * customer's typed amount must be backed by a saved credit note: what is missing is recorded
 * first, and an amount above the bill is only kept after the cashier confirms the refund.
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

/**
 * What the cashier is asked before a named customer's typed S/R is used:
 * - `shortfall`: the part no saved return covers; recorded as an old sale return on confirm;
 * - `refundDue`: the part above the bill; on confirm the bill becomes an exchange with that
 *   refund due (Cash refunds it, Mix Pay offers UPI / bank / credit note).
 */
export type ManualSrPrompt = { requested: number; shortfall: number; refundDue: number };

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Named customer, S/R typed above the bill: the prompt to raise. Null when the amount fits
 * the bill. Until now such an amount was silently cut to the bill, so the footer showed
 * "Refund due" while typing and Mix Payment then opened at ₹0 with no refund to choose.
 */
export function srOverBillPrompt(p: {
  requested: number;
  maxSrFromBill: number;
  availableSrCredit: number;
}): ManualSrPrompt | null {
  // Nothing billed yet: there is no bill to exchange against.
  if (p.maxSrFromBill <= 0.005) return null;
  const requested = money(p.requested);
  const refundDue = money(requested - p.maxSrFromBill);
  if (refundDue <= 0.01) return null;
  return { requested, shortfall: manualSrShortfall(requested, p.availableSrCredit), refundDue };
}

export type SrAdjustBlurAction =
  /** Nothing or ≤ 0: S/R and same-bill return gross back to 0. */
  | { kind: "clear" }
  /** Exchange / over-bill S/R: keep it all (blur often fires on a cart-line delete click). */
  | { kind: "exchange"; amount: number }
  /**
   * Old credit for this bill: either a missing part is recorded first (prompt) or the amount
   * is applied (clamp). A named customer's amount above the bill always asks (prompt with
   * refundDue); the typed amount stays in the box until the cashier answers.
   */
  | {
      kind: "credit";
      forBill: number;
      /** Set when the amount was cut (named customer, nothing billed yet). */
      capWarning: string | null;
      prompt: ManualSrPrompt | null;
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
  if (p.hasCustomer && requested > p.maxSrFromBill + 0.01) {
    const overBill = srOverBillPrompt(p);
    if (overBill) return { kind: "credit", forBill: p.maxSrFromBill, capWarning: null, prompt: overBill };
    return { kind: "credit", forBill: 0, capWarning: "Add the items first: S/R is adjusted against the bill", prompt: null };
  }
  const shortfall = p.hasCustomer ? manualSrShortfall(requested, p.availableSrCredit) : 0;
  return {
    kind: "credit",
    forBill: requested,
    capWarning: null,
    prompt: shortfall > 0 ? { requested, shortfall, refundDue: 0 } : null,
  };
}
