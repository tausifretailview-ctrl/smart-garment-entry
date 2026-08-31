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

export async function fetchMobileStockReportPages(
  orgId: string,
  opts?: { search?: string; supplier?: string; maxRows?: number; pageSize?: number },
): Promise<MobileStockReportRow[]> {
  const pageSize = opts?.pageSize ?? 250;
  const maxRows = opts?.maxRows ?? 1500;
  const all: MobileStockReportRow[] = [];
  let offset = 0;

  while (offset < maxRows) {
    const { data, error } = await supabase.rpc("get_stock_report", {
      p_org_id: orgId,
      p_search: opts?.search?.trim() || null,
      p_supplier: opts?.supplier?.trim() || null,
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

export async function fetchMobileStockSuppliers(orgId: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_stock_report_filter_options", {
    p_org_id: orgId,
  });
  if (error) throw error;
  const payload = data as { supplierPairs?: Array<{ supplier_name?: string | null }> } | null;
  const names = new Set<string>();
  for (const pair of payload?.supplierPairs ?? []) {
    const name = (pair.supplier_name || "").trim();
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}
