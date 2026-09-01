/** Compact POS WhatsApp receipt — invoice essentials + public view link. */

export type MobilePosPaymentMethod = "cash" | "card" | "upi" | "multiple" | "pay_later";

export type MobilePosMixBreakdown = {
  cashAmount: number;
  cardAmount: number;
  upiAmount: number;
};

function formatInr(amount: number): string {
  const n = Number(amount);
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatMobilePosInvoiceDate(date: Date = new Date()): string {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
}

export function formatMobilePosPaymentLabel(
  method: MobilePosPaymentMethod,
  mix?: MobilePosMixBreakdown | null,
): string {
  if (method === "multiple") {
    const parts: string[] = [];
    const cash = Number(mix?.cashAmount) || 0;
    const card = Number(mix?.cardAmount) || 0;
    const upi = Number(mix?.upiAmount) || 0;
    if (cash > 0) parts.push(`Cash ₹${formatInr(cash)}`);
    if (card > 0) parts.push(`Card ₹${formatInr(card)}`);
    if (upi > 0) parts.push(`UPI ₹${formatInr(upi)}`);
    return parts.length > 0 ? `Mix (${parts.join(", ")})` : "Mix";
  }
  if (method === "pay_later") return "Pay later";
  if (method === "upi") return "UPI";
  if (method === "card") return "Card";
  return "Cash";
}

export function buildMobilePosWhatsAppMessage(input: {
  invoiceNo: string;
  invoiceDateLabel: string;
  netAmount: number;
  paymentLabel: string;
  publicInvoiceUrl?: string | null;
}): string {
  const lines = [
    `Invoice: ${input.invoiceNo}`,
    `Date: ${input.invoiceDateLabel}`,
    `Amount: ₹${formatInr(input.netAmount)}`,
    `Payment: ${input.paymentLabel}`,
  ];
  const url = String(input.publicInvoiceUrl || "").trim();
  if (url) {
    lines.push("", `View invoice: ${url}`);
  }
  return lines.join("\n");
}

export function hasMobilePosWhatsAppPhone(phone: string | null | undefined): boolean {
  return String(phone || "").replace(/\D/g, "").length >= 10;
}
