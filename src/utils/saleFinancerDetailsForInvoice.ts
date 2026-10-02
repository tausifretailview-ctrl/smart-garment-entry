/** Normalized financer/EMI block for invoice templates (Tally A4, WhatsApp PDF, etc.). */
export type InvoiceFinancerDetails = {
  financer_name: string;
  loan_number?: string;
  emi_amount?: number;
  tenure?: number;
  down_payment?: number;
  down_payment_mode?: string;
  bank_transfer_amount?: number;
  finance_discount?: number;
};

export function mapSaleFinancerDetailsForInvoice(
  finData: Record<string, unknown> | null | undefined,
): InvoiceFinancerDetails | null {
  const name = String(finData?.financer_name ?? "").trim();
  if (!name) return null;
  const num = (key: string) => {
    const v = Number(finData?.[key]);
    return Number.isFinite(v) && v !== 0 ? v : undefined;
  };
  const loan = String(finData?.loan_number ?? "").trim();
  const dpm = String(finData?.down_payment_mode ?? "").trim();
  return {
    financer_name: name,
    loan_number: loan || undefined,
    emi_amount: num("emi_amount"),
    tenure: num("tenure"),
    down_payment: num("down_payment"),
    down_payment_mode: dpm || undefined,
    bank_transfer_amount: num("bank_transfer_amount"),
    finance_discount: num("finance_discount"),
  };
}

export function hasInvoiceFinancerDetails(
  details: InvoiceFinancerDetails | null | undefined,
): details is InvoiceFinancerDetails {
  return Boolean(details?.financer_name?.trim());
}
