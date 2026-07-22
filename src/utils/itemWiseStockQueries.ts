import { supabase } from "@/integrations/supabase/client";

export const ITEM_WISE_STOCK_PAGE_SIZE = 100;

export type ItemWiseStockGroupBy =
  | "product_name"
  | "supplier"
  | "brand"
  | "category"
  | "department"
  | "barcode";

export type ItemWiseStockClosingFilter = "all" | "in_stock" | "zero_stock";

export type ItemWiseStockFilters = {
  groupBy: ItemWiseStockGroupBy;
  searchQuery: string;
  brandFilter: string;
  categoryFilter: string;
  departmentFilter: string;
  supplierFilter: string;
  barcodeFilter: string;
  closingStockFilter: ItemWiseStockClosingFilter;
};

export type ItemWiseStockRow = {
  product_id: string | null;
  key: string;
  total_qty: number;
  purchase_value: number;
  sale_value: number;
};

export type ItemWiseStockTotals = {
  total_qty: number;
  purchase_value: number;
  sale_value: number;
  group_count: number;
};

function normalizeFilter(value: string): string | null {
  if (!value || value === "__all__") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function buildRpcFilters(filters: ItemWiseStockFilters) {
  return {
    p_group_by: filters.groupBy,
    p_search: filters.searchQuery.trim() || null,
    p_brand: normalizeFilter(filters.brandFilter),
    p_category: normalizeFilter(filters.categoryFilter),
    p_department: normalizeFilter(filters.departmentFilter),
    p_supplier: normalizeFilter(filters.supplierFilter),
    p_barcode: filters.barcodeFilter.trim() || null,
    p_closing_stock: filters.closingStockFilter === "all" ? null : filters.closingStockFilter,
  };
}

export async function fetchItemWiseStockFilterOptions(organizationId: string) {
  const { data, error } = await (supabase.rpc as any)("get_product_wise_stock_filter_options", {
    p_org_id: organizationId,
  });
  if (error) throw error;

  const payload = (data ?? {}) as {
    brands?: string[];
    categories?: string[];
    departments?: string[];
    suppliers?: string[];
  };

  return {
    brands: payload.brands ?? [],
    categories: payload.categories ?? [],
    departments: payload.departments ?? [],
    suppliers: payload.suppliers ?? [],
  };
}

export async function fetchItemWiseStockPage(
  organizationId: string,
  filters: ItemWiseStockFilters,
  page: number,
  pageSize = ITEM_WISE_STOCK_PAGE_SIZE,
): Promise<{ rows: ItemWiseStockRow[]; totalCount: number }> {
  const offset = (page - 1) * pageSize;
  const { data, error } = await (supabase.rpc as any)("get_product_wise_stock_report", {
    p_org_id: organizationId,
    p_limit: pageSize,
    p_offset: offset,
    ...buildRpcFilters(filters),
  });
  if (error) throw error;

  const rawRows = (data ?? []) as Array<{
    product_id?: string | null;
    group_key?: string | null;
    total_stock?: number | null;
    purchase_value?: number | null;
    sale_value?: number | null;
    total_rows?: number | null;
  }>;

  const totalCount = Number(rawRows[0]?.total_rows ?? 0);
  let rows: ItemWiseStockRow[] = rawRows.map((row) => ({
    product_id: row.product_id ?? null,
    key: row.group_key ?? "Unknown",
    total_qty: Number(row.total_stock ?? 0),
    purchase_value: Number(row.purchase_value ?? 0),
    sale_value: Number(row.sale_value ?? 0),
  }));

  // Collapse brand spellings that differ only by case/spaces (same page).
  if (filters.groupBy === "brand") {
    const { normalizeBrand, canonicalizeProductBrand } = await import(
      "@/utils/productBrandUtils"
    );
    const merged = new Map<string, ItemWiseStockRow>();
    for (const row of rows) {
      const key = normalizeBrand(row.key) || row.key;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...row,
          key: canonicalizeProductBrand(row.key) || row.key,
        });
      } else {
        existing.total_qty += row.total_qty;
        existing.purchase_value += row.purchase_value;
        existing.sale_value += row.sale_value;
      }
    }
    rows = [...merged.values()].sort(
      (a, b) => b.total_qty - a.total_qty || a.key.localeCompare(b.key),
    );
  }

  return { rows, totalCount };
}

export async function fetchItemWiseStockTotals(
  organizationId: string,
  filters: ItemWiseStockFilters,
): Promise<ItemWiseStockTotals> {
  const { data, error } = await (supabase.rpc as any)("get_product_wise_stock_report_totals", {
    p_org_id: organizationId,
    ...buildRpcFilters(filters),
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as
    | {
        total_qty?: number | null;
        purchase_value?: number | null;
        sale_value?: number | null;
        group_count?: number | null;
      }
    | null
    | undefined;

  return {
    total_qty: Number(row?.total_qty ?? 0),
    purchase_value: Number(row?.purchase_value ?? 0),
    sale_value: Number(row?.sale_value ?? 0),
    group_count: Number(row?.group_count ?? 0),
  };
}

/** Export path — fetches all matching groups via paginated RPC. */
export async function fetchAllItemWiseStockRows(
  organizationId: string,
  filters: ItemWiseStockFilters,
): Promise<ItemWiseStockRow[]> {
  const all: ItemWiseStockRow[] = [];
  let page = 1;
  let totalCount = 0;

  while (true) {
    const { rows, totalCount: count } = await fetchItemWiseStockPage(
      organizationId,
      filters,
      page,
      ITEM_WISE_STOCK_PAGE_SIZE,
    );
    if (page === 1) totalCount = count;
    if (rows.length === 0) break;
    all.push(...rows);
    if (all.length >= totalCount) break;
    page += 1;
  }

  return all;
}
