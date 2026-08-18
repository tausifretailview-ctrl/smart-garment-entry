import { sizeMatrixKey } from "@/utils/sizeSort";

/** Same grouping as Stock Report Size-wise tab: name + brand + colour + style. */
export function sizeWiseStockGroupKey(
  productName?: string | null,
  brand?: string | null,
  color?: string | null,
  style?: string | null,
): string {
  const n = (v?: string | null) => (v ?? "").trim().toUpperCase();
  return `${n(productName)}|${n(brand)}|${n(color)}|${n(style)}`;
}

export type SizeWiseStockVariantRow = {
  product_name?: string | null;
  brand?: string | null;
  color?: string | null;
  style?: string | null;
  size?: string | null;
  stock_qty?: number | null;
};

/**
 * Sum on-hand stock_qty the same way Size-wise Stock Report does
 * (all barcodes / product rows that share name+brand+colour+style).
 */
export function aggregateSizeWiseStock(
  variants: SizeWiseStockVariantRow[],
): Map<string, Map<string, number>> {
  const byGroup = new Map<string, Map<string, number>>();
  for (const v of variants) {
    const group = sizeWiseStockGroupKey(v.product_name, v.brand, v.color, v.style);
    const size = sizeMatrixKey(v.size);
    if (!byGroup.has(group)) byGroup.set(group, new Map());
    const sizes = byGroup.get(group)!;
    sizes.set(size, (sizes.get(size) ?? 0) + (Number(v.stock_qty) || 0));
  }
  return byGroup;
}

export function sizeStockListForGroup(
  byGroup: Map<string, Map<string, number>>,
  productName?: string | null,
  brand?: string | null,
  color?: string | null,
  style?: string | null,
): { size: string; qty: number }[] {
  const sizes = byGroup.get(sizeWiseStockGroupKey(productName, brand, color, style));
  if (!sizes) return [];
  return Array.from(sizes.entries()).map(([size, qty]) => ({ size, qty }));
}
