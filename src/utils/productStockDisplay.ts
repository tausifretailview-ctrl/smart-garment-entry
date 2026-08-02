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

/** KPI / inventory totals — services contribute 0 qty and 0 value. */
export function physicalStockQtyForTotals(
  productType: string | undefined | null,
  rawStock: number,
): number {
  if (isServiceProduct(productType)) return 0;
  return rawStock;
}

export function physicalStockValueForTotals(
  productType: string | undefined | null,
  rawStock: number,
  unitPrice: number,
): number {
  if (isServiceProduct(productType)) return 0;
  return rawStock * unitPrice;
}
