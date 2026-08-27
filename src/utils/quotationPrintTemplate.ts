export type QuotationPrintTemplateId = "retail" | "it-company";

export const QUOTATION_PRINT_TEMPLATE_KEY = "ezzy_quotation_print_template";

export const QUOTATION_PRINT_TEMPLATE_OPTIONS: {
  id: QuotationPrintTemplateId;
  label: string;
}[] = [
  { id: "retail", label: "Existing (Retail)" },
  { id: "it-company", label: "IT Company" },
];

export function isQuotationPrintTemplateId(value: string | null | undefined): value is QuotationPrintTemplateId {
  return value === "retail" || value === "it-company";
}

export function quotationPrintTemplateStorageKey(orgId?: string | null): string {
  return orgId ? `${QUOTATION_PRINT_TEMPLATE_KEY}_${orgId}` : QUOTATION_PRINT_TEMPLATE_KEY;
}

/** Per-org DB setting is authoritative; localStorage is pre-settings-load fallback only. */
export function resolveQuotationPrintTemplate(
  saleSettings?: {
    quotation_print_template?: string | null;
  } | null,
  orgId?: string | null,
): QuotationPrintTemplateId {
  const fromSettings = saleSettings?.quotation_print_template;
  if (isQuotationPrintTemplateId(fromSettings)) return fromSettings;

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(quotationPrintTemplateStorageKey(orgId));
  } catch {
    stored = null;
  }
  if (isQuotationPrintTemplateId(stored)) return stored;
  return "retail";
}

export function persistQuotationPrintTemplate(
  id: QuotationPrintTemplateId,
  orgId?: string | null,
): void {
  try {
    localStorage.setItem(quotationPrintTemplateStorageKey(orgId), id);
  } catch {
    /* ignore quota / private mode */
  }
}

export function saleTermsFromSettings(saleSettings?: { terms_list?: string[] | null } | null): string {
  return (saleSettings?.terms_list || [])
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .map((t, i) => `${i + 1}. ${t}`)
    .join("\n");
}

/** Quotation terms: merge Sale terms only when org opts in (default off). */
export function mergeQuotationTerms(
  quotationTerms?: string | null,
  saleSettings?: {
    terms_list?: string[] | null;
    merge_sale_terms_on_quotation?: boolean | null;
  } | null,
): string {
  const fromQuote = String(quotationTerms || "").trim();
  if (saleSettings?.merge_sale_terms_on_quotation !== true) {
    return fromQuote;
  }
  const fromSale = saleTermsFromSettings(saleSettings);
  if (fromSale && fromQuote && fromSale !== fromQuote) {
    return `${fromSale}\n${fromQuote}`;
  }
  return fromSale || fromQuote;
}
