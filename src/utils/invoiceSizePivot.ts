/**
 * Pivot SKU-per-line sale_items into product rows × size columns.
 *
 * sale_items stores one row per variant (size+color). Footwear wholesale bills
 * print those as a single product row with a quantity in each size column.
 * No new data capture — only item.size / qty / totals already on the invoice.
 */

import { sizeMatrixKey, sortSizes } from "@/utils/sizeSort";
import { roundInvoiceMoney } from "@/utils/invoiceGstRateSlabs";

export type InvoiceSizePivotLine = {
  particulars: string;
  color?: string;
  brand?: string;
  hsn?: string;
  gstPercent?: number;
  mrp?: number;
  discountPercent?: number;
  rate?: number;
  size: string;
  qty: number;
  total: number;
};

export type InvoiceSizePivotRow = {
  key: string;
  productName: string;
  color: string;
  hsn: string;
  gstPercent: number;
  mrp: number;
  discountPercent: number;
  netRate: number;
  qtyBySize: Record<string, number>;
  totalPairs: number;
  amount: number;
  merchandiseDiscount: number;
};

const moneyKey = (n: number): string => roundInvoiceMoney(n).toFixed(2);

export function collectSizesOnBill(items: InvoiceSizePivotLine[]): string[] {
  const set = new Set<string>();
  items.forEach((item) => {
    const key = sizeMatrixKey(item.size);
    if (key && key !== "—") set.add(key);
  });
  return sortSizes(Array.from(set));
}

function fillNumericGaps(sizes: string[]): string[] {
  if (sizes.length < 2) return sizes;
  if (!sizes.every((s) => /^\d+$/.test(s))) return sizes;
  const nums = sizes.map((s) => parseInt(s, 10));
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max - min > 24) return sizes;
  const filled: string[] = [];
  for (let n = min; n <= max; n += 1) filled.push(String(n));
  return filled;
}

/**
 * Column set for this bill.
 * Prefer an org size-group when every sold size belongs to it (blanks for
 * unsold sizes). Otherwise use sizes present on the bill, filling integer
 * gaps when they are numeric (7,9 → 7,8,9). Mixed groups (UK 6 + EU 40)
 * fall back to the union of sold sizes so one header row is not invented.
 */
export function resolveInvoiceSizeColumns(
  items: InvoiceSizePivotLine[],
  hintSizes?: string[] | null,
): string[] {
  const onBill = collectSizesOnBill(items);
  const hints = (hintSizes || [])
    .map((s) => sizeMatrixKey(s))
    .filter((s) => s && s !== "—");
  if (hints.length > 0 && onBill.every((s) => hints.includes(s))) {
    return sortSizes(Array.from(new Set(hints)));
  }
  return fillNumericGaps(onBill);
}

function rowKey(item: InvoiceSizePivotLine): string {
  return [
    item.particulars.trim(),
    (item.color || "").trim(),
    (item.hsn || "").trim(),
    moneyKey(Number(item.gstPercent || 0)),
    moneyKey(Number(item.mrp || 0)),
    moneyKey(Number(item.discountPercent || 0)),
    moneyKey(Number(item.rate || 0)),
  ].join("||");
}

export function pivotSaleItemsBySize(
  items: InvoiceSizePivotLine[],
  columns: string[],
): {
  rows: InvoiceSizePivotRow[];
  columnQtyTotals: Record<string, number>;
  totalPairs: number;
  totalAmount: number;
  merchandiseDiscount: number;
} {
  const map = new Map<string, InvoiceSizePivotRow>();

  items.forEach((item) => {
    const key = rowKey(item);
    const sz = sizeMatrixKey(item.size);
    const qty = Number(item.qty || 0);
    const total = Number(item.total || 0);
    const mrp = Number(item.mrp || 0);
    if (!map.has(key)) {
      map.set(key, {
        key,
        productName: item.particulars,
        color: item.color || "",
        hsn: item.hsn || "",
        gstPercent: Number(item.gstPercent || 0),
        mrp,
        discountPercent: Number(item.discountPercent || 0),
        netRate: Number(item.rate || 0),
        qtyBySize: {},
        totalPairs: 0,
        amount: 0,
        merchandiseDiscount: 0,
      });
    }
    const row = map.get(key)!;
    row.qtyBySize[sz] = (row.qtyBySize[sz] || 0) + qty;
    row.totalPairs += qty;
    row.amount += total;
    if (mrp > 0) {
      row.merchandiseDiscount += Math.max(0, mrp * qty - total);
    }
  });

  const rows = Array.from(map.values()).map((row) => ({
    ...row,
    amount: roundInvoiceMoney(row.amount),
    merchandiseDiscount: roundInvoiceMoney(row.merchandiseDiscount),
    netRate:
      row.totalPairs > 0
        ? roundInvoiceMoney(row.amount / row.totalPairs)
        : roundInvoiceMoney(row.netRate),
  }));

  const columnQtyTotals: Record<string, number> = {};
  columns.forEach((sz) => {
    columnQtyTotals[sz] = rows.reduce((s, r) => s + (r.qtyBySize[sz] || 0), 0);
  });

  return {
    rows,
    columnQtyTotals,
    totalPairs: rows.reduce((s, r) => s + r.totalPairs, 0),
    totalAmount: roundInvoiceMoney(rows.reduce((s, r) => s + r.amount, 0)),
    merchandiseDiscount: roundInvoiceMoney(rows.reduce((s, r) => s + r.merchandiseDiscount, 0)),
  };
}
