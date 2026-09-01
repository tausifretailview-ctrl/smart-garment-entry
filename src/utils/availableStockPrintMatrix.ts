import { sizeMatrixKey, sortSizes } from "@/utils/sizeSort";

export type AvailableStockPrintItem = {
  particulars: string;
  color?: string;
  brand?: string;
  style?: string;
  size: string;
  orderQty: number;
  pendingQty: number;
  sizeStock?: { size: string; qty: number }[];
  /** Fallback on-hand for this line's size when sizeStock misses it. */
  onHandQty?: number;
};

export type AvailableStockCell = {
  stock: number;
  ordered: number;
  pending: number;
  available: number;
};

export type AvailableStockMatrixRow = {
  key: string;
  productName: string;
  color?: string;
  brand?: string;
  style?: string;
  cells: Map<string, AvailableStockCell>;
  totalStock: number;
  totalAvailable: number;
  totalOrdered: number;
  totalPending: number;
};

function emptyCell(): AvailableStockCell {
  return { stock: 0, ordered: 0, pending: 0, available: 0 };
}

/**
 * Article × size pick-list matrix: available = Size-wise Stock on-hand (stock_qty)
 * only for sizes that have order qty on that article. Extra warehouse sizes are
 * not printed and are not added into Avl totals.
 */
export function buildAvailableStockMatrix(items: AvailableStockPrintItem[]): {
  rows: AvailableStockMatrixRow[];
  sizes: string[];
  grandAvailable: number;
  grandOrdered: number;
} {
  const map = new Map<string, AvailableStockMatrixRow>();
  const rowKey = (item: AvailableStockPrintItem) =>
    `${item.particulars}||${item.brand || ""}||${item.color || ""}||${item.style || ""}`;

  items.forEach((item) => {
    const key = rowKey(item);
    if (!map.has(key)) {
      map.set(key, {
        key,
        productName: item.particulars,
        color: item.color,
        brand: item.brand,
        style: item.style,
        cells: new Map(),
        totalStock: 0,
        totalAvailable: 0,
        totalOrdered: 0,
        totalPending: 0,
      });
    }
    const row = map.get(key)!;
    const sz = sizeMatrixKey(item.size);
    const cur = row.cells.get(sz) || emptyCell();
    cur.ordered += item.orderQty || 0;
    cur.pending += item.pendingQty || 0;
    row.cells.set(sz, cur);
  });

  items.forEach((item) => {
    const key = rowKey(item);
    const row = map.get(key);
    if (!row) return;
    (item.sizeStock || []).forEach((s) => {
      const sz = sizeMatrixKey(s.size);
      const cur = row.cells.get(sz);
      if (!cur || cur.ordered <= 0) return;
      cur.stock = Number(s.qty) || 0;
    });
    const lineSz = sizeMatrixKey(item.size);
    const lineCell = row.cells.get(lineSz);
    const fallback = Number(item.onHandQty) || 0;
    if (lineCell && fallback > lineCell.stock) {
      lineCell.stock = fallback;
    }
  });

  const sizeSet = new Set<string>();
  map.forEach((row) => {
    row.cells.forEach((c, sz) => {
      if (c.ordered > 0) sizeSet.add(sz);
    });
  });
  const sizes = sortSizes(Array.from(sizeSet));

  const rows = Array.from(map.values()).map((row) => {
    row.cells.forEach((c) => {
      c.available = c.stock;
    });
    let totalStock = 0;
    let totalAvailable = 0;
    let totalOrdered = 0;
    let totalPending = 0;
    sizes.forEach((sz) => {
      const c = row.cells.get(sz);
      if (!c || c.ordered <= 0) return;
      totalStock += c.stock;
      totalAvailable += c.available;
      totalOrdered += c.ordered;
      totalPending += c.pending;
    });
    return { ...row, totalStock, totalAvailable, totalOrdered, totalPending };
  });

  return {
    rows,
    sizes,
    grandAvailable: rows.reduce((s, r) => s + r.totalAvailable, 0),
    grandOrdered: rows.reduce((s, r) => s + r.totalOrdered, 0),
  };
}
