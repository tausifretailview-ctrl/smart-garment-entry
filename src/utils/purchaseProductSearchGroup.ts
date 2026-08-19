export type PurchaseSearchVariantLike = {
  id: string;
  product_id: string;
  product_name: string;
  brand: string;
  category?: string;
  style: string;
  color: string;
  size: string;
  barcode: string;
  pur_price: number;
  sale_price: number;
  mrp?: number;
  size_range?: string | null;
  groupedVariantCount?: number;
  groupedProductIds?: string[];
};

function norm(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/** One dropdown row per product master (name + brand + style + colour), not per barcode. */
export function purchaseProductMasterKey(
  v: Pick<PurchaseSearchVariantLike, "product_name" | "brand" | "style" | "color">,
): string {
  return [norm(v.product_name), norm(v.brand), norm(v.style), norm(v.color)].join("||");
}

function sizeRangeFromSizes(sizes: string[]): string | null {
  const unique = [...new Set(sizes.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return `${unique[0]}-${unique[unique.length - 1]}`;
}

export function groupPurchaseSearchByProductMaster<T extends PurchaseSearchVariantLike>(
  results: T[],
): T[] {
  const buckets = new Map<string, T[]>();
  for (const row of results) {
    const key = purchaseProductMasterKey(row) || row.product_id || row.id;
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }

  return Array.from(buckets.values()).map((group) => {
    const representative = group[0];
    const productIds = [...new Set(group.map((g) => g.product_id).filter(Boolean))];
    return {
      ...representative,
      size: "",
      barcode: "",
      size_range: representative.size_range || sizeRangeFromSizes(group.map((g) => g.size)),
      groupedVariantCount: group.length,
      groupedProductIds: productIds.length > 0 ? productIds : [representative.product_id],
    };
  });
}
