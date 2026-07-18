/** Stable fingerprint for purchase create-save idempotency. */
export function buildPurchaseSaveFingerprint(input: {
  supplierId?: string | null;
  supplierName?: string | null;
  billDate: string;
  supplierInvoiceNo?: string | null;
  netAmount: number;
  totalQty: number;
  lineCount: number;
}): string {
  return [
    String(input.supplierId || "").trim(),
    String(input.supplierName || "").trim().toUpperCase(),
    input.billDate,
    String(input.supplierInvoiceNo || "").trim().toUpperCase(),
    Math.round(Number(input.netAmount) || 0),
    Math.round((Number(input.totalQty) || 0) * 1000) / 1000,
    Number(input.lineCount) || 0,
  ].join("|");
}

/** True when a prior in-session create commit should block another insert. */
export function shouldReuseCommittedPurchaseCreate(
  prior: {
    fingerprint: string;
    supplierInvoiceNo: string;
    savedAt: number;
  } | null | undefined,
  current: { fingerprint: string; supplierInvoiceNo: string },
  nowMs: number = Date.now(),
  maxAgeMs: number = 30 * 60 * 1000,
): boolean {
  if (!prior) return false;
  if (nowMs - prior.savedAt >= maxAgeMs) return false;
  const inv = String(current.supplierInvoiceNo || "").trim();
  return (
    prior.fingerprint === current.fingerprint ||
    (inv.length > 0 && prior.supplierInvoiceNo === inv)
  );
}
