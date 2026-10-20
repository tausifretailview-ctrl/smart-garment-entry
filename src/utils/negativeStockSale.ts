/**
 * Settings > Sale "Allow sale without stock" (sale_settings.allow_negative_stock_sale).
 * Off by default. When on, Sale Bill / POS bill items with no stock after a warning
 * and stock goes negative (database triggers read the same flag).
 */
export function isNegativeStockSaleAllowed(saleSettings: unknown): boolean {
  return (saleSettings as { allow_negative_stock_sale?: unknown } | null | undefined)
    ?.allow_negative_stock_sale === true;
}
