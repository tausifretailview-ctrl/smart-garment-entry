/**
 * POS cart barcode rules — prevent partial / prefix matches from adding wrong SKU
 * while the cashier is still typing (KS Footwear: shared 0040… prefixes).
 */

/** Minimum digits before scanner auto-submit or cart resolve for numeric retail barcodes. */
export const POS_NUMERIC_BARCODE_MIN_LENGTH = 8;

/** True when a numeric barcode string is long enough to resolve/add at POS. */
export function isCompleteNumericBarcodeForPosCart(term: string): boolean {
  const t = term.trim();
  return /^\d+$/.test(t) && t.length >= POS_NUMERIC_BARCODE_MIN_LENGTH;
}

/** Enter on numeric barcode must exact-match lookup, not dropdown partial pick. */
export function shouldPosEnterUseExactBarcodeLookup(term: string): boolean {
  const t = term.trim();
  if (!/^\d+$/.test(t)) return false;
  if (/^[1-9]$/.test(t)) return false;
  return t.length >= 4;
}

export type PosBarcodeCartLookupOptions = {
  /** When true (default), skip ILIKE `%term%` variant and purchase-item fallbacks. */
  exactOnly?: boolean;
};

export const POS_BARCODE_CART_LOOKUP_EXACT: PosBarcodeCartLookupOptions = { exactOnly: true };
export const POS_BARCODE_SEARCH_LOOKUP: PosBarcodeCartLookupOptions = { exactOnly: false };
