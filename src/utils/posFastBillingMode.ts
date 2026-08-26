import { parsePosQuickPriceCode } from "@/utils/posQuickPriceCode";

/** Settings → Sale → POS quick price-code search (Trendzo fast billing). */
export function isPosFastBillingEnabled(
  saleSettings?: { pos_quick_price_code?: boolean | null } | null,
): boolean {
  return saleSettings?.pos_quick_price_code === true;
}

export function isPosFastBillingQuickCodeTerm(term: string): boolean {
  return parsePosQuickPriceCode(term.trim()) != null;
}

/**
 * Fast billing text search (e.g. "Jeans") — show dropdown with brand + price;
 * do not auto-add the first DB hit on Enter. J900 and barcodes use other paths.
 */
export function posFastBillingUsesDropdownPick(term: string, fastBillingEnabled: boolean): boolean {
  if (!fastBillingEnabled) return false;
  const trimmed = term.trim();
  if (!trimmed) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (isPosFastBillingQuickCodeTerm(trimmed)) return false;
  return true;
}
