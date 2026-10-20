/**
 * Offline POS billing — pure helpers (no browser storage, no Supabase).
 *
 * A counter that has "Offline billing" switched on keeps a copy of the item list
 * on the computer. When the internet drops, POS scans items from that copy and
 * saves cash / UPI / card bills on the computer with their own number series
 * (OFL-<counter>/<FY>/<n>). The bills are sent through the normal save once the
 * internet is back.
 */

/** Same columns POS reads for a scan, plus variant deleted_at for incremental refresh. */
export const OFFLINE_POS_CATALOG_SELECT =
  "id, barcode, size, color, stock_qty, sale_price, mrp, pur_price, product_id, active, deleted_at, last_purchase_sale_price, last_purchase_mrp, last_purchase_date, updated_at, is_dc_product, products!inner(id, product_name, brand, default_sale_price, hsn_code, gst_per, sale_gst_percent, purchase_gst_percent, category, style, color, product_type, organization_id, sale_discount_type, sale_discount_value, status, deleted_at, uom, requires_imei)";

export type OfflineCatalogProduct = {
  id: string;
  product_name: string;
  brand?: string | null;
  category?: string | null;
  style?: string | null;
  color?: string | null;
  hsn_code?: string | null;
  product_type?: string | null;
  status?: string | null;
  deleted_at?: string | null;
  [key: string]: unknown;
};

export type OfflineCatalogRow = {
  id: string;
  barcode?: string | null;
  size?: string | null;
  color?: string | null;
  stock_qty?: number | null;
  sale_price?: number | string | null;
  mrp?: number | string | null;
  product_id?: string;
  active?: boolean | null;
  deleted_at?: string | null;
  updated_at?: string | null;
  products: OfflineCatalogProduct;
  [key: string]: unknown;
};

export type OfflineCatalogIndex = {
  byId: Map<string, OfflineCatalogRow>;
  byBarcode: Map<string, OfflineCatalogRow[]>;
};

/** Row POS may sell: live variant of an active, not-deleted product. */
export function isSellableCatalogRow(row: OfflineCatalogRow | null | undefined): boolean {
  if (!row?.id || !row.products) return false;
  if (row.deleted_at) return false;
  if (row.active === false) return false;
  if (row.products.deleted_at) return false;
  if ((row.products.status || "active") !== "active") return false;
  return true;
}

/**
 * Apply a refresh to the saved list. Rows that were deleted or switched off are
 * dropped; everything else replaces the older copy of the same variant.
 */
export function mergeCatalogRows(
  existing: OfflineCatalogRow[],
  incoming: OfflineCatalogRow[],
): OfflineCatalogRow[] {
  const byId = new Map<string, OfflineCatalogRow>();
  for (const row of existing) byId.set(row.id, row);
  for (const row of incoming) {
    if (!row?.id) continue;
    if (isSellableCatalogRow(row)) byId.set(row.id, row);
    else byId.delete(row.id);
  }
  return [...byId.values()];
}

export function buildCatalogIndex(rows: OfflineCatalogRow[]): OfflineCatalogIndex {
  const byId = new Map<string, OfflineCatalogRow>();
  const byBarcode = new Map<string, OfflineCatalogRow[]>();
  for (const row of rows) {
    if (!isSellableCatalogRow(row)) continue;
    byId.set(row.id, row);
    const code = String(row.barcode || "").trim();
    if (!code) continue;
    const list = byBarcode.get(code);
    if (list) list.push(row);
    else byBarcode.set(code, [row]);
  }
  for (const list of byBarcode.values()) {
    list.sort((a, b) => (Number(b.stock_qty) || 0) - (Number(a.stock_qty) || 0));
  }
  return { byId, byBarcode };
}

/** Exact barcode matches, highest stock first (same order as the online POS scan). */
export function findCatalogRowsByBarcode(
  index: OfflineCatalogIndex,
  barcode: string,
): OfflineCatalogRow[] {
  const code = String(barcode || "").trim();
  if (!code) return [];
  return index.byBarcode.get(code) ?? [];
}

/**
 * Typed search for the POS dropdown: every word must appear in the item's name,
 * brand, category, style, colour, size, barcode or price.
 */
