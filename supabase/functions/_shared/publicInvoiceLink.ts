export type PublicInvoiceBillContext = "sale" | "pos";

export type PublicInvoiceSaleSettings = {
  invoice_paper_format?: string | null;
  sales_bill_format?: string | null;
  pos_bill_format?: string | null;
  invoice_template?: string | null;
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

  const base = (input.baseUrl || "https://app.inventoryshop.in").replace(/\/$/, "");
  const path = `${base}/${orgSlug}/invoice/view/${saleId}`;
  const billContext = input.billContext ?? "sale";
  const paperFormat = resolvePublicInvoicePaperFormat(billContext, input.saleSettings);
  const params = new URLSearchParams();

  if (paperFormat === "thermal") {
    params.set("format", "thermal");
  }

  const template = String(input.saleSettings?.invoice_template || "").trim();
  if (template) {
    params.set("template", template);
  }

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
