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

/**
 * Barcode strings to try when resolving a hardware scan (order matters).
 * Handles doubled reads (scanner sends the same code twice in one burst).
 */
export function expandBarcodeScanCandidates(raw: string): string[] {
  const normalized = normalizeProductSearchTerm(raw);
  if (!normalized) return [];

  const out: string[] = [];
  const push = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  push(normalized);

  // Doubled scan: e.g. 0040015241 + 0040015241 → 00400152410040015241
  if (/^\d+$/.test(normalized) && normalized.length >= 8 && normalized.length % 2 === 0) {
    const halfLen = normalized.length / 2;
    const first = normalized.slice(0, halfLen);
    const second = normalized.slice(halfLen);
    if (first === second) push(first);
  }

  return out;
}
