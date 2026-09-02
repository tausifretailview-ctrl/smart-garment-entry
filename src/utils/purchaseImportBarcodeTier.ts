import { effectiveBarcodePriceTier, barcodePriceTierKey } from "@/utils/barcodeValidation";

/** Stable price-tier key for purchase import / universal EAN (549 vs 569). */
export function importPriceTierKey(mrp?: number | null, salePrice?: number | null): string {
  const tier = effectiveBarcodePriceTier({ mrp, salePrice });
  if (tier <= 0) return "0";
  return barcodePriceTierKey({ mrp, salePrice });
}

/** Lookup key: same barcode at different MRP tiers must stay separate SKUs. */
export function barcodeTierLookupKey(
  barcode: string,
  mrp?: number | null,
  salePrice?: number | null,
): string {
  return `${barcode.trim()}::${importPriceTierKey(mrp, salePrice)}`;
}

export type PurchaseImportProductKeyRow = {
  product_name?: unknown;
  brand?: unknown;
  category?: unknown;
  color?: unknown;
  style?: unknown;
  mrp?: unknown;
  sale_price?: unknown;
};

/**
 * Product dedupe key for Excel import — includes MRP/sale tier so Jockey-style
 * shared EAN at ₹549 vs ₹569 becomes two product masters (required: unique index
 * is product_id + color + size + barcode; same barcode+size cannot repeat on one product).
 */
export function makePurchaseImportProductKey(
  row: PurchaseImportProductKeyRow,
  parseNumber: (value: unknown) => number,
): string {
  const tier = importPriceTierKey(parseNumber(row.mrp), parseNumber(row.sale_price));
  return [
    row.product_name?.toString().trim() || "",
    row.brand?.toString().trim() || "",
    row.category?.toString().trim() || "",
    row.color?.toString().trim() || "",
    row.style?.toString().trim() || "",
    tier,
  ]
    .join("|")
    .toLowerCase();
}

export function accessoryVariantCollapseKey(
  color: string | null | undefined,
  mrp?: number | null,
  salePrice?: number | null,
): string {
  return `${color || ""}::${importPriceTierKey(mrp, salePrice)}`;
}
