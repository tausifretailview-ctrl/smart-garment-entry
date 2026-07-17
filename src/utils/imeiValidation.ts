/** EAN-13 / UPC-A style retail codes often printed beside IMEI on phone boxes. */
export function isLikelyUniversalProductCode(code: string): boolean {
  const cleaned = code.replace(/\s/g, "");
  if (!/^\d+$/.test(cleaned)) return false;
  return cleaned.length === 12 || cleaned.length === 13;
}

export function getUniversalCodeScanWarning(code: string): string | null {
  if (!isLikelyUniversalProductCode(code)) return null;
  return "This looks like a universal product code (EAN/UPC), not an IMEI. Scan the IMEI barcode on the box.";
}

export function validateIMEI(imei: string, minLength: number = 4, maxLength: number = 25): boolean {
  if (!imei) return false;
  const cleaned = imei.replace(/\s/g, "");
  return /^[a-zA-Z0-9\-_.\/]+$/.test(cleaned) && cleaned.length >= minLength && cleaned.length <= maxLength;
}

export function validateIMEIWithContext(
  imei: string,
  minLength: number = 4,
  maxLength: number = 25,
): { valid: boolean; warning: string | null } {
  const valid = validateIMEI(imei, minLength, maxLength);
  const warning = valid ? getUniversalCodeScanWarning(imei) : null;
  return { valid, warning };
}
