/** Shared Stock Report rules — same as `StockReport.tsx` (web). */

export const STOCK_REPORT_LOW_THRESHOLD = 10;

export type StockReportStatusFilter = "all" | "in" | "low" | "out";

export type WebStockReportTotals = {
  totalStock: number;
  stockValue: number;
  saleValue: number;
  variantCount: number;
};

export function parseStockReportTotalsPayload(data: unknown): WebStockReportTotals {
  const row = (Array.isArray(data) ? data[0] : data) as {
    total_stock?: number;
    stock_value?: number;
    sale_value?: number;
    variant_count?: number;
  } | null;
  return {
    totalStock: Number(row?.total_stock ?? 0),
    stockValue: Number(row?.stock_value ?? 0),
    saleValue: Number(row?.sale_value ?? 0),
    variantCount: Number(row?.variant_count ?? 0),
  };
}

/** Variant-level status used by web Stock Report filters. */
export function stockQtyStatus(
  qty: number,
  threshold = STOCK_REPORT_LOW_THRESHOLD,
): Exclude<StockReportStatusFilter, "all"> {
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "in";
}

/** Maps UI status chips to `get_stock_report` / `get_stock_report_filtered_totals` args. */
export function stockStatusToRpcArgs(
  status: StockReportStatusFilter,
  threshold = STOCK_REPORT_LOW_THRESHOLD,
) {
  return {
    p_in_stock: status === "in" ? true : null,
    p_low_stock: status === "out" ? true : null,
    p_low_stock_band: status === "low" ? true : null,
    p_low_stock_threshold: threshold,
  };
}

/**
 * Compact barcode vs name search for product-wise RPC (name ILIKE AND barcode ILIKE
 * would miss name-only hits). Digit-only tokens without spaces go to barcode.
 */
export function ownerStockSearchToRpc(query: string): { searchQuery: string; barcodeFilter: string } {
  const t = query.trim();
  if (!t) return { searchQuery: "", barcodeFilter: "" };
  const looksLikeBarcode = !/\s/.test(t) && /\d/.test(t) && t.length >= 4;
  if (looksLikeBarcode) return { searchQuery: "", barcodeFilter: t };
  return { searchQuery: t, barcodeFilter: "" };
}

export function productClosingFilterForStatus(
  status: StockReportStatusFilter,
): "all" | "in_stock" | "zero_stock" {
  if (status === "out") return "zero_stock";
  if (status === "in" || status === "low") return "in_stock";
  return "all";
}

/** After product-wise `in_stock` RPC, keep rows that match web threshold semantics. */
export function productRowMatchesStatus(
  totalQty: number,
  status: StockReportStatusFilter,
  threshold = STOCK_REPORT_LOW_THRESHOLD,
): boolean {
  if (status === "all") return true;
  return stockQtyStatus(totalQty, threshold) === status;
}
