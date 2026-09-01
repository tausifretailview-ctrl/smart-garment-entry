import { supabase } from "@/integrations/supabase/client";
import {
  parseStockReportTotalsPayload,
  stockStatusToRpcArgs,
  STOCK_REPORT_LOW_THRESHOLD,
  type StockReportStatusFilter,
  type WebStockReportTotals,
} from "@/utils/stockReportWebParity";

export type MobileStockReportRow = {
  variant_id: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  style: string | null;
  color: string | null;
  size: string | null;
  barcode: string | null;
  current_stock: number | null;
  opening_qty: number | null;
  purchase_qty: number | null;
  purchase_return_qty: number | null;
  sales_qty: number | null;
  sale_return_qty: number | null;
  sale_price: number | null;
  pur_price: number | null;
};

export type MobileStockReportStatus = "all" | "in_stock" | "zero_stock" | "low";

export type MobileStockReportFilterOpts = {
  search?: string;
  supplier?: string;
  brand?: string;
  category?: string;
  /** @deprecated use `status` — true = in stock, false = out of stock */
  inStock?: boolean;
  status?: StockReportStatusFilter;
};

function rpcBrand(value?: string) {
  return value?.trim() && value !== "__all__" ? value.trim() : null;
}

function statusFromFilterOpts(opts?: MobileStockReportFilterOpts): StockReportStatusFilter {
  if (opts?.status) return opts.status;
  if (opts?.inStock === true) return "in";
  if (opts?.inStock === false) return "out";
  return "all";
}

export async function fetchWebStockReportTotals(orgId: string): Promise<WebStockReportTotals> {
  const { data, error } = await supabase.rpc("get_stock_report_totals", {
    p_organization_id: orgId,
  });
  if (error) throw error;
  return parseStockReportTotalsPayload(data);
}

export async function fetchStockReportStatusVariantCounts(
  orgId: string,
  threshold = STOCK_REPORT_LOW_THRESHOLD,
) {
  const [inRes, lowRes, outRes] = await Promise.all([
    supabase.rpc("get_stock_report_filtered_totals", {
      p_org_id: orgId,
      ...stockStatusToRpcArgs("in", threshold),
    }),
    supabase.rpc("get_stock_report_filtered_totals", {
      p_org_id: orgId,
      ...stockStatusToRpcArgs("low", threshold),
    }),
    supabase.rpc("get_stock_report_filtered_totals", {
      p_org_id: orgId,
      ...stockStatusToRpcArgs("out", threshold),
    }),
  ]);
  if (inRes.error) throw inRes.error;
  if (lowRes.error) throw lowRes.error;
  if (outRes.error) throw outRes.error;
  return {
    inStock: parseStockReportTotalsPayload(inRes.data).variantCount,
    low: parseStockReportTotalsPayload(lowRes.data).variantCount,
    out: parseStockReportTotalsPayload(outRes.data).variantCount,
  };
}

export async function fetchMobileStockReportPages(
  orgId: string,
  opts?: MobileStockReportFilterOpts & {
    maxRows?: number;
    pageSize?: number;
  },
): Promise<MobileStockReportRow[]> {
  const pageSize = opts?.pageSize ?? 250;
  const maxRows = opts?.maxRows ?? 1500;
  const all: MobileStockReportRow[] = [];
  let offset = 0;
  const brand = rpcBrand(opts?.brand);
  const category = rpcBrand(opts?.category);
  const statusArgs = stockStatusToRpcArgs(statusFromFilterOpts(opts));

  while (offset < maxRows) {
    const { data, error } = await supabase.rpc("get_stock_report", {
      p_org_id: orgId,
      p_search: opts?.search?.trim() || null,
      p_supplier: opts?.supplier?.trim() || null,
      p_brand: brand,
      p_category: category,
      p_limit: Math.min(pageSize, maxRows - offset),
      p_offset: offset,
      ...statusArgs,
    });
    if (error) throw error;
    const rows = (data || []) as MobileStockReportRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

export async function fetchMobileStockFilteredTotals(
  orgId: string,
  opts: MobileStockReportFilterOpts,
) {
  const brand = rpcBrand(opts.brand);
  const category = rpcBrand(opts.category);
  const { data, error } = await supabase.rpc("get_stock_report_filtered_totals", {
    p_org_id: orgId,
    p_search: opts.search?.trim() || null,
    p_supplier: opts.supplier?.trim() || null,
    p_brand: brand,
    p_category: category,
    ...stockStatusToRpcArgs(statusFromFilterOpts(opts)),
  });
  if (error) throw error;
  const parsed = parseStockReportTotalsPayload(data);
  return {
    qty: parsed.totalStock,
    pur: parsed.stockValue,
    sale: parsed.saleValue,
    variants: parsed.variantCount,
  };
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const raw of values) {
    const name = (raw || "").trim();
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function fetchMobileStockSuppliers(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_stock_report_filter_options", {
    p_org_id: orgId,
  });
  if (error) throw error;
  const payload = data as { supplierPairs?: Array<{ supplier_name?: string | null }> } | null;
  return uniqueSorted((payload?.supplierPairs ?? []).map((p) => p.supplier_name));
}
