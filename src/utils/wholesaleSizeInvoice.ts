/**
 * Wholesale Size-wise A4 invoice (WholesaleSizeA4Template): size columns in the shop's size-group
 * order and product × colour rows grouped under brand / HSN headers.
 */
import {
  collectSizesOnBill,
  pivotRowKey,
  pivotSaleItemsBySize,
  resolveInvoiceSizeColumns,
  type InvoiceSizePivotRow,
} from "@/utils/invoiceSizePivot";
import { sizeMatrixKey } from "@/utils/sizeSort";
import { roundInvoiceMoney } from "@/utils/invoiceGstRateSlabs";

export type WholesaleSizeInvoiceItem = {
  particulars: string;
  size: string;
  qty: number;
  rate: number;
  total: number;
  sp?: number;
  mrp?: number;
  hsn?: string;
  brand?: string;
  color?: string;
  gstPercent?: number;
  discountPercent?: number;
};

/** A printed row: `listRate` is the rate before the line discount (the Rate column). */
export type WholesaleSizeRow = InvoiceSizePivotRow & { listRate: number };
type Group = { brand: string; hsn: string; rows: WholesaleSizeRow[] };

/**
 * Line value before GST. A GST-exclusive bill keeps each line total with its GST added
 * (Sale Bill lineTotal); the wholesale invoice prints rate and amount without GST and adds
 * the GST at the bottom.
 */
export function lineAmountBeforeGst(total: number, gstPercent: number | undefined, gstExclusive: boolean): number {
  const t = Number(total || 0);
  const g = Number(gstPercent || 0);
  return gstExclusive && g > 0 ? roundInvoiceMoney(t / (1 + g / 100)) : t;
}

/**
 * Size columns in the shop's own size-group order (28 … 42, then M … 3XL), from the first to the
 * last size sold on this bill, so a lingerie group does not print as M, L, XL, 28, 30.
 * Sizes outside the group fall back to the shared rule (sizes on the bill, sorted).
 */
export function wholesaleSizeColumns(items: WholesaleSizeInvoiceItem[], hintSizes?: string[] | null): string[] {
  const lines = items.map((item) => ({ particulars: item.particulars, size: item.size, qty: item.qty, total: item.total }));
  const sold = collectSizesOnBill(lines);
  const hints = [...new Set((hintSizes || []).map((h) => sizeMatrixKey(h)).filter((h) => h && h !== "—"))];
  if (sold.length === 0 || hints.length === 0 || !sold.every((sz) => hints.includes(sz))) {
    return resolveInvoiceSizeColumns(lines, null);
  }
  const at = sold.map((sz) => hints.indexOf(sz));
  return hints.slice(Math.min(...at), Math.max(...at) + 1);
}

/**
 * Product rows grouped under "BRAND · HSN" headers, in first-seen order (like a bill book).
 * `gstExclusive`: amounts without GST (GST goes in the totals), and no sale price in the MRP column.
 */
export function groupWholesaleSizeRows(
  items: WholesaleSizeInvoiceItem[],
  columns: string[],
  opts: { gstExclusive?: boolean } = {},
): {
  groups: Group[];
  columnQtyTotals: Record<string, number>;
  totalPcs: number;
  totalAmount: number;
} {
  const order: string[] = [];
  const byGroup = new Map<string, WholesaleSizeInvoiceItem[]>();
  for (const item of items) {
    const key = `${(item.brand || "").trim().toUpperCase()}||${(item.hsn || "").trim()}`;
    if (!byGroup.has(key)) {
      byGroup.set(key, []);
      order.push(key);
    }
    byGroup.get(key)!.push(item);
  }
  const groups: Group[] = order.map((key) => {
    const list = byGroup.get(key)!;
    const pivot = pivotSaleItemsBySize(
      list.map((item) => ({
        particulars: item.particulars,
        color: item.color,
        hsn: item.hsn,
        gstPercent: item.gstPercent,
        mrp: opts.gstExclusive ? item.mrp : item.mrp || item.sp,
        discountPercent: item.discountPercent,
        rate: item.rate,
        size: item.size,
        qty: item.qty,
        total: lineAmountBeforeGst(item.total, item.gstPercent, !!opts.gstExclusive),
      })),
      columns,
    );
    const [brand, hsn] = key.split("||");
    // Lines on one printed row share their rate (it is part of the row key).
    const rateByKey = new Map<string, number>();
    for (const item of list) {
      const k = pivotRowKey({ ...item, mrp: opts.gstExclusive ? item.mrp : item.mrp || item.sp });
      if (!rateByKey.has(k)) rateByKey.set(k, Number(item.rate || 0));
    }
    return {
      brand,
      hsn,
      rows: pivot.rows.map((r) => ({ ...r, listRate: rateByKey.get(r.key) || r.netRate })),
    };
  });
  const columnQtyTotals: Record<string, number> = {};
  columns.forEach((sz) => {
    columnQtyTotals[sz] = groups.reduce((s, g) => s + g.rows.reduce((t, r) => t + (r.qtyBySize[sz] || 0), 0), 0);
  });
  const all = groups.flatMap((g) => g.rows);
  return {
    groups,
    columnQtyTotals,
    totalPcs: all.reduce((s, r) => s + r.totalPairs, 0),
    totalAmount: roundInvoiceMoney(all.reduce((s, r) => s + r.amount, 0)),
  };
}

