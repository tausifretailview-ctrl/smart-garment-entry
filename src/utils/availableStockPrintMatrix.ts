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

// ── Pick-list pages (A4 landscape) ──────────────────────────────────────────
// Rows used to be cut at a fixed 14 per page. Article names that wrap to two lines
// ("MR50 – BK (A WALK - IN,BLUE)") made 14 rows taller than the page: the last row ran onto a
// new sheet, then the page break left that sheet nearly blank (KS FOOTWEAR, Nov 2026).
// Heights below were measured in Chrome print layout (mm, A4 landscape, 6mm padding).

/** Article / Colour text as printed in the row. */
export function pickListArticleText(row: Pick<AvailableStockMatrixRow, "productName" | "color" | "brand" | "style">): string {
  const details = [row.brand, row.style].filter(Boolean).join(" · ");
  return `${row.productName}${row.color ? ` – ${row.color}` : ""}${details ? ` (${details})` : ""}`;
}

/** Characters per line in the Article column (≈20–21 measured with word wrap; lower = safer). */
const PICK_LIST_CHARS_PER_LINE = 19;

/** Printed height of one row in mm: 7.6 for one line, then ≈4 mm per extra line. */
export function estimatePickListRowHeightMm(articleText: string): number {
  const lines = Math.max(1, Math.ceil(String(articleText || "").trim().length / PICK_LIST_CHARS_PER_LINE));
  return lines === 1 ? 7.6 : 2.8 + 4 * lines;
}

export const PICK_LIST_PAGE_BUDGET_MM = {
  /** 198mm inside the padding − full header and customer strip (~62) − table head (10) − "continued" (5) − safety (6). */
  first: 115,
  /** 198mm − slim header (14) − table head (10) − "continued" (5) − safety (6). */
  next: 163,
  /** The last page has no "continued" line but a totals row and the note: ≈18mm more. */
  lastExtra: 18,
};

/**
 * Split rows into pages that fit: as many rows as their heights allow, and the last page also
 * keeps room for the totals row and note (moving rows to a new page when it does not).
 */
export function paginateByHeight<T>(
  rows: T[],
  heightMm: (row: T) => number,
  budget: { first: number; next: number; lastExtra: number } = PICK_LIST_PAGE_BUDGET_MM,
): T[][] {
  if (rows.length === 0) return [[]];
  const pages: T[][] = [];
  let page: T[] = [];
  let used = 0;
  const cap = () => (pages.length === 0 ? budget.first : budget.next);
  for (const row of rows) {
    const h = heightMm(row);
    if (page.length > 0 && used + h > cap()) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(row);
    used += h;
  }
  // Room for totals + note on the last page; otherwise move its last rows to one more page.
  const lastCap = cap() - budget.lastExtra;
  const moved: T[] = [];
  while (page.length > 1 && used > lastCap) {
    const row = page.pop()!;
    used -= heightMm(row);
    moved.unshift(row);
  }
  pages.push(page);
  if (moved.length > 0) pages.push(moved);
  return pages;
}
