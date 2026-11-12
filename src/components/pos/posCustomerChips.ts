/**
 * "₹… Due" (bills still unpaid) or "₹… Cr" chip of a customer in the POS customer search.
 * Rounded to whole rupees; nothing when it rounds to 0.
 */
export function posCustomerDueChip(
  grossOutstandingDr: number | null | undefined,
): { kind: "due" | "credit"; label: string } | null {
  const balance = Math.round(Number(grossOutstandingDr) || 0);
  if (balance === 0) return null;
  return {
    kind: balance > 0 ? "due" : "credit",
    label: `₹${Math.abs(balance).toLocaleString("en-IN")} ${balance > 0 ? "Due" : "Cr"}`,
  };
}
