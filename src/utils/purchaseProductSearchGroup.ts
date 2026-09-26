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
  /** How many distinct MRP tiers exist for this name+brand+style (when show_mrp splits). */
  groupedMrpTierCount?: number;
  /** True when variants in the collapsed row have more than one sale_price. */
  salePricesDiffer?: boolean;
  /** Lowest / highest rates across the collapsed row (set by grouping). */
  mrpMin?: number;
  mrpMax?: number;
  purPriceMin?: number;
  purPriceMax?: number;
  salePriceMin?: number;
  salePriceMax?: number;
};

export type GroupPurchaseSearchOptions = {
  /**
   * Org `purchase_settings.show_mrp`. When true and a style group has ≥2 distinct
   * MRP values, emit one row per MRP tier. Otherwise collapse to a single row.
   */
  showMrp?: boolean;
};

function norm(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

/** Style identity for purchase search grouping: name + brand + style (no color). */
export function purchaseStyleKey(
  v: Pick<PurchaseSearchVariantLike, "product_name" | "brand" | "style">,
): string {
  return [norm(v.product_name), norm(v.brand), norm(v.style)].join("||");
}

/**
 * @deprecated Color is no longer part of the grouping key. Prefer `purchaseStyleKey`.
 * Kept so older call sites that still pass color keep compiling; color is ignored.
 */
export function purchaseStyleColorKey(
  v: Pick<PurchaseSearchVariantLike, "product_name" | "brand" | "style" | "color">,
): string {
  return purchaseStyleKey(v);
}

function mrpBucket(mrp?: number): string {
  return (Math.round((Number(mrp) || 0) * 100) / 100).toFixed(2);
}

function moneyBucket(value?: number): string {
  return mrpBucket(value);
}

/**
 * Row key for a single variant once MRP-split policy is known.
 * Prefer `groupPurchaseSearchByProductMaster` for lists — split depends on siblings.
 */
export function purchaseProductMasterKey(
  v: Pick<PurchaseSearchVariantLike, "product_name" | "brand" | "style" | "mrp">,
  opts?: { includeMrpTier?: boolean },
): string {
  const style = purchaseStyleKey(v);
  if (opts?.includeMrpTier) return [style, mrpBucket(v.mrp)].join("||");
  return style;
}

function sizeRangeFromSizes(sizes: string[]): string | null {
  const unique = [...new Set(sizes.map((s) => s.trim()).filter(Boolean))];
  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];
  return `${unique[0]}-${unique[unique.length - 1]}`;
}

function rateRange(values: Array<number | null | undefined>): { min: number; max: number } {
  const nums = values.map((v) => Number(v) || 0);
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

function finalizeGroup<T extends PurchaseSearchVariantLike>(group: T[]): T {
  const representative = group[0];
  const mrpRange = rateRange(group.map((g) => g.mrp));
  const purRange = rateRange(group.map((g) => g.pur_price));
  const saleRange = rateRange(group.map((g) => g.sale_price));
  const ranges = {
    mrpMin: mrpRange.min,
    mrpMax: mrpRange.max,
    purPriceMin: purRange.min,
    purPriceMax: purRange.max,
    salePriceMin: saleRange.min,
    salePriceMax: saleRange.max,
  };
  const productIds = [...new Set(group.map((g) => g.product_id).filter(Boolean))];
  const groupedProductIds = productIds.length > 0 ? productIds : [representative.product_id];
  const salePricesDiffer =
    group.length > 1 && new Set(group.map((g) => moneyBucket(g.sale_price))).size > 1;
  const distinctColors = new Set(group.map((g) => norm(g.color)).filter(Boolean));
  const multiColor = distinctColors.size > 1;

  if (group.length === 1) {
    return {
      ...representative,
      groupedVariantCount: 1,
      groupedProductIds,
      salePricesDiffer: false,
      ...ranges,
    };
  }

  return {
    ...representative,
    size: "",
    barcode: "",
    // Avoid implying a single colour when the row spans several.
    color: multiColor ? "" : representative.color,
    size_range: representative.size_range || sizeRangeFromSizes(group.map((g) => g.size)),
    groupedVariantCount: group.length,
    groupedProductIds,
    salePricesDiffer,
    ...ranges,
  };
}

/**
 * One dropdown row per product master (name+brand+style), optionally split by MRP
 * when `showMrp` is on and the group has ≥2 distinct MRP values.
 */
export function groupPurchaseSearchByProductMaster<T extends PurchaseSearchVariantLike>(
  results: T[],
  options: GroupPurchaseSearchOptions = {},
): T[] {
  const showMrp = options.showMrp === true;

  const styleBuckets = new Map<string, T[]>();
  for (const row of results) {
    const key = purchaseStyleKey(row) || row.product_id || row.id;
    const list = styleBuckets.get(key);
    if (list) list.push(row);
    else styleBuckets.set(key, [row]);
  }

  const finalGroups: T[][] = [];
  for (const styleGroup of styleBuckets.values()) {
    const distinctMrps = new Set(styleGroup.map((g) => mrpBucket(g.mrp)));
    if (showMrp && distinctMrps.size >= 2) {
      const byMrp = new Map<string, T[]>();
      for (const row of styleGroup) {
        const k = mrpBucket(row.mrp);
        const list = byMrp.get(k);
        if (list) list.push(row);
        else byMrp.set(k, [row]);
      }
      for (const sub of byMrp.values()) finalGroups.push(sub);
    } else {
      finalGroups.push(styleGroup);
    }
  }

  const grouped = finalGroups.map((group) => finalizeGroup(group));

  const tierCounts = new Map<string, number>();
  for (const row of grouped) {
    const styleKey = purchaseStyleKey(row);
    tierCounts.set(styleKey, (tierCounts.get(styleKey) || 0) + 1);
  }
  return grouped.map((row) => ({
    ...row,
    groupedMrpTierCount: tierCounts.get(purchaseStyleKey(row)) || 1,
  }));
}

/** Pass MRP into size-grid / +All only when this row is one of several MRP tiers. */
export function purchaseGroupMrpFilter(
  v: Pick<PurchaseSearchVariantLike, "mrp" | "groupedMrpTierCount">,
): number | undefined {
  return (v.groupedMrpTierCount ?? 1) > 1 ? v.mrp : undefined;
}

function formatRate(value: number): string {
  return `₹${(Number(value) || 0).toFixed(2)}`;
}

/** "₹195.65", or "₹180.00 – ₹210.00" when the grouped sizes have different rates. */
export function purchaseRateLabel(
  value: number | null | undefined,
  min?: number,
  max?: number,
): string {
  if (min != null && max != null && moneyBucket(min) !== moneyBucket(max)) {
    return `${formatRate(min)} – ${formatRate(max)}`;
  }
  return formatRate(Number(value) || 0);
}

/** MRP / Buy / Sale text for a grouped purchase search row (always filled). */
export function purchaseSearchRateLabels(
  v: Pick<
    PurchaseSearchVariantLike,
    | "mrp"
    | "pur_price"
    | "sale_price"
    | "mrpMin"
    | "mrpMax"
    | "purPriceMin"
    | "purPriceMax"
    | "salePriceMin"
    | "salePriceMax"
  >,
): { mrp: string; buy: string; sale: string } {
  return {
    mrp: purchaseRateLabel(v.mrp, v.mrpMin, v.mrpMax),
    buy: purchaseRateLabel(v.pur_price, v.purPriceMin, v.purPriceMax),
    sale: purchaseRateLabel(v.sale_price, v.salePriceMin, v.salePriceMax),
  };
}
