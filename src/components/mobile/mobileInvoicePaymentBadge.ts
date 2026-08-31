/** Display status for the mobile Sale Details sheet. DB uses `completed`, not `paid`. */

export type MobileInvoicePaymentTone = "paid" | "partial" | "pending" | "hold";

export function mobileInvoicePaymentBadge(
  paymentStatus: string | null | undefined,
  pendingAmount: number,
  paidAmount: number,
): { label: string; tone: MobileInvoicePaymentTone } {
  const status = String(paymentStatus || "").toLowerCase();
  if (status === "hold") return { label: "Hold", tone: "hold" };
  if (status === "completed" || status === "paid" || pendingAmount <= 0.5) {
    return { label: "Paid", tone: "paid" };
  }
  if (status === "partial" || paidAmount > 0.5) {
    return { label: "Partial", tone: "partial" };
  }
  return { label: "Pending", tone: "pending" };
}
