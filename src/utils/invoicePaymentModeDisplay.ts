/** Financer block on invoice (subset — only name needed for payment label). */
export type InvoiceFinancerLabelHint = {
  financer_name?: string | null;
} | null | undefined;

/**
 * POS mix payment stores bank + finance tender in `card_amount` (see allocateMixPaymentToBill).
 * Invoice "Mode of Payment" should say Finance when the sale used financer billing.
 */
export function invoiceCardBucketPaymentLabel(params: {
  paymentMethod?: string | null;
  financerDetails?: InvoiceFinancerLabelHint;
}): "Card" | "Finance" {
  const method = String(params.paymentMethod || "").toLowerCase();
  if (method === "finance") return "Finance";
  if (String(params.financerDetails?.financer_name || "").trim()) return "Finance";
  return "Card";
}

export function formatInvoicePaymentModeFallback(paymentMethod?: string | null): string {
  const raw = String(paymentMethod || "").trim();
  if (!raw) return "Cash";
  const lower = raw.toLowerCase();
  if (lower === "finance") return "Finance";
  if (lower === "multiple") return "Mix";
  if (lower === "bank_transfer" || lower === "bank") return "Bank Transfer";
  if (lower === "pay_later") return "Pay Later";
  return raw.charAt(0).toUpperCase() + raw.slice(1).replace(/_/g, " ");
}

export type InvoicePaymentModeAmounts = {
  paymentMethod?: string | null;
  cashAmount?: number | null;
  cardAmount?: number | null;
  upiAmount?: number | null;
  creditAmount?: number | null;
  /** Finance tender entered in Mix Payment; it is stored inside card_amount. */
  financeAmount?: number | null;
  financerDetails?: InvoiceFinancerLabelHint;
};

export function buildInvoicePaymentModeParts(
  input: InvoicePaymentModeAmounts,
  formatAmount: (n: number) => string,
): string[] {
  const parts: string[] = [];
  const cash = Number(input.cashAmount) || 0;
  const upi = Number(input.upiAmount) || 0;
  const credit = Number(input.creditAmount) || 0;
  const card = Number(input.cardAmount) || 0;

  if (cash > 0) parts.push(`Cash ₹${formatAmount(cash)}`);
  if (upi > 0) parts.push(`UPI ₹${formatAmount(upi)}`);
  // Mix Payment folds Finance into card_amount; show it on its own line when known.
  const finance = Math.min(card, Math.max(0, Number(input.financeAmount) || 0));
  const cardOnly = Math.round((card - finance) * 100) / 100;
  if (cardOnly > 0) {
    const cardLabel = finance > 0
      ? "Card"
      : invoiceCardBucketPaymentLabel({
          paymentMethod: input.paymentMethod,
          financerDetails: input.financerDetails,
        });
    parts.push(`${cardLabel} ₹${formatAmount(cardOnly)}`);
  }
  if (finance > 0) parts.push(`Finance ₹${formatAmount(finance)}`);
  if (credit > 0) parts.push(`Credit ₹${formatAmount(credit)}`);
  return parts;
}
