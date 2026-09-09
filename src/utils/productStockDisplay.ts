/** Virtual stock stamped on service variants at product entry (unlimited billing). */
export const SERVICE_VIRTUAL_STOCK_QTY = 999999;

export function isServiceProduct(productType?: string | null): boolean {
  return productType === "service";
}

/** Service/combo do not track physical stock for sale UI / validation. */
export function isNonStockTrackedProduct(productType?: string | null): boolean {
  return productType === "service" || productType === "combo";
}

export function isVirtualServiceStockQty(qty: number): boolean {
  return qty >= SERVICE_VIRTUAL_STOCK_QTY;
}

/**
 * Sale / POS / size-grid stock label.
 * Service (and combo) variants are stored with virtual 999999 (may drift after
 * movements); UI always shows 1 — matching Product Master.
 */
export function displaySaleStockQty(
  productType: string | undefined | null,
  rawStock: number | null | undefined,
): number {
  if (isNonStockTrackedProduct(productType)) return 1;
  return Number(rawStock) || 0;
}

/** Product Master grid — service rows show 1 (no physical stock tracking). */
export function displayProductDashboardStock(
  productType: string | undefined | null,
  rawStock: number,
): number {
  if (isServiceProduct(productType)) return 1;
  return rawStock;
}

/** Variant expand row — service variants show 1. */
export function displayVariantDashboardStock(
  productType: string | undefined | null,
  rawStock: number,
): number {
  if (isServiceProduct(productType)) return 1;
  return rawStock;
}

/** KPI / inventory totals — service and combo contribute 0 qty and 0 value. */
export function physicalStockQtyForTotals(
  productType: string | undefined | null,
  rawStock: number,
): number {
  if (isNonStockTrackedProduct(productType)) return 0;
  return rawStock;
}

export function physicalStockValueForTotals(
  productType: string | undefined | null,
  rawStock: number,
  unitPrice: number,
): number {
  if (isNonStockTrackedProduct(productType)) return 0;
  return rawStock * unitPrice;
}

export type QuickStockTotalRow = {
  stock_qty?: number | null;
  sale_price?: number | null;
  product?: { product_type?: string | null } | null;
};

/** Drop service rows from Quick Stock Check — they are not physical inventory. */
export function excludeServiceVariants<T extends QuickStockTotalRow>(rows: T[]): T[] {
  return rows.filter((item) => !isServiceProduct(item.product?.product_type));
}

/** Quick Stock Check header totals — never include virtual 999999 service/combo units. */
export function sumPhysicalStockTotals(rows: QuickStockTotalRow[]): { qty: number; value: number } {
  let qty = 0;
  let value = 0;
  for (const item of rows) {
    const productType = item.product?.product_type;
    const raw = Number(item.stock_qty) || 0;
    const price = Number(item.sale_price) || 0;
    qty += physicalStockQtyForTotals(productType, raw);
    value += physicalStockValueForTotals(productType, raw, price);
  }
  return { qty, value };
}
