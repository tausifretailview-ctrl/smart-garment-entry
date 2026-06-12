/** Whether a sale/invoice row is cancelled (either flag or legacy payment_status). */
export function isSaleInvoiceCancelled(sale: {
  is_cancelled?: boolean | null;
  payment_status?: string | null;
} | null | undefined): boolean {
  if (!sale) return false;
  if (sale.is_cancelled === true) return true;
  return String(sale.payment_status || "").toLowerCase() === "cancelled";
}
