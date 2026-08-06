import type {
  PosCartItem,
  SaleItemRowForFlatResolve,
  SaleRowForFlatResolve,
} from "./types";

/**
 * Restore bill-level flat discount for POS edit when `sales.flat_*` is missing but
 * `sale_items` still carry post-flat `per_qty_net_amount`, or legacy rows put the
 * whole bill discount in `sales.discount_amount` while line totals stayed at gross.
 */
export function resolveBillFlatForPosEdit(
  sale: SaleRowForFlatResolve,
  saleItems: SaleItemRowForFlatResolve[],
): { value: number; mode: "percent" | "amount"; percentLooksClean: boolean } {
  const savedFlatPercent = Number(sale.flat_discount_percent) || 0;
  const savedFlatAmount = Number(sale.flat_discount_amount) || 0;
  const percentLooksClean =
    savedFlatPercent > 0 &&
    Math.abs(savedFlatPercent * 100 - Math.round(savedFlatPercent * 100)) < 0.0001;

  if (percentLooksClean) return { value: savedFlatPercent, mode: "percent", percentLooksClean: true };
  if (savedFlatAmount > 0.005) return { value: savedFlatAmount, mode: "amount", percentLooksClean: false };

  let fromLines = 0;
  for (const row of saleItems || []) {
    const lt = Number(row.line_total) || 0;
    const pq = Number(row.per_qty_net_amount) || 0;
    const q = Number(row.quantity) || 0;
    if (pq > 0.005 && q > 0) fromLines += Math.max(0, lt - pq * q);
  }
  fromLines = Math.round(fromLines * 100) / 100;
  if (fromLines > 0.02) return { value: fromLines, mode: "amount", percentLooksClean: false };

  const gross = Number(sale.gross_amount) || 0;
  const discAgg = Number(sale.discount_amount) || 0;
  if (discAgg > 0.02 && gross > 0.02) {
    const lineSum = (saleItems || []).reduce((s, r) => s + (Number(r.line_total) || 0), 0);
    if (Math.abs(lineSum - gross) < 0.05) {
      const hasLineDisc = (saleItems || []).some((row) => {
        const m = Number(row.mrp) || 0;
        const u = Number(row.unit_price) || 0;
        const q = Number(row.quantity) || 0;
        if ((Number(row.discount_percent) || 0) > 0.005) return true;
        return m > u + 0.01 && q > 0;
      });
      if (!hasLineDisc) return { value: discAgg, mode: "amount", percentLooksClean: false };
    }
  }

  return { value: 0, mode: "percent", percentLooksClean: false };
}

/**
 * Map persisted sale_items → cart (edit-existing-bill path).
 * Does not set `stockQty` — no extra DB round-trip on load. Cart stock dots stay hidden
 * for restored lines unless the cashier re-adds (v1; edit-mode freedQty caveat applies).
 */
export function mapSaleItemsToPosCart(
  saleItems: Array<{
    id: string;
    barcode?: string | null;
    product_name: string;
    size?: string | null;
    color?: string | null;
    quantity: number;
    mrp: number;
    unit_price: number;
    gst_percent?: number | null;
    discount_percent?: number | null;
    line_total: number;
    product_id: string;
    variant_id: string;
    hsn_code?: string | null;
    item_notes?: string | null;
  }>,
): PosCartItem[] {
  return saleItems.map((item) => ({
    id: item.id,
    barcode: item.barcode || "",
    productName: item.product_name,
    size: item.size || "",
    color: item.color || "",
    quantity: item.quantity,
    mrp: item.mrp,
    originalMrp: item.mrp > item.unit_price ? item.mrp : null,
    gstPer: item.gst_percent ?? 0,
    discountPercent: item.discount_percent ?? 0,
    discountAmount: 0,
    unitCost: item.unit_price,
    netAmount: item.line_total,
    productId: item.product_id,
    variantId: item.variant_id,
    hsnCode: item.hsn_code || "",
    itemNotes: item.item_notes || null,
  }));
}
