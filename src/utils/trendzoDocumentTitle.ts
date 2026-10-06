/**
 * Heading printed under the shop name on the Trendzo bill.
 * Sale settings → Invoice document title. Blank stays ESTIMATE.
 * TAX INVOICE and BILL OF SUPPLY are whatever the shop typed there.
 */
export function trendzoDocumentTitle(input: {
  documentType?: string;
  grandTotal?: number;
  invoiceDocumentTitle?: string | null;
}): string {
  if (input.documentType === "quotation") return "QUOTATION";
  if (input.documentType === "sale-order") return "SALE ORDER";
  if ((input.grandTotal ?? 0) < 0) return "CREDIT NOTE";
  const custom = (input.invoiceDocumentTitle ?? "").replace(/\s+/g, " ").trim();
  if (custom) return custom.toUpperCase();
  return "ESTIMATE";
}
