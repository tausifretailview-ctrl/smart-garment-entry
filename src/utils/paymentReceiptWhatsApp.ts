/**
 * Extra WhatsApp line(s) when a receipt includes settlement discount.
 * Place after the paid-amount line and before balance / payment mode in standard receipts.
 */
export function whatsappPaymentReceiptDiscountLines(
  discountAmount: number | undefined,
  discountReason: string | undefined,
  formatInrBody: (n: number) => string
): string {
  const d = Number(discountAmount);
  if (!Number.isFinite(d) || d <= 0) return "";
  const reason = (discountReason ?? "").trim();
  const reasonPart = reason ? ` (${reason})` : "";
  return `\nDiscount: ₹${formatInrBody(d)}${reasonPart}`;
}
