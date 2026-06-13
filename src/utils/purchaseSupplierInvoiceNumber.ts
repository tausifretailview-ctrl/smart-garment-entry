/**
 * Suggest the next supplier invoice number from the previous value (serial increment).
 * Mirrors software bill numbering: pure numbers, trailing digits, or last /- segment.
 */
export type ParsedSupplierInvoiceSerial = {
  full: string;
  prefix: string;
  num: bigint;
  numStr: string;
};

export function parseSupplierInvoiceSerial(
  raw: string | null | undefined,
): ParsedSupplierInvoiceSerial | null {
  const full = String(raw ?? "").trim();
  if (!full) return null;

  if (/^\d+$/.test(full)) {
    return { full, prefix: "", num: BigInt(full), numStr: full };
  }

  const trailing = full.match(/^(.*?)(\d+)$/);
  if (trailing) {
    const [, prefix, numStr] = trailing;
    return { full, prefix, num: BigInt(numStr), numStr };
  }

  const segments = full.split(/([\/\-])/);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(segments[i])) {
      const prefix = segments.slice(0, i).join("");
      const numStr = segments[i];
      return { full, prefix, num: BigInt(numStr), numStr };
    }
  }

  return null;
}

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

/** Highest serial in the same prefix series as the reference invoice. */
export function maxSupplierInvoiceInSeries(
  invoices: Array<string | null | undefined>,
  referenceInvoice?: string | null,
): string | null {
  const cleaned = invoices.map((value) => String(value ?? "").trim()).filter(Boolean);
  if (!cleaned.length) return null;

  const ref =
    parseSupplierInvoiceSerial(referenceInvoice) ??
    parseSupplierInvoiceSerial(cleaned[cleaned.length - 1]);
  if (!ref) return null;

  let best = ref;
  for (const invoice of cleaned) {
    const parsed = parseSupplierInvoiceSerial(invoice);
    if (parsed && parsed.prefix === ref.prefix && parsed.num > best.num) {
      best = parsed;
    }
  }

  return `${best.prefix}${best.numStr}`;
}

/** Next supplier invoice no from all org bills in the same series (not just the last bill). */
export function nextSupplierInvoiceNumberFromSeries(
  invoices: Array<string | null | undefined>,
  referenceInvoice?: string | null,
): string {
  const maxInSeries = maxSupplierInvoiceInSeries(invoices, referenceInvoice);
  return incrementSupplierInvoiceNumber(maxInSeries);
}

/** Default supplier invoice no for a new bill from the most recent saved bill. */
export function nextSupplierInvoiceNumberFromLastBill(
  lastSupplierInvoiceNo: string | null | undefined,
): string {
  return nextSupplierInvoiceNumberFromSeries(
    lastSupplierInvoiceNo ? [lastSupplierInvoiceNo] : [],
    lastSupplierInvoiceNo,
  );
}

/** Prefer server peek (scans all bills); fall back to client series from recent rows. */
export function resolveNextSupplierInvoiceNumber(
  serverPeek: string | null | undefined,
  invoices: Array<string | null | undefined>,
  referenceInvoice?: string | null,
): string {
  const peek = String(serverPeek ?? "").trim();
  if (peek) return peek;
  return nextSupplierInvoiceNumberFromSeries(invoices, referenceInvoice);
}
