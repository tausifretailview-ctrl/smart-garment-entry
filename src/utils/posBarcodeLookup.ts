/** Service SKUs commonly use 3-digit POS codes (501, 502). */
export const POS_SHORT_NUMERIC_BARCODE_MIN_LEN = 3;

/** Unsafe to ilike-substring match shorter codes (501 matches 1234501). */
export const POS_PARTIAL_BARCODE_MIN_LEN = 6;

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
