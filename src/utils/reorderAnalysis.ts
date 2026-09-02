export const REORDER_PERIOD_OPTIONS = [90, 120, 180] as const;
export const DEFAULT_REORDER_PERIOD_DAYS = 120;

/** 30 days of cover + 5-day safety. No supplier lead-time column exists in v1. */
export const REORDER_COVER_DAYS = 35;

export type DaysRemainingTone = "critical" | "warning" | "ok";

export function daysRemainingTone(days: number | null): DaysRemainingTone {
  if (days === null || !Number.isFinite(days)) return "ok";
  if (days < 2) return "critical";
  if (days < 5) return "warning";
  return "ok";
}

export type ReorderRowForPo = {
  variantId: string;
  productId: string;
  productName: string;
  size: string | null;
  barcode: string | null;
  color: string | null;
  approvedQty: number;
  purPrice: number;
  gstPercent: number;
  hsnCode: string;
  primarySupplierId: string | null;
  primarySupplier: string | null;
};

export function groupApprovedRowsBySupplier(
  rows: ReorderRowForPo[],
): Map<string, ReorderRowForPo[]> {
  const groups = new Map<string, ReorderRowForPo[]>();
  for (const row of rows) {
    if (!row.primarySupplierId || row.approvedQty <= 0) continue;
    const list = groups.get(row.primarySupplierId) ?? [];
    list.push(row);
    groups.set(row.primarySupplierId, list);
  }
  return groups;
}

export function toPurchaseOrderItems(rows: ReorderRowForPo[]) {
  return rows.map((r) => ({
    product_id: r.productId,
    variant_id: r.variantId,
    product_name: r.productName,
    size: r.size,
    barcode: r.barcode,
    order_qty: r.approvedQty,
    unit_price: r.purPrice,
    gst_percent: r.gstPercent,
    hsn_code: r.hsnCode,
    color: r.color,
  }));
}
