/** Company UPI IDs stored on settings.bill_barcode_settings (JSONB). */

export type ActiveUpiId = "primary" | "secondary";

export type CompanyUpiSettings = {
  upi_id?: string | null;
  upi_id_2?: string | null;
  active_upi_id?: ActiveUpiId | string | null;
  dc_upi_id?: string | null;
};

export function trimUpiId(value: string | null | undefined): string {
  return (value || "").trim();
}

/**
 * Exactly one slot is active when at least one UPI ID is set.
 * Missing `active_upi_id` (legacy orgs) is treated as primary so existing
 * `upi_id` values keep printing on POS/Sale QR codes unchanged.
 * An empty slot cannot stay selected as default.
 */
export function coerceActiveUpiId(bill?: CompanyUpiSettings | null): ActiveUpiId {
  const primary = trimUpiId(bill?.upi_id);
  const secondary = trimUpiId(bill?.upi_id_2);
  const requested = bill?.active_upi_id === "secondary" ? "secondary" : "primary";
  if (requested === "secondary" && secondary) return "secondary";
  if (requested === "primary" && primary) return "primary";
  if (primary) return "primary";
  if (secondary) return "secondary";
  return "primary";
}

/** The general (non-DC) company UPI currently marked default. */
export function resolveCompanyUpiId(bill?: CompanyUpiSettings | null): string {
  const slot = coerceActiveUpiId(bill);
  return slot === "secondary" ? trimUpiId(bill?.upi_id_2) : trimUpiId(bill?.upi_id);
}

/**
 * Invoice QR payee: DC invoices keep using `dc_upi_id` when set, otherwise
 * they fall back to the currently default company UPI (same "company UPI"
 * meaning as before the second slot existed).
 */
export function resolveInvoiceUpiId(
  bill?: CompanyUpiSettings | null,
  isDcInvoice?: boolean,
): string {
  if (isDcInvoice) {
    const dc = trimUpiId(bill?.dc_upi_id);
    if (dc) return dc;
  }
  return resolveCompanyUpiId(bill);
}

export function canSelectUpiSlot(
  bill?: CompanyUpiSettings | null,
  slot?: ActiveUpiId,
): boolean {
  if (slot === "secondary") return !!trimUpiId(bill?.upi_id_2);
  return !!trimUpiId(bill?.upi_id);
}

export function patchCompanyUpi(
  bill: CompanyUpiSettings | null | undefined,
  patch: Partial<Pick<CompanyUpiSettings, "upi_id" | "upi_id_2" | "active_upi_id">>,
): CompanyUpiSettings {
  const next: CompanyUpiSettings = { ...(bill || {}), ...patch };
  next.active_upi_id = coerceActiveUpiId(next);
  return next;
}
