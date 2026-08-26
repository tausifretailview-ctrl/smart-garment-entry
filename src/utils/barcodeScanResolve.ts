import { normalizeProductSearchTerm } from "@/utils/productDashboardBarcodeSearch";

/** True when a numeric scan is two identical halves (scanner duplicate or app concatenation). */
export function isDoubledNumericBarcode(raw: string): boolean {
  const normalized = normalizeProductSearchTerm(raw);
  if (!/^\d+$/.test(normalized) || normalized.length < 8 || normalized.length % 2 !== 0) {
    return false;
  }
  const halfLen = normalized.length / 2;
  return normalized.slice(0, halfLen) === normalized.slice(halfLen);
}

/** Strip label spacing / dashes for GTIN lookup (e.g. 8 901326 444238). */
export function barcodeDigitsOnly(raw: string): string {
  return raw.replace(/[\s\-]/g, "");
}

/**
 * Barcode strings to try when resolving a hardware scan (order matters).
 * Handles doubled reads, label spacing, and EAN-13 ↔ UPC-A leading-zero forms.
 */
export function expandBarcodeScanCandidates(raw: string): string[] {
  const normalized = normalizeProductSearchTerm(raw);
  if (!normalized) return [];

  const out: string[] = [];
  const push = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  push(normalized);

  const digitsFromLabel = barcodeDigitsOnly(normalized);
  if (digitsFromLabel !== normalized && /^\d+$/.test(digitsFromLabel)) {
    push(digitsFromLabel);
  }

  // Doubled scan: e.g. 0040015241 + 0040015241 → 00400152410040015241
  if (/^\d+$/.test(normalized) && normalized.length >= 8 && normalized.length % 2 === 0) {
    const halfLen = normalized.length / 2;
    const first = normalized.slice(0, halfLen);
    const second = normalized.slice(halfLen);
    if (first === second) push(first);
  }

  // GTIN alternate encodings for universal branded EANs (Jockey etc.)
  for (const candidate of [...out]) {
    const digits = barcodeDigitsOnly(candidate);
    if (!/^\d+$/.test(digits)) continue;
    if (digits.length === 13 && digits.startsWith("0")) {
      push(digits.slice(1));
    }
    if (digits.length === 12) {
      push(`0${digits}`);
    }
  }

  return out;
}
