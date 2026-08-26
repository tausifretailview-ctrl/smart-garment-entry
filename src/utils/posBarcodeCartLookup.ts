/**
 * POS cart barcode rules — prevent partial / prefix matches from adding wrong SKU
 * while the cashier is still typing (KS Footwear: shared 0040… prefixes).
 */

/** Minimum digits for standard retail EAN-style barcodes at POS. */
export const POS_NUMERIC_BARCODE_MIN_LENGTH = 8;

/** Service products commonly use 2–7 digit POS codes (10, 18, 501, 8001). */
export const POS_SERVICE_NUMERIC_BARCODE_MIN_LENGTH = 2;
export const POS_SERVICE_NUMERIC_BARCODE_MAX_LENGTH = 7;

/** True for 2–7 digit service-style numeric codes (not leading-zero EAN prefixes). */
export function isPosServiceShortNumericBarcode(term: string): boolean {
  const t = term.trim();
  if (!/^\d+$/.test(t)) return false;
  // Leading-zero strings are retail EAN prefixes (0040…), not quick-service SKUs.
  if (t.startsWith("0")) return false;
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

/** Stock report fetch uses the same complete numeric barcode rule as POS cart. */
export function isCompleteNumericBarcodeForStockReport(term: string): boolean {
  return isCompleteNumericBarcodeForPosCart(term);
}

/** Exact barcode string match (case-insensitive), else substring for text search. */
export function stockReportOldBarcodeKeyMatches(search: string, barcodeKey: string): boolean {
  const s = search.trim().toLowerCase();
  const b = barcodeKey.trim().toLowerCase();
  if (!s || !b) return false;
  if (/^\d+$/.test(s)) return b === s;
  return b.includes(s);
}

/** True when the scan box value is an alphanumeric SKU / barcode (not a plain name search). */
export function isPosAlphanumericBarcodeTerm(term: string): boolean {
  const t = term.trim();
  if (!t || /\s/.test(t)) return false;
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(t)) return false;
  if (t.length < 3) return false;
  // Require a digit so plain words (Bootcut, Shirt) still use dropdown pick.
  return /\d/.test(t);
}

export function shouldPosEnterUseExactBarcodeLookup(term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  // Single-digit 1–9: quick-service dialog / dropdown, not exact-only.
  if (/^[1-9]$/.test(t)) return false;
  // Pure numeric: exact barcode lookup (never first ILIKE dropdown hit).
  if (/^\d+$/.test(t)) {
    if (isCompleteNumericBarcodeForPosCart(t)) return true;
    return t.length >= 4;
  }
  return isPosAlphanumericBarcodeTerm(t);
}

export type PosBarcodeCartLookupOptions = {
  /** When true (default), skip ILIKE `%term%` variant and purchase-item fallbacks. */
  exactOnly?: boolean;
};

export const POS_BARCODE_CART_LOOKUP_EXACT: PosBarcodeCartLookupOptions = { exactOnly: true };
export const POS_BARCODE_SEARCH_LOOKUP: PosBarcodeCartLookupOptions = { exactOnly: false };
