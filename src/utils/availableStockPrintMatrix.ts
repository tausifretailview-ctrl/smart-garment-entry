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
 * Article × size pick-list matrix: available = Size-wise Stock on-hand (stock_qty).
 * Columns include every size that has on-hand or ordered qty for products on the order
 * (full size-wise stock for that article/colour, not only ordered sizes).
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
      const cur = row.cells.get(sz) || emptyCell();
      cur.stock = Number(s.qty) || 0;
      row.cells.set(sz, cur);
    });
  });

  const rows = Array.from(map.values()).map((row) => {
    let totalStock = 0;
    let totalAvailable = 0;
    let totalOrdered = 0;
    let totalPending = 0;
    row.cells.forEach((c) => {
      // On-hand from Size-wise Stock — do not cap at order qty.
      c.available = c.stock;
      totalStock += c.stock;
      totalAvailable += c.available;
      totalOrdered += c.ordered;
      totalPending += c.pending;
    });
    return { ...row, totalStock, totalAvailable, totalOrdered, totalPending };
  });

  const sizeSet = new Set<string>();
  rows.forEach((r) => {
    r.cells.forEach((c, sz) => {
      if (c.ordered > 0 || c.stock > 0) sizeSet.add(sz);
    });
  });

  return {
    rows,
    sizes: sortSizes(Array.from(sizeSet)),
    grandAvailable: rows.reduce((s, r) => s + r.totalAvailable, 0),
    grandOrdered: rows.reduce((s, r) => s + r.totalOrdered, 0),
  };
}
