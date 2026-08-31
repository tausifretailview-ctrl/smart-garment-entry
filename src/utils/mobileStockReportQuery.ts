import { supabase } from "@/integrations/supabase/client";

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

export type MobileStockReportStatus = "all" | "in" | "low" | "out";

export function stockStatusToRpcArgs(status: MobileStockReportStatus | string | undefined) {
  return {
    p_in_stock: status === "in" ? true : null,
    p_low_stock: status === "out" ? true : null,
    p_low_stock_band: status === "low" ? true : null,
  };
}

export type MobileStockFilterOptions = {
  brands: string[];
  categories: string[];
  suppliers: string[];
};

export async function fetchMobileStockReportPages(
  orgId: string,
  opts?: {
    search?: string;
    supplier?: string;
    brand?: string;
    category?: string;
    stockStatus?: MobileStockReportStatus | string;
    maxRows?: number;
    pageSize?: number;
  },
): Promise<MobileStockReportRow[]> {
  const pageSize = opts?.pageSize ?? 250;
  const maxRows = opts?.maxRows ?? 1500;
  const all: MobileStockReportRow[] = [];
  let offset = 0;
  const brand = opts?.brand?.trim() && opts.brand !== "__all__" ? opts.brand.trim() : null;
  const category = opts?.category?.trim() && opts.category !== "__all__" ? opts.category.trim() : null;
  const stockArgs = stockStatusToRpcArgs(opts?.stockStatus);

  while (offset < maxRows) {
    const { data, error } = await supabase.rpc("get_stock_report", {
      p_org_id: orgId,
      p_search: opts?.search?.trim() || null,
      p_supplier: opts?.supplier?.trim() || null,
      p_brand: brand,
      p_category: category,
      ...stockArgs,
      p_limit: Math.min(pageSize, maxRows - offset),
      p_offset: offset,
      p_low_stock_threshold: 10,
    });
    if (error) throw error;
    const rows = (data || []) as MobileStockReportRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return all;
}

function uniqueSorted(values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const raw of values) {
    const name = (raw || "").trim();
    if (name) set.add(name);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function fetchMobileStockFilterOptions(orgId: string): Promise<MobileStockFilterOptions> {
  const { data, error } = await supabase.rpc("get_stock_report_filter_options", {
    p_org_id: orgId,
  });
  if (error) throw error;
  const payload = data as {
    rawProducts?: Array<{ brand?: string | null; category?: string | null }>;
    supplierPairs?: Array<{ supplier_name?: string | null }>;
  } | null;
  return {
    brands: uniqueSorted((payload?.rawProducts ?? []).map((p) => p.brand)),
    categories: uniqueSorted((payload?.rawProducts ?? []).map((p) => p.category)),
    suppliers: uniqueSorted((payload?.supplierPairs ?? []).map((p) => p.supplier_name)),
  };
}

export async function fetchMobileStockSuppliers(orgId: string): Promise<string[]> {
  const opts = await fetchMobileStockFilterOptions(orgId);
  return opts.suppliers;
}
