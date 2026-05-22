import { format } from "date-fns";

/** When the bill was saved in EzzyERP (falls back to created_at for older rows). */
export function getPurchaseBillEntryAt(bill: {
  bill_entry_at?: string | null;
  created_at?: string | null;
}): string | null {
  return bill.bill_entry_at ?? bill.created_at ?? null;
}

export function formatPurchaseBillEntryAt(
  bill: { bill_entry_at?: string | null; created_at?: string | null },
  pattern = "dd MMM yyyy, hh:mm a",
): string {
  const raw = getPurchaseBillEntryAt(bill);
  if (!raw) return "—";
  try {
    return format(new Date(raw), pattern);
  } catch {
    return "—";
  }
}
