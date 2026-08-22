/** Service SKUs commonly use 3-digit POS codes (501, 502). */
export const POS_SHORT_NUMERIC_BARCODE_MIN_LEN = 3;

/** Unsafe to ilike-substring match shorter codes (501 matches 1234501). */
export const POS_PARTIAL_BARCODE_MIN_LEN = 6;

/** Sane upper bound for dropdown price search (₹). */
export const POS_PRICE_SEARCH_MAX = 999_999;

export function posNumericBarcodeAutoSubmitMinLen(mobileERP: {
  enabled?: boolean;
  imei_scan_enforcement?: boolean;
  imei_min_length?: number;
}): number {
  if (mobileERP.enabled && mobileERP.imei_scan_enforcement) {
    return mobileERP.imei_min_length || 15;
  }
  return POS_SHORT_NUMERIC_BARCODE_MIN_LEN;
}

export function canResolvePosPurchaseBarcode(trimmed: string): boolean {
  return /^\d{3,}$/.test(trimmed);
}

export function shouldUsePartialPosBarcodeMatch(trimmed: string): boolean {
  return trimmed.length >= POS_PARTIAL_BARCODE_MIN_LEN;
}

/**
 * Retail barcode numerics (0040… prefix, 8+ digit EAN) — not price tokens.
 * PostgREST rejects filters like mrp.eq.0040017429 (400 Bad Request).
 */
export function isPosBarcodeLikeNumericToken(token: string): boolean {
  const t = token.trim();
  if (!/^\d+$/.test(t)) return false;
  if (t.startsWith("0") && t.length >= 4) return true;
  if (t.length >= 8) return true;
  return false;
}

/** True when a numeric token is a price lookup (649, 204.5), not a barcode string. */
export function isPosPriceSearchToken(token: string): boolean {
  const t = token.trim();
  if (!t || isPosBarcodeLikeNumericToken(t)) return false;
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n <= POS_PRICE_SEARCH_MAX;
  }
  if (/^\d+\.\d{1,2}$/.test(t)) {
    const n = parseFloat(t);
    return Number.isFinite(n) && n > 0 && n <= POS_PRICE_SEARCH_MAX;
  }
  return false;
}
