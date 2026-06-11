/**
 * Suggest the next supplier invoice number from the previous value (serial increment).
 * Mirrors software bill numbering: pure numbers, trailing digits, or last /- segment.
 */
export function incrementSupplierInvoiceNumber(
  prev: string | null | undefined,
): string {
  const raw = String(prev ?? "").trim();
  if (!raw) return "1";

  if (/^\d+$/.test(raw)) {
    return String(BigInt(raw) + 1n);
  }

  const trailing = raw.match(/^(.*?)(\d+)$/);
  if (trailing) {
    const [, prefix, numStr] = trailing;
    const next = BigInt(numStr) + 1n;
    const padded = next.toString().padStart(numStr.length, "0");
    return `${prefix}${padded}`;
  }

  const segments = raw.split(/([\/\-])/);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segments[i])) {
      const numStr = segments[i];
      const next = BigInt(numStr) + 1n;
      segments[i] = next.toString().padStart(numStr.length, "0");
      return segments.join("");
    }
  }

  return "1";
}

/** Default supplier invoice no for a new bill from the most recent saved bill. */
export function nextSupplierInvoiceNumberFromLastBill(
  lastSupplierInvoiceNo: string | null | undefined,
): string {
  return incrementSupplierInvoiceNumber(lastSupplierInvoiceNo);
}
