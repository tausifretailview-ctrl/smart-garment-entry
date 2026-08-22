/**
 * POS cart barcode rules — prevent partial / prefix matches from adding wrong SKU
 * while the cashier is still typing (KS Footwear: shared 0040… prefixes).
 */

/** Minimum digits for standard retail EAN-style barcodes at POS. */
export const POS_NUMERIC_BARCODE_MIN_LENGTH = 8;

/** Service products commonly use 3–7 digit POS codes (501, 502, 8001). */
export const POS_SERVICE_NUMERIC_BARCODE_MIN_LENGTH = 3;
export const POS_SERVICE_NUMERIC_BARCODE_MAX_LENGTH = 7;

/** True for 3–7 digit service-style numeric codes (not 1–2 digit partial prefixes). */
export function isPosServiceShortNumericBarcode(term: string): boolean {
  const t = term.trim();
  if (!/^\d+$/.test(t)) return false;
  return (
    t.length >= POS_SERVICE_NUMERIC_BARCODE_MIN_LENGTH &&
    t.length <= POS_SERVICE_NUMERIC_BARCODE_MAX_LENGTH
  );
}

/** True when a numeric barcode string is long enough to resolve/add at POS. */
export function isCompleteNumericBarcodeForPosCart(term: string): boolean {
  const t = term.trim();
  if (!/^\d+$/.test(t)) return false;
  if (/^[1-9]$/.test(t)) return true;
  if (t.length >= POS_NUMERIC_BARCODE_MIN_LENGTH) return true;
  return isPosServiceShortNumericBarcode(t);
}

/** Cart add / scan submit must never use fuzzy substring barcode matching. */
export type PosBarcodeCartLookupOptions = {
  /** When true (default), skip ILIKE `%term%` variant and purchase-item fallbacks. */
  exactOnly?: boolean;
};

export const POS_BARCODE_CART_LOOKUP_EXACT: PosBarcodeCartLookupOptions = { exactOnly: true };
export const POS_BARCODE_SEARCH_LOOKUP: PosBarcodeCartLookupOptions = { exactOnly: false };
