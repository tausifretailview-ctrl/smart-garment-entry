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
  /** How many distinct MRP tiers exist for this name+brand+style+colour. */
  groupedMrpTierCount?: number;
};

function norm(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

export function purchaseStyleColorKey(
  v: Pick<PurchaseSearchVariantLike, "product_name" | "brand" | "style" | "color">,
): string {
  return [norm(v.product_name), norm(v.brand), norm(v.style), norm(v.color)].join("||");
}

function mrpBucket(mrp?: number): string {
  return (Math.round((Number(mrp) || 0) * 100) / 100).toFixed(2);
}

/** One dropdown row per product master + MRP tier (not per barcode/size). */
export function purchaseProductMasterKey(
  v: Pick<PurchaseSearchVariantLike, "product_name" | "brand" | "style" | "color" | "mrp">,
): string {
  return [purchaseStyleColorKey(v), mrpBucket(v.mrp)].join("||");
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

  const grouped = Array.from(buckets.values()).map((group) => {
    const representative = group[0];
    const productIds = [...new Set(group.map((g) => g.product_id).filter(Boolean))];
    const groupedProductIds = productIds.length > 0 ? productIds : [representative.product_id];
    // One SKU (Free Size / no-size): keep real size + barcode so inline pick
    // does not add a blank-size line or generate over the saved barcode.
    if (group.length === 1) {
      return {
        ...representative,
        groupedVariantCount: 1,
        groupedProductIds,
      };
    }
    return {
      ...representative,
      size: "",
      barcode: "",
      size_range: representative.size_range || sizeRangeFromSizes(group.map((g) => g.size)),
      groupedVariantCount: group.length,
      groupedProductIds,
    };
  });

  const tierCounts = new Map<string, number>();
  for (const row of grouped) {
    const styleKey = purchaseStyleColorKey(row);
    tierCounts.set(styleKey, (tierCounts.get(styleKey) || 0) + 1);
  }
  return grouped.map((row) => ({
    ...row,
    groupedMrpTierCount: tierCounts.get(purchaseStyleColorKey(row)) || 1,
  }));
}
