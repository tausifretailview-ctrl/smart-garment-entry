/**
 * Resolve which invoice template to use when capturing a PDF for WappConnect.
 * When no override is configured, the POS/print template is used unchanged.
 */
export function resolveWappConnectPdfInvoiceTemplate(
  printTemplate: string,
  wappConnectOverride?: string | null,
): string {
  const override = String(wappConnectOverride ?? "").trim();
  if (!override) return printTemplate;
  return override;
}
