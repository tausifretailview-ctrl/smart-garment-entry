import { format } from "date-fns";

/** Build a short bill-print note for CN / S/R adjust (Sales dashboard style). */
export function formatCnAdjustBillNote(params: {
  saleReturnAdjust?: number | null;
  cnAdjustDate?: string | Date | null;
}): string | null {
  const amt = Math.round(Number(params.saleReturnAdjust || 0));
  if (amt <= 0) return null;

  const amtText = amt.toLocaleString("en-IN");
  let dateText = "";
  const raw = params.cnAdjustDate;
  if (raw) {
    try {
      const d =
        typeof raw === "string"
          ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw.trim()) ? `${raw.trim()}T12:00:00` : raw)
          : raw;
      if (!Number.isNaN(d.getTime())) {
        dateText = format(d, "dd/MM/yyyy");
      }
    } catch {
      dateText = "";
    }
  }

  return dateText
    ? `CN Adjust: ₹${amtText} (adj. ${dateText})`
    : `CN Adjust: ₹${amtText}`;
}

/** Append CN adjust note to invoice notes without duplicating an existing CN/S/R note. */
export function mergeInvoiceNotesWithCnAdjust(
  notes: string | null | undefined,
  cnNote: string | null | undefined,
): string {
  const base = String(notes || "").trim();
  const extra = String(cnNote || "").trim();
  if (!extra) return base;
  if (!base) return extra;
  if (/cn\s*adjust|s\/r\s*adjust|\+?s\/r:/i.test(base)) return base;
  return `${base}\n${extra}`;
}
