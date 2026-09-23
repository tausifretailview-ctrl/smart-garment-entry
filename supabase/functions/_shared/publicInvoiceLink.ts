export type PublicInvoiceBillContext = "sale" | "pos";

export type PublicInvoiceSaleSettings = {
  invoice_paper_format?: unknown;
  sales_bill_format?: unknown;
  pos_bill_format?: unknown;
  invoice_template?: unknown;
};

export type BuildPublicInvoiceViewUrlInput = {
  orgSlug: string;
  saleId: string;
  billContext?: PublicInvoiceBillContext;
  saleSettings?: PublicInvoiceSaleSettings | null;
  baseUrl?: string;
};

export function resolvePublicInvoicePaperFormat(
  billContext: PublicInvoiceBillContext,
  saleSettings?: PublicInvoiceSaleSettings | null,
): string {
  const settings = saleSettings ?? {};
  if (billContext === "pos") {
    return String(settings.pos_bill_format || "thermal");
  }
  return String(
    settings.invoice_paper_format ||
      settings.sales_bill_format ||
      "a4",
  );
}

export function buildPublicInvoiceViewUrl(input: BuildPublicInvoiceViewUrlInput): string {
  const orgSlug = String(input.orgSlug || "").trim();
  const saleId = String(input.saleId || "").trim();
  if (!orgSlug || !saleId) return "";

  // Short link: /i/:saleId (?p=1 for POS). The public view resolves paper
  // format + invoice/POS template from the shop's current settings.
  const base = (input.baseUrl || "https://app.inventoryshop.in").replace(/\/$/, "");
  const billContext = input.billContext ?? "sale";
  const path = `${base}/i/${saleId}`;
  return billContext === "pos" ? `${path}?p=1` : path;
}
