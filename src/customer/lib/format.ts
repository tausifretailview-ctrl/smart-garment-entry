export function formatINR(n: number): string {
  return `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * "Ends today", "Last 3 days", "Valid till 20 Oct 2026" or "Offer ended" for an offer's
 * valid_till (YYYY-MM-DD, inclusive). Dates compare in the phone's own calendar day.
 */
export function offerValidity(validTill: string | null | undefined, now = new Date()): { label: string; ended: boolean; urgent: boolean } | null {
  if (!validTill || !/^\d{4}-\d{2}-\d{2}$/.test(validTill)) return null;
  const [y, m, d] = validTill.split("-").map(Number);
  const end = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((end.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { label: "Offer ended", ended: true, urgent: false };
  if (days === 0) return { label: "Ends today", ended: false, urgent: true };
  if (days === 1) return { label: "Ends tomorrow", ended: false, urgent: true };
  if (days <= 3) return { label: `Last ${days + 1} days`, ended: false, urgent: true };
  return { label: `Valid till ${formatDate(validTill)}`, ended: false, urgent: false };
}