export function searchCatalogRows(
  rows: OfflineCatalogRow[],
  term: string,
  opts: { productType?: string; limit?: number } = {},
): OfflineCatalogRow[] {
  const words = String(term || "")
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (words.length === 0) return [];
  const limit = opts.limit ?? 100;
  const productType = opts.productType && opts.productType !== "all" ? opts.productType : null;
  const out: OfflineCatalogRow[] = [];
  for (const row of rows) {
    if (!isSellableCatalogRow(row)) continue;
    const p = row.products;
    if (productType && (p.product_type || "goods") !== productType) continue;
    const hay = [
      p.product_name,
      p.brand,
      p.category,
      p.style,
      p.hsn_code,
      row.color || p.color,
      row.size,
      row.barcode,
      row.sale_price != null ? String(Number(row.sale_price)) : "",
      row.mrp != null ? String(Number(row.mrp)) : "",
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (words.every((w) => hay.includes(w))) {
      out.push(row);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** Indian financial year label for a date, e.g. 2026-10-19 → "26-27", 2027-02-01 → "26-27". */
export function financialYearShort(date: Date): string {
  const y = date.getFullYear();
  const start = date.getMonth() >= 3 ? y : y - 1;
  const two = (n: number) => String(n % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

export const OFFLINE_SALE_NUMBER_PREFIX = "OFL-";

export function formatOfflineSaleNumber(counterCode: string, fy: string, n: number): string {
  return `${OFFLINE_SALE_NUMBER_PREFIX}${counterCode}/${fy}/${n}`;
}

export function isOfflineSaleNumber(saleNumber: string | null | undefined): boolean {
  return String(saleNumber || "").startsWith(OFFLINE_SALE_NUMBER_PREFIX);
}

/** Trailing bill counter of an offline number, or 0 when it is not one. */
export function offlineSaleNumberSeq(saleNumber: string | null | undefined): number {
  if (!isOfflineSaleNumber(saleNumber)) return 0;
  const m = String(saleNumber).match(/\/(\d+)$/);
  return m ? Number(m[1]) || 0 : 0;
}

/** No 0/O or 1/I so the code reads cleanly on a printed bill. */
const COUNTER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCounterCode(random: () => number = Math.random, length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += COUNTER_CODE_ALPHABET[Math.floor(random() * COUNTER_CODE_ALPHABET.length) % COUNTER_CODE_ALPHABET.length];
  }
  return code;
}

export function isValidCounterCode(code: string | null | undefined): boolean {
  return /^[A-Z2-9]{3,6}$/.test(String(code || ""));
}

/** Browser / Supabase errors that mean "no internet", not a rejected request. */
export function isNetworkFailure(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "string"
      ? err
      : String((err as { message?: unknown }).message ?? (err as { details?: unknown }).details ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|err_network|err_name_not_resolved|err_connection/i.test(
    msg,
  );
}

export type OfflineSaleCheckInput = {
  saleType: string;
  paymentMethod: string;
  netAmount: number;
  saleReturnAdjust?: number | null;
  creditApplied?: number | null;
  advanceApplied?: number | null;
  refundAmount?: number | null;
  pointsRedeemed?: number | null;
  pointsRedeemedAmount?: number | null;
  hasFinancer?: boolean;
  breakdown?: {
    totalPaid?: number;
    refundAmount?: number;
    issueCreditNote?: boolean;
    financeAmount?: number;
  } | null;
};

/**
 * Why this bill cannot be saved offline, or null when it can. Offline bills are
 * plain paid sales: anything that reads or changes a customer's account waits
 * for the internet.
 */
export function offlineSaleBlockReason(input: OfflineSaleCheckInput): string | null {
  const pos = (n: number | null | undefined) => (Number(n) || 0) > 0.005;
  if (input.saleType !== "pos") return "Only POS bills can be saved offline.";
  if (input.paymentMethod === "pay_later") return "Credit / Pay Later bills need the internet.";
  if (!["cash", "card", "upi", "multiple"].includes(input.paymentMethod)) {
    return "This payment type needs the internet.";
  }
  if ((Number(input.netAmount) || 0) < 0) return "Refund bills need the internet.";
  if (pos(input.saleReturnAdjust)) return "Sale return adjustment needs the internet.";
  if (pos(input.creditApplied)) return "Credit note adjustment needs the internet.";
  if (pos(input.advanceApplied)) return "Advance adjustment needs the internet.";
  if (pos(input.refundAmount) || pos(input.breakdown?.refundAmount) || input.breakdown?.issueCreditNote) {
    return "Refunds and credit notes need the internet.";
  }
  if (pos(input.pointsRedeemed) || pos(input.pointsRedeemedAmount)) {
    return "Points redemption needs the internet.";
  }
  if (input.hasFinancer || pos(input.breakdown?.financeAmount)) {
    return "Finance / EMI bills need the internet.";
  }
  if (input.paymentMethod === "multiple") {
    const paid = Number(input.breakdown?.totalPaid) || 0;
    // Same ₹1 tolerance as the online Mix save.
    if (paid + 0.99 < (Number(input.netAmount) || 0)) {
      return "Mix payment with a balance due needs the internet.";
    }
  }
  return null;
}

/** Quantity already sold offline per variant, so offline stock checks don't oversell. */
export function offlineSoldQtyByVariant(
  bills: Array<{ items: Array<{ variantId?: string | null; quantity?: number | null }> }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const bill of bills) {
    for (const item of bill.items || []) {
      if (!item.variantId) continue;
      out.set(item.variantId, (out.get(item.variantId) || 0) + (Number(item.quantity) || 0));
    }
  }
  return out;
}

/**
 * The server already has a bill with this number. It is the same bill (a sync
 * that finished but was not ticked off) when the total and bill time match.
 */
export function isSameSyncedBill(
  existing: { net_amount?: number | string | null; sale_date?: string | null },
  bill: { netAmount: number; saleDate: string },
): boolean {
  const sameAmount = Math.abs((Number(existing.net_amount) || 0) - (Number(bill.netAmount) || 0)) < 0.01;
  const a = Date.parse(String(existing.sale_date || ""));
  const b = Date.parse(String(bill.saleDate || ""));
  const sameTime = Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1000;
  return sameAmount && sameTime;
}
