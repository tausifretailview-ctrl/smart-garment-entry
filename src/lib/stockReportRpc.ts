/**
 * Shared Stock Report data helpers — used by Stock Report and Stock Summary so both
 * pages call the same RPCs with the same filter mapping and show identical figures.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SupplierPair {
  supplier_name: string | null;
  supplier_invoice_no: string | null;
}

export interface PurchaseSourceInfo {
  supplier_name: string;
  supplier_invoice_no: string;
}

export interface PurchaseSourceRow {
  sku_id: string | null;
  created_at: string | null;
  purchase_bills:
    | {
        supplier_name: string | null;
        supplier_invoice_no: string | null;
        software_bill_no: string | null;
        bill_date: string | null;
        created_at: string | null;
      }
    | Array<{
        supplier_name: string | null;
        supplier_invoice_no: string | null;
        software_bill_no: string | null;
        bill_date: string | null;
        created_at: string | null;
      }>
    | null;
}

export interface StockReportRpcRow {
  variant_id: string;
  product_name: string | null;
  brand: string | null;
  category: string | null;
  style: string | null;
  product_type: string | null;
  uom: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  sale_price: number | null;
  pur_price: number | null;
  opening_qty: number | null;
  current_stock: number | null;
  purchase_qty: number | null;
  sales_qty: number | null;
  purchase_return_qty: number | null;
  sale_return_qty: number | null;
  total_rows: number | null;
}

export function getPurchaseBillFromSourceRow(row: PurchaseSourceRow) {
  return Array.isArray(row.purchase_bills)
    ? row.purchase_bills[0]
    : row.purchase_bills;
}

export function purchaseSourceSortTime(row: PurchaseSourceRow): number {
  const bill = getPurchaseBillFromSourceRow(row);
  const value = bill?.bill_date || bill?.created_at || row.created_at || "";
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

export function normFilterText(value: string | null | undefined): string {
  return (value || "").trim().replace(/\s+/g, " ");
}

export function filterTextEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  return normFilterText(a).toLowerCase() === normFilterText(b).toLowerCase();
}

/** Prefer one display label per case/space-insensitive key. */
export function uniqueNormSorted(values: Array<string | null | undefined>): string[] {
  const byKey = new Map<string, string>();
  for (const raw of values) {
    const cleaned = normFilterText(raw);
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    const prev = byKey.get(key);
    if (
      !prev ||
      cleaned.length > prev.length ||
      (cleaned === cleaned.toUpperCase() && prev !== prev.toUpperCase())
    ) {
      byKey.set(key, cleaned);
    }
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}

export async function fetchLatestPurchaseSourceByVariantId(
  organizationId: string,
  variantIds: string[],
): Promise<Map<string, PurchaseSourceInfo>> {
  const result = new Map<string, PurchaseSourceInfo>();
  const uniqueIds = [...new Set(variantIds.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  // Smaller batches + no global row cap so every variant gets a supplier attach
  // (old .limit(1000) dropped later variants when each had many purchase lines).
  for (let i = 0; i < uniqueIds.length; i += 40) {
    const batch = uniqueIds.slice(i, i + 40);
    const { data, error } = await supabase
      .from("purchase_items")
      .select(`
        sku_id,
        created_at,
        purchase_bills!inner (
          supplier_name,
          supplier_invoice_no,
          software_bill_no,
          bill_date,
          created_at,
          organization_id,
          deleted_at
        )
      `)
      .in("sku_id", batch)
      .is("deleted_at", null)
      .eq("purchase_bills.organization_id", organizationId)
      .is("purchase_bills.deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = ((data || []) as unknown as PurchaseSourceRow[])
      .filter((row) => row.sku_id)
      .sort((a, b) => purchaseSourceSortTime(b) - purchaseSourceSortTime(a));

    for (const row of rows) {
      const variantId = row.sku_id;
      if (!variantId || result.has(variantId)) continue;
      const bill = getPurchaseBillFromSourceRow(row);
      if (!bill) continue;

      result.set(variantId, {
        supplier_name: normFilterText(bill.supplier_name),
        supplier_invoice_no: normFilterText(
          bill.supplier_invoice_no || bill.software_bill_no || "",
        ),
      });
    }
  }

  return result;
}

export function buildStockReportRpcProductName(
  productNameFilter: string,
  pinnedProducts: Array<{ product_name: string }>,
): string | null {
  const name = productNameFilter.trim();
  if (name) return name;
  if (pinnedProducts.length === 1) return pinnedProducts[0].product_name;
  return null;
}

export type StockReportRpcFilterInput = {
  orgId: string;
  searchTerm: string;
  categoryFilter: string;
  brandFilter: string;
  stockStatusFilter: string;
  lowStockThreshold: number;
  departmentFilter: string;
  sizeFilter: string;
  colorFilter: string;
  productNameFilter: string;
  pinnedProducts: Array<{ product_name: string }>;
  supplierFilter: string;
  supplierInvoiceFilter: string;
};

export function buildStockReportRpcFilters(input: StockReportRpcFilterInput) {
  return {
    p_org_id: input.orgId,
    p_search: input.searchTerm.trim() || null,
    p_category: input.categoryFilter !== "all" ? input.categoryFilter : null,
    p_brand: input.brandFilter !== "all" ? input.brandFilter : null,
    p_low_stock: input.stockStatusFilter === "out" ? true : null,
    p_in_stock: input.stockStatusFilter === "in" ? true : null,
    p_low_stock_band: input.stockStatusFilter === "low" ? true : null,
    p_low_stock_threshold: input.lowStockThreshold,
    p_style: input.departmentFilter !== "all" ? input.departmentFilter : null,
    p_size: input.sizeFilter !== "all" ? input.sizeFilter : null,
    p_color: input.colorFilter !== "all" ? input.colorFilter : null,
    p_product_name: buildStockReportRpcProductName(input.productNameFilter, input.pinnedProducts),
    p_supplier: input.supplierFilter !== "all" ? input.supplierFilter : null,
    p_supplier_invoice: input.supplierInvoiceFilter !== "all" ? input.supplierInvoiceFilter : null,
  };
}

export function buildStockReportFilterOptions(payload: {
  rawProducts: Array<{ id: string; product_name: string; brand: string; category: string; style: string }>;
  variantRows: Array<{ product_id: string; size: string | null; color: string | null }>;
  supplierPairs: SupplierPair[];
}) {
  const allProducts = payload.rawProducts;
  const allVariants = payload.variantRows;
  const batchData = payload.supplierPairs;

  const variantsByProductId: Record<string, { sizes: string[]; colors: string[] }> = {};
  allVariants.forEach((v) => {
    if (!v.product_id) return;
    if (!variantsByProductId[v.product_id]) {
      variantsByProductId[v.product_id] = { sizes: [], colors: [] };
    }
    const entry = variantsByProductId[v.product_id];
    if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
    if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
  });

  return {
    brands: uniqueNormSorted(allProducts.map((p) => p.brand)),
    categories: uniqueNormSorted(allProducts.map((p) => p.category)),
    departments: uniqueNormSorted(allProducts.map((p) => p.style)),
    sizes: [...new Set(allVariants.map((v) => v.size).filter(Boolean))].sort() as string[],
    colors: [...new Set(allVariants.map((v) => v.color).filter(Boolean))].sort() as string[],
    suppliers: uniqueNormSorted(batchData.map((b) => b.supplier_name)),
    supplierInvoices: uniqueNormSorted(batchData.map((b) => b.supplier_invoice_no)),
    supplierPairs: batchData.map((b) => ({
      supplier_name: normFilterText(b.supplier_name) || null,
      supplier_invoice_no: normFilterText(b.supplier_invoice_no) || null,
    })),
    productNames: uniqueNormSorted(allProducts.map((p) => p.product_name)),
    rawProducts: allProducts,
    variantRows: allVariants,
    variantsByProductId,
  };
}

export interface StockReportFilterSelections {
  productNameFilter: string;
  brandFilter: string;
  categoryFilter: string;
  departmentFilter: string;
  sizeFilter: string;
  colorFilter: string;
  supplierFilter: string;
  supplierInvoiceFilter: string;
}

/** Cascading dropdown options: each field lists only values that fit the other picks. */
export function deriveStockReportFilterOptions(
  filterOptions: Pick<ReturnType<typeof buildStockReportFilterOptions>, "rawProducts" | "variantRows" | "supplierPairs">,
  selections: StockReportFilterSelections,
) {
  const {
    productNameFilter,
    brandFilter,
    categoryFilter,
    departmentFilter,
    sizeFilter,
    colorFilter,
    supplierFilter,
    supplierInvoiceFilter,
  } = selections;
  const getCandidates = (excludeField?: "product_name" | "brand" | "category" | "style" | "size" | "color") => {
    const productMatches = filterOptions.rawProducts.filter((p) => {
      if (excludeField !== "product_name" && productNameFilter && p.product_name !== productNameFilter) return false;
      if (excludeField !== "brand" && brandFilter !== "all" && p.brand !== brandFilter) return false;
      if (excludeField !== "category" && categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (excludeField !== "style" && departmentFilter !== "all" && p.style !== departmentFilter) return false;
      return true;
    });

    const productIdSet = new Set(productMatches.map((p) => p.id));

    const hasSizeConstraint = excludeField !== "size" && sizeFilter !== "all";
    const hasColorConstraint = excludeField !== "color" && colorFilter !== "all";
    if (!hasSizeConstraint && !hasColorConstraint) return productMatches;

    const variantQualifiedProductIds = new Set<string>();
    filterOptions.variantRows.forEach((v) => {
      if (!v.product_id || !productIdSet.has(v.product_id)) return;
      if (hasSizeConstraint && v.size !== sizeFilter) return;
      if (hasColorConstraint && v.color !== colorFilter) return;
      variantQualifiedProductIds.add(v.product_id);
    });

    return productMatches.filter((p) => variantQualifiedProductIds.has(p.id));
  };

  const productCandidates = getCandidates("product_name");
  const brandCandidates = getCandidates("brand");
  const categoryCandidates = getCandidates("category");
  const departmentCandidates = getCandidates("style");
  const sizeColorCandidates = getCandidates();

  const validProductIds = new Set(sizeColorCandidates.map((p) => p.id));
  const matchingSizes = new Set<string>();
  const matchingColors = new Set<string>();
  filterOptions.variantRows.forEach((v) => {
    if (!v.product_id || !validProductIds.has(v.product_id)) return;
    if (v.size) matchingSizes.add(v.size);
    if (v.color) matchingColors.add(v.color);
  });

  // Supplier/supplier-invoice interlink
  const candidateSupplierPairs = filterOptions.supplierPairs.filter((pair) => {
    const name = pair.supplier_name || "";
    const invoice = pair.supplier_invoice_no || "";
    if (supplierFilter !== "all" && !filterTextEquals(name, supplierFilter)) return false;
    if (supplierInvoiceFilter !== "all" && !filterTextEquals(invoice, supplierInvoiceFilter)) return false;
    return true;
  });
  const supplierOptions = uniqueNormSorted(
    candidateSupplierPairs.map((p) => p.supplier_name),
  );
  const supplierInvoiceOptions = uniqueNormSorted(
    candidateSupplierPairs.map((p) => p.supplier_invoice_no),
  );

  return {
    productNames: [...new Set(productCandidates.map((p) => p.product_name).filter(Boolean))].sort(),
    brands: [...new Set(brandCandidates.map((p) => p.brand).filter(Boolean))].sort(),
    categories: [...new Set(categoryCandidates.map((p) => p.category).filter(Boolean))].sort(),
    departments: [...new Set(departmentCandidates.map((p) => p.style).filter(Boolean))].sort(),
    sizes: [...matchingSizes].sort(),
    colors: [...matchingColors].sort(),
    suppliers: supplierOptions,
    supplierInvoices: supplierInvoiceOptions,
  };
}
