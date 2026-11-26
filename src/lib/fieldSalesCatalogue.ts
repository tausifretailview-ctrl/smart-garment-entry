/**
 * Field Sales → Catalogue (send the product catalogue PDF on WhatsApp). On unless the shop
 * turned it off in Settings → Sale → Field Sales catalogue (sale_settings.field_sales_catalogue).
 */
export function isFieldSalesCatalogueOn(saleSettings: Record<string, unknown> | null | undefined): boolean {
  return saleSettings?.field_sales_catalogue !== false;
}
