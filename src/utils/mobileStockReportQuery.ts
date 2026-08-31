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

export type MobileStockReportStatus = "all" | "in_stock" | "zero_stock";

export async function fetchMobileStockReportPages(
  orgId: string,
  opts?: {
    search?: string;
    supplier?: string;
    brand?: string;
    category?: string;
    inStock?: boolean;
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
  const inStock = opts?.inStock === true ? true : null;
  const outOfStock = opts?.inStock === false ? true : null;

  while (offset < maxRows) {
    const { data, error } = await supabase.rpc("get_stock_report", {
      p_org_id: orgId,
      p_search: opts?.search?.trim() || null,
      p_supplier: opts?.supplier?.trim() || null,
      p_brand: brand,
      p_category: category,
      p_in_stock: inStock,
      p_low_stock: outOfStock,
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

export async function fetchMobileStockFilteredTotals(
  orgId: string,
  opts: {
    search?: string;
    supplier?: string;
    brand?: string;
    category?: string;
    inStock?: boolean;
  },
) {
  const brand = opts.brand?.trim() && opts.brand !== "__all__" ? opts.brand.trim() : null;
  const category = opts.category?.trim() && opts.category !== "__all__" ? opts.category.trim() : null;
  const { data, error } = await supabase.rpc("get_stock_report_filtered_totals", {
    p_org_id: orgId,
    p_search: opts.search?.trim() || null,
    p_supplier: opts.supplier?.trim() || null,
    p_brand: brand,
    p_category: category,
    p_in_stock: opts.inStock === true ? true : null,
    p_low_stock: opts.inStock === false ? true : null,
    p_low_stock_threshold: 10,
  });
  if (error) throw error;
  const row = data as { total_stock?: number; stock_value?: number; sale_value?: number; variant_count?: number } | null;
  return {
    qty: Number(row?.total_stock ?? 0),
    pur: Number(row?.stock_value ?? 0),
    sale: Number(row?.sale_value ?? 0),
    variants: Number(row?.variant_count ?? 0),
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
