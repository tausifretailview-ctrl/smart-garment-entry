import { useEffect, useState, useMemo, useCallback, useRef, type ReactNode } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Package, Search, Filter, ChevronDown, ChevronUp, Grid3X3, IndianRupee, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Printer, ArrowLeft } from "lucide-react";
import type { ReportKpiItem } from "@/components/reports/ReportKpiCards";
import { useIsMobile } from "@/hooks/use-mobile";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useProductFieldLabels } from "@/hooks/useSettings";
import { ProductSearchDropdown } from "@/components/ProductSearchDropdown";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MetricCardSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { toast } from "sonner";
import { sortSizes } from "@/utils/sizeSort";
import { multiTokenMatch } from "@/utils/multiTokenSearch";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import {
  isDashboardFilterRestoring,
  restoreDashboardFilters,
  WINDOW_FILTER_IDS,
} from "@/lib/dashboardFilterPersistence";

interface StockItem {
  id: string;
  product_name: string;
  brand: string;
  color: string;
  size: string;
  stock_qty: number;
  opening_qty: number;
  purchase_qty: number;
  purchase_return_qty: number;
  sales_qty: number;
  sale_return_qty: number;
  sale_price: number;
  pur_price: number | null;
  barcode: string;
  supplier_name: string;
  supplier_invoice_no: string;
  category: string;
  department: string;
  uom: string;
}

interface SupplierPair {
  supplier_name: string | null;
  supplier_invoice_no: string | null;
}

interface StockReportRpcRow {
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
  current_stock: number | null;
  purchase_qty: number | null;
  sales_qty: number | null;
  purchase_return_qty: number | null;
  sale_return_qty: number | null;
  total_rows: number | null;
}

function buildStockReportRpcSearch(
  searchTerm: string,
  productNameFilter: string,
  pinnedProducts: Array<{ product_name: string }>,
): string | null {
  const term = searchTerm.trim();
  if (term) return term;
  const name = productNameFilter.trim();
  if (name) return name;
  if (pinnedProducts.length > 0) return pinnedProducts[0].product_name;
  return null;
}


interface SizeWiseRow {
  productKey: string;
  productName: string;
  brand: string;
  color: string;
  category: string;
  department: string;
  sizeStocks: Record<string, number>;
  totalStock: number;
}

/** Override ui/table defaults (bg-black + text-white on thead/th) for light report headers */
const STOCK_TABLE_HEAD =
  "sticky top-0 z-20 !bg-slate-800 [&_tr]:!bg-slate-800 [&_tr]:border-none [&_tr]:hover:!bg-slate-800";
const STOCK_NEUTRAL_TH =
  "text-xs font-bold uppercase tracking-wide whitespace-nowrap bg-slate-800 text-white px-3 py-2.5 h-10 shadow-none border-none";
/** Single vertical scroll — header sticky top, footer sticky bottom inside this box */
const STOCK_TABLE_SCROLL =
  "flex-1 min-h-0 overflow-auto overscroll-contain min-w-0";
const STOCK_TABLE_FOOTER =
  "sticky bottom-0 z-20 border-t-2 border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-700 shadow-[0_-4px_8px_-2px_rgba(0,0,0,0.12)] [&>tr]:border-0 [&>tr]:hover:bg-transparent";
const STOCK_FOOTER_CELL = "py-1 px-2 align-middle text-sm font-bold tabular-nums whitespace-nowrap";
const STOCK_DATA_CELL = "py-1 px-2 align-middle text-sm whitespace-nowrap tabular-nums text-foreground";
const STOCK_DATA_CELL_CENTER = "py-1 px-2 align-middle text-sm text-center tabular-nums";
const STOCK_PRODUCT_NAME_CELL =
  "py-1 px-2 align-middle text-base whitespace-nowrap font-bold text-foreground bg-blue-50/40 dark:bg-blue-950/20";
const STOCK_PRODUCT_DETAIL_CELL = "py-1 px-2 align-middle text-sm whitespace-nowrap font-semibold text-foreground";
const STOCK_QTY_HIGHLIGHT_CELL =
  "py-1 px-2 align-middle text-base font-bold text-right tabular-nums bg-violet-50/90 dark:bg-violet-950/50 text-violet-900 dark:text-violet-200";
const SIZEWISE_DATA_CELL =
  "text-center min-w-[44px] md:min-w-[52px] px-1.5 py-1 align-middle text-sm font-semibold tabular-nums";
const SIZEWISE_FOOTER_CELL =
  "text-center min-w-[44px] md:min-w-[52px] px-1.5 py-1 align-middle text-sm font-bold tabular-nums";

/** Highlight search term inside product/barcode cells */
function highlightSearchText(text: string, query: string): ReactNode {
  const raw = text || "";
  const q = query.trim();
  if (!q || !raw) return raw || "—";

  const lower = raw.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return raw;

  return (
    <>
      {raw.slice(0, idx)}
      <mark className="bg-amber-300/90 text-foreground font-bold px-0.5 rounded-sm not-italic">
        {raw.slice(idx, idx + q.length)}
      </mark>
      {raw.slice(idx + q.length)}
    </>
  );
}

function stockItemMatchesSearch(item: StockItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return [
    item.product_name,
    item.brand,
    item.barcode,
    item.size,
    item.color,
    item.department,
    item.supplier_name,
  ].some((field) => field?.toLowerCase().includes(q));
}

export default function StockReport() {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const fieldLabels = useProductFieldLabels();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);
  
  // Global totals for default cards (loaded on mount)
  const [globalTotals, setGlobalTotals] = useState({
    totalStock: 0,
    stockValue: 0,
    saleValue: 0,
    variantCount: 0,
    isLoading: true
  });
  const [lowStockThreshold, setLowStockThreshold] = useState(10);
  const [searchTerm, setSearchTerm] = useState("");
  const [productNameFilter, setProductNameFilter] = useState("");
  const [sizeWiseSearch, setSizeWiseSearch] = useState("");
  const [sizeFilter, setSizeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get("tab");
    return tabParam === "sizewise" ? "sizewise" : "all";
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [supplierInvoiceFilter, setSupplierInvoiceFilter] = useState<string>("all");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("all");
  const [colorFilter, setColorFilter] = useState<string>("all");
  const [oldBarcodeVariantMap, setOldBarcodeVariantMap] = useState<Map<string, string>>(new Map());
  const [pinnedProducts, setPinnedProducts] = useState<Array<{ id: string; product_name: string; brand: string; category: string; style: string }>>([]); 
  
  // Cached filter options from last search
  const [filterOptions, setFilterOptions] = useState({
    brands: [] as string[],
    departments: [] as string[],
    sizes: [] as string[],
    categories: [] as string[],
    colors: [] as string[],
    suppliers: [] as string[],
    supplierInvoices: [] as string[],
    supplierPairs: [] as SupplierPair[],
    productNames: [] as string[],
    rawProducts: [] as Array<{ id: string; product_name: string; brand: string; category: string; style: string }>,
    variantRows: [] as Array<{ product_id: string; size: string | null; color: string | null }>,
    variantsByProductId: {} as Record<string, { sizes: string[]; colors: string[] }>,
  });
  
  // Pagination for All Stock tab (server-side via get_stock_report)
  const [currentPage, setCurrentPage] = useState(1);
  const [serverTotalRows, setServerTotalRows] = useState(0);
  const ITEMS_PER_PAGE = 100;
  const searchRequestIdRef = useRef(0);

  const stockFilterSnapshot = useMemo(
    () => ({
      searchTerm,
      productNameFilter,
      sizeWiseSearch,
      sizeFilter,
      categoryFilter,
      activeTab: searchParams.get("tab") ? undefined : activeTab,
      brandFilter,
      departmentFilter,
      supplierFilter,
      supplierInvoiceFilter,
      stockStatusFilter,
      colorFilter,
      lowStockThreshold,
      currentPage,
    }),
    [
      searchTerm,
      productNameFilter,
      sizeWiseSearch,
      sizeFilter,
      categoryFilter,
      activeTab,
      searchParams,
      brandFilter,
      departmentFilter,
      supplierFilter,
      supplierInvoiceFilter,
      stockStatusFilter,
      colorFilter,
      lowStockThreshold,
      currentPage,
    ],
  );

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.stockReport,
    currentOrganization?.id,
    stockFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchTerm", setSearchTerm],
          ["productNameFilter", setProductNameFilter],
          ["sizeWiseSearch", setSizeWiseSearch],
          ["sizeFilter", setSizeFilter],
          ["categoryFilter", setCategoryFilter],
          ["brandFilter", setBrandFilter],
          ["departmentFilter", setDepartmentFilter],
          ["supplierFilter", setSupplierFilter],
          ["supplierInvoiceFilter", setSupplierInvoiceFilter],
          ["stockStatusFilter", setStockStatusFilter],
          ["colorFilter", setColorFilter],
          ...(!searchParams.get("tab") ? [["activeTab", setActiveTab] as [string, (v: string) => void]] : []),
        ],
        numbers: [
          ["lowStockThreshold", setLowStockThreshold],
          ["currentPage", setCurrentPage],
        ],
      });
    },
  );

  // Global keyboard shortcut for Ctrl+G
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        setActiveTab("sizewise");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Tab-return stable: never refetch on focus/mount/reconnect; keep previous rows while any
  // background refetch is in flight so switching browser/ERP tabs never flashes a skeleton.
  const REPORT_CACHE = {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false as const,
    refetchOnMount: false as const,
    refetchOnReconnect: false as const,
    placeholderData: keepPreviousData,
  };

  // Org-wide summary cards — single RPC aggregate, cached 5 min, non-blocking
  const { data: cachedGlobalTotals, isLoading: globalTotalsQueryLoading } = useQuery({
    queryKey: ["stock-report-global-totals", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase.rpc("get_stock_report_totals", {
        p_organization_id: currentOrganization.id,
      });

      if (error) throw error;

      const row = data as {
        total_stock?: number;
        stock_value?: number;
        sale_value?: number;
        variant_count?: number;
      } | null;

      return {
        totalStock: row?.total_stock ?? 0,
        stockValue: Number(row?.stock_value ?? 0),
        saleValue: Number(row?.sale_value ?? 0),
        variantCount: row?.variant_count ?? 0,
      };
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Paginated fetch helper to bypass 1000-row PostgREST default
  // Uses a factory pattern — each page gets a fresh query builder so .range() works correctly
  const fetchAllPages = async (queryFactory: () => any) => {
    const PAGE_SIZE = 1000;
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data: page } = await queryFactory().range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      all = [...all, ...page];
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return all;
  };

  // Fetch filter options with useQuery for caching
  const { data: cachedFilterOptions } = useQuery({
    queryKey: ["stock-report-filter-options", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      // Paginate products, variants, and batch_stock in parallel
      const [allProducts, allVariants, batchData] = await Promise.all([
        fetchAllPages(
          () => supabase.from("products").select("id, product_name, brand, category, style").eq("organization_id", currentOrganization.id).is("deleted_at", null).neq("product_type", "service").order("product_name")
        ),
        fetchAllPages(
          () => supabase.from("product_variants").select("product_id, size, color").eq("organization_id", currentOrganization.id).eq("active", true).is("deleted_at", null)
        ),
        fetchAllPages(
          // Query purchase_bills directly (small table) instead of batch_stock (huge),
          // since we only need the unique supplier names and invoice numbers for filters.
          () => supabase.from("purchase_bills").select("supplier_name, supplier_invoice_no").eq("organization_id", currentOrganization.id).is("deleted_at", null)
        ),
      ]);

      // Build variants-by-product map for cascading filters
      const variantsByProductId: Record<string, { sizes: string[]; colors: string[] }> = {};
      allVariants.forEach((v: any) => {
        if (!v.product_id) return;
        if (!variantsByProductId[v.product_id]) {
          variantsByProductId[v.product_id] = { sizes: [], colors: [] };
        }
        const entry = variantsByProductId[v.product_id];
        if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
        if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
      });

      return {
        brands: [...new Set(allProducts.map((p: any) => p.brand).filter(Boolean))].sort() as string[],
        categories: [...new Set(allProducts.map((p: any) => p.category).filter(Boolean))].sort() as string[],
        departments: [...new Set(allProducts.map((p: any) => p.style).filter(Boolean))].sort() as string[],
        sizes: [...new Set(allVariants.map((v: any) => v.size).filter(Boolean))].sort() as string[],
        colors: [...new Set(allVariants.map((v: any) => v.color).filter(Boolean))].sort() as string[],
        suppliers: [...new Set(batchData.map((b: any) => b.supplier_name).filter(Boolean))].sort() as string[],
        supplierInvoices: [...new Set(batchData.map((b: any) => b.supplier_invoice_no).filter(Boolean))].sort() as string[],
        supplierPairs: (batchData || []).map((b: any) => ({
          supplier_name: b.supplier_name || null,
          supplier_invoice_no: b.supplier_invoice_no || null,
        })),
        productNames: [...new Set(allProducts.map((p: any) => p.product_name).filter(Boolean))].sort() as string[],
        rawProducts: allProducts as Array<{ id: string; product_name: string; brand: string; category: string; style: string }>,
        variantRows: allVariants as Array<{ product_id: string; size: string | null; color: string | null }>,
        variantsByProductId,
      };
    },
    enabled: !!currentOrganization?.id,
    ...REPORT_CACHE,
  });

  // Sync cached global totals to card state (non-blocking; cards show their own loader)
  useEffect(() => {
    if (cachedGlobalTotals) {
      setGlobalTotals({ ...cachedGlobalTotals, isLoading: false });
    } else if (globalTotalsQueryLoading) {
      setGlobalTotals((prev) => ({ ...prev, isLoading: true }));
    }
  }, [cachedGlobalTotals, globalTotalsQueryLoading]);

  useEffect(() => {
    if (cachedFilterOptions) {
      setFilterOptions(cachedFilterOptions);
    }
  }, [cachedFilterOptions]);

  // Fetch settings on mount
  useEffect(() => {
    if (currentOrganization?.id) {
      fetchSettings();
    }
  }, [currentOrganization?.id]);

  // Mamta Footwear customer balance reconciliation - Apr 2026:
  // Full bidirectional cascading filters for stock report.
  const derivedFilterOptions = useMemo(() => {
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
      if (supplierFilter !== "all" && name !== supplierFilter) return false;
      if (supplierInvoiceFilter !== "all" && invoice !== supplierInvoiceFilter) return false;
      return true;
    });
    const supplierOptions = [...new Set(
      candidateSupplierPairs
        .map((p) => p.supplier_name)
        .filter((v): v is string => !!v)
    )].sort();
    const supplierInvoiceOptions = [...new Set(
      candidateSupplierPairs
        .map((p) => p.supplier_invoice_no)
        .filter((v): v is string => !!v)
    )].sort();

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
  }, [productNameFilter, brandFilter, categoryFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter, filterOptions]);

  // Keep selected values valid when another field narrows options
  useEffect(() => {
    if (productNameFilter && !derivedFilterOptions.productNames.includes(productNameFilter)) setProductNameFilter("");
    if (brandFilter !== "all" && !derivedFilterOptions.brands.includes(brandFilter)) setBrandFilter("all");
    if (categoryFilter !== "all" && !derivedFilterOptions.categories.includes(categoryFilter)) setCategoryFilter("all");
    if (departmentFilter !== "all" && !derivedFilterOptions.departments.includes(departmentFilter)) setDepartmentFilter("all");
    if (sizeFilter !== "all" && !derivedFilterOptions.sizes.includes(sizeFilter)) setSizeFilter("all");
    if (colorFilter !== "all" && !derivedFilterOptions.colors.includes(colorFilter)) setColorFilter("all");
    if (supplierFilter !== "all" && !derivedFilterOptions.suppliers.includes(supplierFilter)) setSupplierFilter("all");
    if (supplierInvoiceFilter !== "all" && !derivedFilterOptions.supplierInvoices.includes(supplierInvoiceFilter)) setSupplierInvoiceFilter("all");
  }, [derivedFilterOptions, productNameFilter, brandFilter, categoryFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter]);

  // Pre-load filter dropdown options from products and variants (non-cached fallback)
  const fetchFilterOptions = async () => {
    if (!currentOrganization?.id) return;
    
    try {
      const [allProducts, allVariants, batchData] = await Promise.all([
        fetchAllPages(
          () => supabase.from("products").select("id, product_name, brand, category, style").eq("organization_id", currentOrganization.id).is("deleted_at", null).neq("product_type", "service").order("product_name")
        ),
        fetchAllPages(
          () => supabase.from("product_variants").select("product_id, size, color").eq("organization_id", currentOrganization.id).eq("active", true).is("deleted_at", null)
        ),
        fetchAllPages(
          () => supabase.from("purchase_bills").select("supplier_name, supplier_invoice_no").eq("organization_id", currentOrganization.id).is("deleted_at", null)
        ),
      ]);

      const variantsByProductId: Record<string, { sizes: string[]; colors: string[] }> = {};
      allVariants.forEach((v: any) => {
        if (!v.product_id) return;
        if (!variantsByProductId[v.product_id]) {
          variantsByProductId[v.product_id] = { sizes: [], colors: [] };
        }
        const entry = variantsByProductId[v.product_id];
        if (v.size && !entry.sizes.includes(v.size)) entry.sizes.push(v.size);
        if (v.color && !entry.colors.includes(v.color)) entry.colors.push(v.color);
      });

      const brands = [...new Set(allProducts.map((p: any) => p.brand).filter(Boolean))].sort() as string[];
      const categories = [...new Set(allProducts.map((p: any) => p.category).filter(Boolean))].sort() as string[];
      const departments = [...new Set(allProducts.map((p: any) => p.style).filter(Boolean))].sort() as string[];
      const sizes = [...new Set(allVariants.map((v: any) => v.size).filter(Boolean))].sort() as string[];
      const colors = [...new Set(allVariants.map((v: any) => v.color).filter(Boolean))].sort() as string[];
      const suppliers = [...new Set(batchData.map((b: any) => b.supplier_name).filter(Boolean))].sort() as string[];
      const supplierInvoices = [...new Set(batchData.map((b: any) => b.supplier_invoice_no).filter(Boolean))].sort() as string[];
      
      setFilterOptions({
        brands,
        categories,
        departments,
        sizes,
        colors,
        suppliers,
        supplierInvoices,
        supplierPairs: (batchData || []).map((b: any) => ({
          supplier_name: b.supplier_name || null,
          supplier_invoice_no: b.supplier_invoice_no || null,
        })),
        productNames: [...new Set(allProducts.map((p: any) => p.product_name).filter(Boolean))].sort() as string[],
        rawProducts: allProducts as Array<{ id: string; product_name: string; brand: string; category: string; style: string }>,
        variantRows: allVariants as Array<{ product_id: string; size: string | null; color: string | null }>,
        variantsByProductId,
      });
    } catch (error) {
      console.error("Error fetching filter options:", error);
    }
  };

  // Search for variant IDs by barcode in purchase_items and sale_items (for old/changed barcodes)
  const searchOldBarcodes = async (barcode: string) => {
    if (!currentOrganization?.id) return;
    
    try {
      // Search in purchase_items
      const { data: purchaseData } = await supabase
        .from("purchase_items")
        .select("sku_id, barcode")
        .ilike("barcode", `%${barcode}%`)
        .not("sku_id", "is", null)
        .limit(50);

      // Search in sale_items
      const { data: saleData } = await supabase
        .from("sale_items")
        .select("variant_id, barcode")
        .ilike("barcode", `%${barcode}%`)
        .limit(50);

      const newMap = new Map<string, string>();
      
      // Add purchase_items mappings
      (purchaseData || []).forEach((item: any) => {
        if (item.sku_id && item.barcode) {
          newMap.set(item.barcode.toLowerCase(), item.sku_id);
        }
      });
      
      // Add sale_items mappings
      (saleData || []).forEach((item: any) => {
        if (item.variant_id && item.barcode) {
          newMap.set(item.barcode.toLowerCase(), item.variant_id);
        }
      });
      
      setOldBarcodeVariantMap(newMap);
    } catch (error) {
      console.error("Error searching old barcodes:", error);
    }
  };

  const fetchSettings = async () => {
    if (!currentOrganization?.id) return;
    try {
      const { data } = await supabase
        .from("settings" as any)
        .select("product_settings")
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();
      
      const settingsData = data as any;
      if (settingsData?.product_settings?.low_stock_threshold) {
        setLowStockThreshold(settingsData.product_settings.low_stock_threshold);
      }
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  };

  const stockReportHasFilters =
    !!searchTerm.trim() ||
    !!productNameFilter.trim() ||
    brandFilter !== "all" ||
    departmentFilter !== "all" ||
    sizeFilter !== "all" ||
    categoryFilter !== "all" ||
    colorFilter !== "all" ||
    supplierFilter !== "all" ||
    supplierInvoiceFilter !== "all" ||
    stockStatusFilter !== "all" ||
    pinnedProducts.length > 0;

  const fetchStockReportPage = useCallback(
    async (page: number) => {
      if (!currentOrganization?.id || !stockReportHasFilters) return;

      const requestId = ++searchRequestIdRef.current;
      setLoading(true);

      try {
        const oldBarcodePromise =
          searchTerm && searchTerm.length >= 4
            ? searchOldBarcodes(searchTerm)
            : Promise.resolve();

        const { data, error } = await (
          supabase as unknown as {
            rpc: (
              fn: string,
              args: Record<string, unknown>,
            ) => ReturnType<typeof supabase.rpc>;
          }
        ).rpc("get_stock_report", {
          p_org_id: currentOrganization.id,
          p_limit: ITEMS_PER_PAGE,
          p_offset: (page - 1) * ITEMS_PER_PAGE,
          p_search: buildStockReportRpcSearch(searchTerm, productNameFilter, pinnedProducts),
          p_category: categoryFilter !== "all" ? categoryFilter : null,
          p_brand: brandFilter !== "all" ? brandFilter : null,
          p_low_stock: stockStatusFilter === "out" ? true : null,
        });

        if (error) throw error;
        if (requestId !== searchRequestIdRef.current) return;

        await oldBarcodePromise;
        if (requestId !== searchRequestIdRef.current) return;

        const rows = (data || []) as unknown as StockReportRpcRow[];
        setServerTotalRows(Number(rows[0]?.total_rows ?? 0));

        setStockItems(
          rows.map((row) => ({
            id: row.variant_id,
            product_name: row.product_name || "",
            brand: row.brand || "",
            color: row.color || "",
            size: row.size || "",
            stock_qty: row.current_stock ?? 0,
            opening_qty: 0,
            purchase_qty: Number(row.purchase_qty ?? 0),
            purchase_return_qty: Number(row.purchase_return_qty ?? 0),
            sales_qty: Number(row.sales_qty ?? 0),
            sale_return_qty: Number(row.sale_return_qty ?? 0),
            sale_price: Number(row.sale_price ?? 0),
            pur_price: row.pur_price != null ? Number(row.pur_price) : null,
            barcode: row.barcode || "",
            supplier_name: "",
            supplier_invoice_no: "",
            category: row.category || "",
            department: row.style || "",
            uom: row.uom || "NOS",
          })),
        );
      } catch (error: unknown) {
        console.error("Error fetching stock data:", error);
        if (requestId === searchRequestIdRef.current) {
          setStockItems([]);
          setServerTotalRows(0);
          const message = error instanceof Error ? error.message : "Could not load stock data. Try again.";
          toast.error("Search failed", { description: message });
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [
      currentOrganization?.id,
      stockReportHasFilters,
      searchTerm,
      productNameFilter,
      pinnedProducts,
      categoryFilter,
      brandFilter,
      stockStatusFilter,
      ITEMS_PER_PAGE,
    ],
  );

  const handleSearch = useCallback(async () => {
    if (!stockReportHasFilters) return;
    setHasSearched(true);
    setCurrentPage(1);
    await fetchStockReportPage(1);
  }, [stockReportHasFilters, fetchStockReportPage]);

  // Server pagination: page 1 is loaded by handleSearch; page 2+ on control click
  useEffect(() => {
    if (!hasSearched || currentPage <= 1) return;
    if (isDashboardFilterRestoring()) return;
    fetchStockReportPage(currentPage);
  }, [currentPage, hasSearched, fetchStockReportPage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Filter data based on search term and filters (client-side filtering of fetched data)
  const filteredStockItems = useMemo(() => {
    // Get variant IDs that match old barcodes
    const variantIdsFromOldBarcodes = new Set<string>();
    if (searchTerm && searchTerm.length >= 4) {
      const search = searchTerm.toLowerCase();
      oldBarcodeVariantMap.forEach((variantId, barcode) => {
        if (barcode.includes(search)) {
          variantIdsFromOldBarcodes.add(variantId);
        }
      });
    }

    return stockItems.filter(item => {
      // Pinned product filter
      if (pinnedProducts.length > 0) {
        const pinnedNames = new Set(pinnedProducts.map(p => p.product_name.toLowerCase()));
        if (!pinnedNames.has((item.product_name || '').toLowerCase())) return false;
      }
      
      // Product name filter
      if (productNameFilter) {
        const nameSearch = productNameFilter.toLowerCase();
        if (!item.product_name.toLowerCase().includes(nameSearch)) return false;
      }
      
      // General search filter — multi-token AND
      if (searchTerm) {
        const matchesOldBarcode = variantIdsFromOldBarcodes.has(item.id);
        if (!matchesOldBarcode && !multiTokenMatch(searchTerm, item.product_name, item.brand, item.color, item.size, item.barcode, item.supplier_name, item.supplier_invoice_no, (item as any).category, (item as any).hsn_code)) return false;
      }
      
      // Brand filter
      if (brandFilter !== "all" && item.brand !== brandFilter) return false;
      
      // Department filter
      if (departmentFilter !== "all" && item.department !== departmentFilter) return false;
      
      // Size filter
      if (sizeFilter !== "all" && item.size !== sizeFilter) return false;
      
      // Supplier filter
      if (supplierFilter !== "all" && item.supplier_name !== supplierFilter) return false;
      
      // Supplier Invoice filter
      if (supplierInvoiceFilter !== "all" && item.supplier_invoice_no !== supplierInvoiceFilter) return false;
      
      // Category filter
      if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
      
      // Color filter
      if (colorFilter !== "all" && item.color !== colorFilter) return false;
      
      // Stock status filter
      if (stockStatusFilter === "out" && item.stock_qty !== 0) return false;
      if (stockStatusFilter === "low" && (item.stock_qty === 0 || item.stock_qty > lowStockThreshold)) return false;
      if (stockStatusFilter === "in" && item.stock_qty <= lowStockThreshold) return false;
      
      return true;
    });
  }, [stockItems, searchTerm, productNameFilter, brandFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter, categoryFilter, stockStatusFilter, lowStockThreshold, oldBarcodeVariantMap, pinnedProducts]);


  // Size-wise stock report data
  const sizeWiseData = useMemo(() => {
    // Independent search: split by '-' or whitespace, AND-match across product fields + size
    const tokens = (sizeWiseSearch || "")
      .toLowerCase()
      .split(/[-\s]+/)
      .map(t => t.trim())
      .filter(Boolean);
    const matchesSearch = (item: typeof filteredStockItems[number]) => {
      if (tokens.length === 0) return true;
      const hay = [
        item.product_name,
        item.brand,
        item.color,
        item.size,
        item.category,
        item.department,
      ].map(v => (v != null ? String(v) : "")).join(" ").toLowerCase();
      return tokens.every(t => hay.includes(t));
    };
    const searched = filteredStockItems.filter(matchesSearch);
    const allSizes = sortSizes([...new Set(searched.map(i => i.size))]);
    const productMap = new Map<string, SizeWiseRow>();
    
    searched.forEach(item => {
      const productKey = `${item.product_name}-${item.brand}-${item.color}-${item.department}`;
      
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productKey,
          productName: item.product_name,
          brand: item.brand,
          color: item.color,
          category: item.category,
          department: item.department,
          sizeStocks: {},
          totalStock: 0
        });
      }
      
      const row = productMap.get(productKey)!;
      row.sizeStocks[item.size] = (row.sizeStocks[item.size] || 0) + item.stock_qty;
      row.totalStock += item.stock_qty;
    });
    
    return {
      sizes: allSizes,
      rows: Array.from(productMap.values()).sort((a, b) => a.productName.localeCompare(b.productName))
    };
  }, [filteredStockItems, sizeWiseSearch]);

  // Calculate totals for size-wise report
  const sizeWiseTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    let grandTotal = 0;
    
    sizeWiseData.rows.forEach(row => {
      sizeWiseData.sizes.forEach(size => {
        totals[size] = (totals[size] || 0) + (row.sizeStocks[size] || 0);
      });
      grandTotal += row.totalStock;
    });
    
    return { sizeTotals: totals, grandTotal };
  }, [sizeWiseData]);

  
  const totalStock = filteredStockItems.reduce((sum, item) => sum + item.stock_qty, 0);
  const totalStockValue = filteredStockItems.reduce((sum, item) => sum + (item.pur_price || 0) * item.stock_qty, 0);
  const totalSaleValue = filteredStockItems.reduce((sum, item) => sum + (item.sale_price || 0) * item.stock_qty, 0);

  const allStockTotals = useMemo(
    () => ({
      opening: filteredStockItems.reduce((s, i) => s + i.opening_qty, 0),
      purchase: filteredStockItems.reduce((s, i) => s + i.purchase_qty, 0),
      purchaseReturn: filteredStockItems.reduce((s, i) => s + i.purchase_return_qty, 0),
      sales: filteredStockItems.reduce((s, i) => s + i.sales_qty, 0),
      saleReturn: filteredStockItems.reduce((s, i) => s + i.sale_return_qty, 0),
      currentStock: filteredStockItems.reduce((s, i) => s + i.stock_qty, 0),
      stockValue: Math.round(filteredStockItems.reduce((s, i) => s + (i.pur_price || 0) * i.stock_qty, 0)),
      saleValue: Math.round(filteredStockItems.reduce((s, i) => s + i.sale_price * i.stock_qty, 0)),
    }),
    [filteredStockItems],
  );

  // Server-side pagination total; client-only filters apply within the current page
  const hasClientOnlyFilters =
    departmentFilter !== "all" ||
    sizeFilter !== "all" ||
    colorFilter !== "all" ||
    supplierFilter !== "all" ||
    supplierInvoiceFilter !== "all" ||
    stockStatusFilter === "in" ||
    stockStatusFilter === "low" ||
    pinnedProducts.length > 1;

  const matchingVariantCount = hasSearched
    ? hasClientOnlyFilters
      ? filteredStockItems.length
      : serverTotalRows
    : globalTotals.variantCount;

  const totalPages = Math.max(1, Math.ceil(serverTotalRows / ITEMS_PER_PAGE));
  const paginatedStockItems = filteredStockItems;

  // Reset to page 1 when filters change
  useEffect(() => {
    if (isDashboardFilterRestoring()) return;
    setCurrentPage(1);
  }, [searchTerm, productNameFilter, brandFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter, categoryFilter, stockStatusFilter]);

  const clearFilters = () => {
    setSearchTerm("");
    setProductNameFilter("");
    setBrandFilter("all");
    setDepartmentFilter("all");
    setSizeFilter("all");
    setColorFilter("all");
    setCategoryFilter("all");
    setSupplierFilter("all");
    setSupplierInvoiceFilter("all");
    setStockStatusFilter("all");
    setStockItems([]);
    setServerTotalRows(0);
    setHasSearched(false);
  };

  const hasActiveFilters =
    searchTerm ||
    productNameFilter ||
    pinnedProducts.length > 0 ||
    brandFilter !== "all" ||
    departmentFilter !== "all" ||
    sizeFilter !== "all" ||
    colorFilter !== "all" ||
    categoryFilter !== "all" ||
    supplierFilter !== "all" ||
    supplierInvoiceFilter !== "all" ||
    stockStatusFilter !== "all";

  // Export Size-wise to Excel
  const exportSizeWiseToExcel = () => {
    const headers = ["Product", "Brand", "Color", "Category", "Style", ...sizeWiseData.sizes, "Total Stock"];
    const data = sizeWiseData.rows.map(row => [
      row.productName,
      row.brand,
      row.color,
      row.category,
      row.department,
      ...sizeWiseData.sizes.map(size => row.sizeStocks[size] || 0),
      row.totalStock
    ]);
    
    data.push([
      "TOTAL", "", "", "", "",
      ...sizeWiseData.sizes.map(size => sizeWiseTotals.sizeTotals[size] || 0),
      sizeWiseTotals.grandTotal
    ]);
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const colWidths = [
      { wch: 40 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
      ...sizeWiseData.sizes.map(() => ({ wch: 8 })),
      { wch: 12 },
    ];
    ws['!cols'] = colWidths;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Size-wise Stock");
    XLSX.writeFile(wb, `SizeWise_Stock_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Export Size-wise to PDF
  const exportSizeWiseToPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    
    doc.setFontSize(16);
    doc.text("Size-wise Stock Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated on: ${format(new Date(), "dd-MM-yyyy")}`, pageWidth / 2, 22, { align: "center" });
    
    let y = 35;
    const startX = 10;
    const sizes = sizeWiseData.sizes;
    const productColWidth = 70;
    const sizeColWidth = Math.min(15, (pageWidth - productColWidth - 30) / (sizes.length + 1));
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(240, 240, 240);
    doc.rect(startX, y - 5, pageWidth - 20, 8, "F");
    doc.text("Product (Brand)", startX + 2, y);
    sizes.forEach((size, i) => {
      doc.text(size, productColWidth + startX + (i * sizeColWidth), y);
    });
    doc.text("Total", productColWidth + startX + (sizes.length * sizeColWidth), y);
    
    doc.setFont("helvetica", "normal");
    sizeWiseData.rows.forEach((row, idx) => {
      y += 6;
      if (y > pageHeight - 25) {
        doc.addPage();
        y = 20;
      }
      
      if (idx % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(startX, y - 4, pageWidth - 20, 6, "F");
      }
      
      const productLabel = `${row.productName} ${row.brand ? `(${row.brand})` : ''} ${row.department ? `[${row.department}]` : ''}`.substring(0, 70);
      doc.text(productLabel, startX + 2, y);
      sizes.forEach((size, i) => {
        const qty = row.sizeStocks[size] || 0;
        doc.text(String(qty), productColWidth + startX + (i * sizeColWidth), y);
      });
      doc.text(String(row.totalStock), productColWidth + startX + (sizes.length * sizeColWidth), y);
    });
    
    y += 8;
    if (y > pageHeight - 15) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.setFillColor(255, 220, 220);
    doc.rect(startX, y - 4, pageWidth - 20, 7, "F");
    doc.text("TOTAL", startX + 2, y);
    sizes.forEach((size, i) => {
      doc.text(String(sizeWiseTotals.sizeTotals[size] || 0), productColWidth + startX + (i * sizeColWidth), y);
    });
    doc.text(String(sizeWiseTotals.grandTotal), productColWidth + startX + (sizes.length * sizeColWidth), y);
    
    doc.save(`SizeWise_Stock_Report_${format(new Date(), "yyyy-MM-dd")}.pdf`);
  };

  // Export All Stock to Excel
  const exportAllStockToExcel = () => {
    const headers = ["Sr No", "Supplier", "Supplier Invoice", "Product", "Brand", "Size", "Color", "Style", "Barcode", "Opening Qty", "Purchase Qty", "Pur Return", "Sales Qty", "Sale Return", "Current Stock", "Pur Price", "Stock Value", "Sale Price", "Status"];
    const data = filteredStockItems.map((item, index) => [
      index + 1,
      item.supplier_name || "",
      item.supplier_invoice_no || "",
      item.product_name,
      item.brand,
      item.size,
      item.color || "",
      item.department || "",
      item.barcode,
      item.opening_qty,
      item.purchase_qty,
      item.purchase_return_qty,
      item.sales_qty,
      item.sale_return_qty,
      item.stock_qty,
      item.pur_price || 0,
      Math.round((item.pur_price || 0) * item.stock_qty),
      item.sale_price,
      item.stock_qty === 0 ? "Out of Stock" : item.stock_qty <= lowStockThreshold ? "Low Stock" : "In Stock",
    ]);
    // Totals row
    data.push([
      "", "", "", "TOTAL", "", "", "", "", "",
      filteredStockItems.reduce((s, i) => s + i.opening_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.purchase_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.purchase_return_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.sales_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.sale_return_qty, 0),
      filteredStockItems.reduce((s, i) => s + i.stock_qty, 0),
      "",
      Math.round(filteredStockItems.reduce((s, i) => s + (i.pur_price || 0) * i.stock_qty, 0)),
      Math.round(filteredStockItems.reduce((s, i) => s + i.sale_price * i.stock_qty, 0)),
      "",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    ws['!cols'] = [
      { wch: 6 }, { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock Report");
    XLSX.writeFile(wb, `Stock_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  // Export ALL stock to Excel (without search - fetches everything)
  const exportFullStockToExcel = async () => {
    if (!currentOrganization?.id) return;
    setExcelExporting(true);
    try {
      const allVariants: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from("product_variants")
          .select(`
            id, size, color, stock_qty, opening_qty, sale_price, pur_price, barcode,
            products!inner (product_name, brand, category, style, product_type, deleted_at)
          `)
          .eq("organization_id", currentOrganization.id)
          .eq("active", true)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .neq("products.product_type", "service")
          .order("stock_qty", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (error) throw error;
        if (data && data.length > 0) {
          allVariants.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }

      const items = allVariants.map((v: any) => ({
        product_name: v.products?.product_name || "",
        brand: v.products?.brand || "",
        size: v.size || "",
        color: v.color || "",
        department: v.products?.style || "",
        category: v.products?.category || "",
        barcode: v.barcode || "",
        stock_qty: v.stock_qty || 0,
        opening_qty: v.opening_qty || 0,
        pur_price: v.pur_price || 0,
        sale_price: v.sale_price || 0,
      }));

      const headers = ["Sr No", "Product", "Brand", "Size", "Color", "Style", "Category", "Barcode", "Opening Qty", "Current Stock", "Pur Price", "Stock Value", "Sale Price", "Sale Value", "Status"];
      const data = items.map((item, index) => [
        index + 1,
        item.product_name,
        item.brand,
        item.size,
        item.color,
        item.department,
        item.category,
        item.barcode,
        item.opening_qty,
        item.stock_qty,
        item.pur_price,
        Math.round(item.pur_price * item.stock_qty),
        item.sale_price,
        Math.round(item.sale_price * item.stock_qty),
        item.stock_qty === 0 ? "Out of Stock" : item.stock_qty <= lowStockThreshold ? "Low Stock" : "In Stock",
      ]);

      // Grand Total row
      const totalOpeningQty = items.reduce((s, i) => s + i.opening_qty, 0);
      const totalCurrentStock = items.reduce((s, i) => s + i.stock_qty, 0);
      const totalStockVal = Math.round(items.reduce((s, i) => s + i.pur_price * i.stock_qty, 0));
      const totalSaleVal = Math.round(items.reduce((s, i) => s + i.sale_price * i.stock_qty, 0));

      data.push([
        "", "GRAND TOTAL", "", "", "", "", "", "",
        totalOpeningQty,
        totalCurrentStock,
        "",
        totalStockVal,
        "",
        totalSaleVal,
        `${items.length} variants`,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      ws['!cols'] = [
        { wch: 6 }, { wch: 30 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
        { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "All Stock");
      XLSX.writeFile(wb, `Full_Stock_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    } catch (error) {
      console.error("Error exporting full stock:", error);
    } finally {
      setExcelExporting(false);
    }
  };

  // Print All Stock as A4
  const printAllStock = () => {
    const orgName = currentOrganization?.name || "Stock Report";
    const dateStr = format(new Date(), "dd-MM-yyyy");
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rows = filteredStockItems.map((item, i) => `
      <tr style="${i % 2 === 0 ? '' : 'background:#f9f9f9;'}">
        <td style="text-align:center">${i + 1}</td>
        <td>${item.product_name}</td>
        <td>${item.brand}</td>
        <td>${item.size}</td>
        <td>${item.color || ''}</td>
        <td>${item.barcode}</td>
        <td style="text-align:right">${item.opening_qty}</td>
        <td style="text-align:right">${item.purchase_qty}</td>
        <td style="text-align:right">${item.purchase_return_qty}</td>
        <td style="text-align:right">${item.sales_qty}</td>
        <td style="text-align:right">${item.sale_return_qty}</td>
        <td style="text-align:right;font-weight:bold">${item.stock_qty}</td>
        <td style="text-align:right">${item.pur_price ? '₹' + item.pur_price : '-'}</td>
        <td style="text-align:right">${item.sale_price ? '₹' + item.sale_price : '-'}</td>
      </tr>`).join("");

    const totalRow = `
      <tr style="font-weight:bold;background:#eee;border-top:2px solid #333">
        <td colspan="6" style="text-align:center">TOTAL</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.opening_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.purchase_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.purchase_return_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.sales_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.sale_return_qty, 0)}</td>
        <td style="text-align:right">${filteredStockItems.reduce((s, i) => s + i.stock_qty, 0)}</td>
        <td style="text-align:right">₹${Math.round(filteredStockItems.reduce((s, i) => s + (i.pur_price || 0) * i.stock_qty, 0)).toLocaleString('en-IN')}</td>
        <td style="text-align:right">₹${Math.round(filteredStockItems.reduce((s, i) => s + i.sale_price * i.stock_qty, 0)).toLocaleString('en-IN')}</td>
      </tr>`;

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Stock Report</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; font-size: 9px; margin: 0; padding: 8px; }
        h2 { text-align: center; margin: 4px 0; font-size: 14px; }
        .sub { text-align: center; font-size: 10px; color: #666; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #ccc; padding: 3px 5px; }
        th { background: #f0f0f0; font-size: 8px; text-transform: uppercase; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style></head><body>
      <h2>${orgName} — Stock Report</h2>
      <div class="sub">Generated: ${dateStr} | Items: ${filteredStockItems.length} | Total Stock: ${totalStock.toLocaleString('en-IN')}</div>
      <table>
        <thead><tr>
          <th>Sr</th><th>Product</th><th>Brand</th><th>Size</th><th>Color</th><th>Barcode</th>
          <th>Open</th><th>Pur</th><th>P.Ret</th><th>Sales</th><th>S.Ret</th><th>Stock</th><th>Pur ₹</th><th>Sale ₹</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
      </table></body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 300);
  };

  const isMobile = useIsMobile();

  const stockKpiItems = useMemo((): ReportKpiItem[] => {
    const qty = hasSearched ? totalStock : globalTotals.totalStock;
    const variants = hasSearched ? matchingVariantCount : globalTotals.variantCount;
    const costVal = Math.round(hasSearched ? totalStockValue : globalTotals.stockValue);
    const saleVal = Math.round(hasSearched ? totalSaleValue : globalTotals.saleValue);
    const loading = globalTotals.isLoading && !hasSearched;

    return [
      {
        label: hasSearched ? "Filtered Stock" : "Total Stock",
        value: loading ? "…" : qty.toLocaleString("en-IN"),
        sub: `${variants} variants`,
        gradient: "bg-gradient-to-br from-blue-500 to-blue-600",
        icon: Package,
      },
      {
        label: "Stock Value (Cost)",
        value: loading ? "…" : `₹${costVal.toLocaleString("en-IN")}`,
        sub: "Purchase price valuation",
        gradient: "bg-gradient-to-br from-amber-500 to-amber-600",
        icon: IndianRupee,
      },
      {
        label: "Sale Value",
        value: loading ? "…" : `₹${saleVal.toLocaleString("en-IN")}`,
        sub: "Sale price valuation",
        gradient: "bg-gradient-to-br from-emerald-500 to-emerald-600",
        icon: IndianRupee,
      },
    ];
  }, [
    hasSearched,
    totalStock,
    globalTotals,
    filteredStockItems.length,
    matchingVariantCount,
    totalStockValue,
    totalSaleValue,
  ]);

  const compactStockKpiStrip = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full shrink-0 print:hidden">
      {stockKpiItems.map((item) => (
        <div
          key={item.label}
          className={cn("rounded-lg px-3 py-2 min-w-0 shadow-sm", item.gradient)}
        >
          <p className="text-xs font-medium text-white/80 leading-none truncate">{item.label}</p>
          <p className="text-base sm:text-lg font-black text-white tabular-nums leading-tight mt-1 truncate">{item.value}</p>
        </div>
      ))}
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader title="Stock Report" backTo="/" subtitle={`${globalTotals.variantCount} variants`} />

        <div className="px-4 pt-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search name, brand, barcode, color... (multi-word AND)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9 h-10 bg-card border-border/60 rounded-xl text-sm" />
            </div>
            <Button onClick={handleSearch} disabled={loading} size="sm" className="h-10 px-4 rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <MobileStatStrip stats={[
          { label: "Stock Value", value: `₹${(hasSearched ? totalStockValue : globalTotals.stockValue) >= 100000 ? ((hasSearched ? totalStockValue : globalTotals.stockValue)/100000).toFixed(1)+"L" : Math.round(hasSearched ? totalStockValue : globalTotals.stockValue).toLocaleString("en-IN")}`, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Total Qty", value: globalTotals.isLoading ? "…" : (hasSearched ? totalStock : globalTotals.totalStock).toLocaleString("en-IN"), color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Variants", value: globalTotals.isLoading ? "…" : (hasSearched ? `${matchingVariantCount}` : `${globalTotals.variantCount}`), color: "text-purple-600", bg: "bg-purple-50" },
        ]} />

        <div className="flex-1 px-4 py-2 space-y-2">
          {!hasSearched ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">{searchTerm.length > 0 ? 'Tap Search to view results' : 'Search to view stock items'}</p>
              <p className="text-xs mt-1">Enter barcode, product name or brand</p>
              <Button onClick={handleSearch} className="mt-4" size="sm">
                <Search className="h-4 w-4 mr-2" /> {searchTerm.length > 0 ? 'Search' : 'Search All Stock'}
              </Button>
            </div>
          ) : loading ? (
            Array.from({length: 6}).map((_,i) => (
              <div key={i} className="h-16 bg-card rounded-2xl animate-pulse" />
            ))
          ) : filteredStockItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mb-3 opacity-30" />
              <p className="text-sm font-medium">No stock items found</p>
            </div>
          ) : filteredStockItems.slice(0, 100).map((item) => (
            <div key={item.id} className="bg-card rounded-2xl p-3 border border-border/40 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground truncate">{item.product_name}</p>
                  {item.brand && <p className="text-xs font-semibold text-foreground">{item.brand}</p>}
                  <div className="flex gap-1.5 mt-1 flex-wrap">
                    {item.barcode && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">{item.barcode}</span>}
                    {item.size && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{item.size}</span>}
                    {item.color && <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">{item.color}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className={cn("text-lg font-bold tabular-nums", item.stock_qty <= 0 ? "text-destructive" : item.stock_qty <= lowStockThreshold ? "text-amber-600" : "text-foreground")}>
                    {item.stock_qty}{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? ` ${item.uom}` : ''}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? item.uom : 'qty'}</p>
                  {item.pur_price && item.stock_qty > 0 && (
                    <p className="text-[10px] text-muted-foreground tabular-nums">
                      ₹{Math.round(item.pur_price * item.stock_qty).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <MobileBottomNav />
      </div>
    );
  }

  return (
    <div className="stock-report-workspace stock-report-page flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full print:min-h-screen print:h-auto print:overflow-visible print:bg-white print:p-4">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2 print:space-y-2">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 print:hidden">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 text-sm shrink-0"
              onClick={() => orgNavigate("/reports")}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Reports
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-blue-700 tracking-tight leading-none flex items-center gap-2">
                <Package className="h-5 w-5 shrink-0" />
                Stock Report
              </h1>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {globalTotals.isLoading
                  ? "Loading totals…"
                  : `${globalTotals.variantCount.toLocaleString("en-IN")} variants · apply filters and search`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm border-slate-200 gap-1.5"
              onClick={() => window.print()}
              disabled={!hasSearched || filteredStockItems.length === 0}
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 text-sm border-slate-200 gap-1.5"
              onClick={() => {
                if (hasSearched && filteredStockItems.length > 0) {
                  activeTab === "sizewise" ? exportSizeWiseToExcel() : exportAllStockToExcel();
                } else {
                  exportFullStockToExcel();
                }
              }}
              disabled={excelExporting}
            >
              {excelExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {excelExporting ? "Exporting…" : "Excel"}
            </Button>
          </div>
        </div>

      {compactStockKpiStrip}

      <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden shrink-0 print:hidden">
        <div className="space-y-2 p-2 sm:p-3 border-b border-slate-100 bg-white">
        <div className="flex gap-1.5 items-center">
          <ProductSearchDropdown
            value={searchTerm}
            onChange={setSearchTerm}
            onSelect={(product) => {
              // Add as pinned product instead of just setting search term
              setPinnedProducts(prev => {
                if (prev.some(p => p.product_name === product.product_name)) return prev;
                return [...prev, { id: product.id, product_name: product.product_name, brand: product.brand, category: product.category || '', style: product.style || '' }];
              });
              setSearchTerm('');
              if (!hasSearched) handleSearch();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search name, brand, category, style or barcode..."
            className="flex-1"
          />
          <Button onClick={handleSearch} disabled={loading || (!hasActiveFilters && pinnedProducts.length === 0)} className="h-10 px-4 text-sm font-semibold bg-blue-600 hover:bg-blue-700 shadow-sm gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </Button>
          {(hasActiveFilters || pinnedProducts.length > 0) && (
            <Button variant="ghost" onClick={() => { clearFilters(); setPinnedProducts([]); }} className="h-8 text-sm px-2">
              Clear All
            </Button>
          )}
        </div>

        {pinnedProducts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {pinnedProducts.map(p => (
              <div key={p.id} className="flex items-center gap-1 bg-primary/15 text-primary text-sm font-semibold px-2 py-0.5 rounded-full border border-primary/30">
                <span className="font-medium">{p.product_name}</span>
                {p.brand && <span className="opacity-70">· {p.brand}</span>}
                {p.category && <span className="opacity-70">· {p.category}</span>}
                <button
                  onClick={() => setPinnedProducts(prev => prev.filter(x => x.id !== p.id))}
                  className="ml-1 opacity-60 hover:opacity-100 text-sm font-bold"
                >×</button>
              </div>
            ))}
            {pinnedProducts.length > 1 && (
              <button
                onClick={() => setPinnedProducts([])}
                className="text-xs text-muted-foreground hover:text-destructive px-2 py-1"
              >
                Clear pins
              </button>
            )}
          </div>
        )}

        {/* Always visible multi-field filters */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="space-y-0.5 relative">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Product Name</label>
            <SearchableSelect
              value={productNameFilter || "all"}
              onValueChange={(val) => {
                const name = val === "all" ? "" : val;
                setProductNameFilter(name);
                // Reset dependent filters
                setBrandFilter("all");
                setCategoryFilter("all");
                setDepartmentFilter("all");
                setSizeFilter("all");
                setColorFilter("all");
                // Auto-select if only one value matches
                if (name) {
                  const matches = filterOptions.rawProducts.filter(p => p.product_name === name);
                  const brands = [...new Set(matches.map(p => p.brand).filter(Boolean))];
                  const cats = [...new Set(matches.map(p => p.category).filter(Boolean))];
                  const styles = [...new Set(matches.map(p => p.style).filter(Boolean))];
                  if (brands.length === 1) setBrandFilter(brands[0]);
                  if (cats.length === 1) setCategoryFilter(cats[0]);
                  if (styles.length === 1) setDepartmentFilter(styles[0]);
                }
              }}
              options={derivedFilterOptions.productNames}
              allLabel="All Products"
              placeholder="All Products"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Brand</label>
            <SearchableSelect value={brandFilter} onValueChange={setBrandFilter} options={derivedFilterOptions.brands} allLabel="All Brands" placeholder="All Brands" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.category}</label>
            <SearchableSelect value={categoryFilter} onValueChange={setCategoryFilter} options={derivedFilterOptions.categories} allLabel="All Categories" placeholder="All Categories" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.style}</label>
            <SearchableSelect value={departmentFilter} onValueChange={setDepartmentFilter} options={derivedFilterOptions.departments} allLabel={`All ${fieldLabels.style}`} placeholder={`All ${fieldLabels.style}`} />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Size</label>
            <SearchableSelect value={sizeFilter} onValueChange={setSizeFilter} options={derivedFilterOptions.sizes} allLabel="All Sizes" placeholder="All Sizes" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{fieldLabels.color}</label>
            <SearchableSelect value={colorFilter} onValueChange={setColorFilter} options={derivedFilterOptions.colors} allLabel="All Colors" placeholder="All Colors" />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Stock Status</label>
            <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
              <SelectTrigger className="h-8 !bg-white !text-gray-900 text-sm">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="in">In Stock</SelectItem>
                <SelectItem value="low">Low Stock</SelectItem>
                <SelectItem value="out">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Additional filters in collapsible */}
        <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-3 w-3" />
              More Filters
              {filtersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Supplier</label>
                <SearchableSelect value={supplierFilter} onValueChange={setSupplierFilter} options={derivedFilterOptions.suppliers} allLabel="All Suppliers" placeholder="All Suppliers" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Supplier Invoice</label>
                <SearchableSelect value={supplierInvoiceFilter} onValueChange={setSupplierInvoiceFilter} options={derivedFilterOptions.supplierInvoices} allLabel="All Invoices" placeholder="All Invoices" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        </div>
      </Card>

      <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col print:block">
        {!hasSearched ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-6 text-center print:hidden">
            <Search className="h-10 w-10 text-muted-foreground/35" />
            <p className="text-base text-muted-foreground max-w-md">
              Apply filters or search, then click <strong>Search</strong> to view stock.
            </p>
            <Button
              onClick={handleSearch}
              disabled={loading || (!hasActiveFilters && pinnedProducts.length === 0 && !searchTerm.trim())}
              className="h-10 px-5 text-sm font-semibold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
              Search
            </Button>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center gap-2 py-8 text-base text-muted-foreground print:hidden">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Loading stock data…
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 min-h-0 flex flex-col print:block">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
            <TabsList className="h-9 bg-slate-100 p-0.5 rounded-md">
              <TabsTrigger value="all" className="rounded text-sm font-semibold px-3 data-[state=active]:bg-white data-[state=active]:text-blue-700">
                All Stock
              </TabsTrigger>
              <TabsTrigger value="sizewise" className="rounded text-sm font-semibold px-3 gap-1.5 data-[state=active]:bg-white data-[state=active]:text-blue-700">
                <Grid3X3 className="h-3.5 w-3.5" />
                Size-wise
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground tabular-nums">
                {activeTab === "all"
                  ? `${matchingVariantCount.toLocaleString("en-IN")} matching`
                  : `${sizeWiseData.rows.length.toLocaleString("en-IN")} products`}
              </span>
              {activeTab === "all" ? (
                <>
                  <Button variant="outline" size="sm" className="h-9 text-sm" onClick={exportAllStockToExcel} disabled={filteredStockItems.length === 0}>
                    <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 text-sm" onClick={printAllStock} disabled={filteredStockItems.length === 0}>
                    <Printer className="h-4 w-4 mr-1.5" /> Print
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" className="h-9 text-sm" onClick={exportSizeWiseToExcel} disabled={sizeWiseData.rows.length === 0}>
                    <FileSpreadsheet className="h-4 w-4 mr-1.5" /> Excel
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 text-sm" onClick={exportSizeWiseToPDF} disabled={sizeWiseData.rows.length === 0}>
                    <FileText className="h-4 w-4 mr-1.5" /> PDF
                  </Button>
                </>
              )}
            </div>
          </div>

            <TabsContent value="all" className="mt-0 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
              <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                <div className={cn(STOCK_TABLE_SCROLL, "border-b border-slate-100")}>
                  <Table className="text-sm border-separate border-spacing-0 min-w-max">
                    <TableHeader className={STOCK_TABLE_HEAD}>
                      <TableRow>
                        <TableHead className={cn("w-16 text-center", STOCK_NEUTRAL_TH)}>Sr No</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>Supplier</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>Supplier Invoice</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>Product</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>{fieldLabels.brand}</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>Size</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>{fieldLabels.color}</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>{fieldLabels.style}</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>Barcode</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH, "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-100")}>Opening Qty</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH, "bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-100")}>Purchase Qty</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH, "bg-orange-50 dark:bg-orange-950 text-orange-800 dark:text-orange-100")}>Pur Return</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH, "bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-100")}>Sales Qty</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH, "bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-100")}>Sale Return</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH, "bg-violet-50 dark:bg-violet-950 text-violet-800 dark:text-violet-100")}>Current Stock</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH)}>Pur Price</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH)}>Stock Value</TableHead>
                        <TableHead className={cn("text-right", STOCK_NEUTRAL_TH)}>Sale Price</TableHead>
                        <TableHead className={STOCK_NEUTRAL_TH}>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStockItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={19} className="h-20 text-center text-base text-muted-foreground">
                            No products found matching your search
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedStockItems.map((item, index) => {
                          const highlightQuery = searchTerm.trim();
                          const rowHighlight = highlightQuery && stockItemMatchesSearch(item, highlightQuery);
                          return (
                          <TableRow
                            key={item.id}
                            className={cn(
                              "hover:bg-slate-50/80",
                              rowHighlight && "bg-amber-50/80 dark:bg-amber-950/25 ring-1 ring-inset ring-amber-300/50",
                            )}
                          >
                            <TableCell className={cn(STOCK_DATA_CELL_CENTER, "font-medium text-muted-foreground text-xs")}>
                              {((currentPage - 1) * ITEMS_PER_PAGE) + index + 1}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-muted-foreground text-xs")}>{item.supplier_name || '—'}</TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "font-mono font-medium text-xs")}>{item.supplier_invoice_no || '—'}</TableCell>
                            <TableCell className={STOCK_PRODUCT_NAME_CELL}>{highlightSearchText(item.product_name, highlightQuery)}</TableCell>
                            <TableCell className={STOCK_PRODUCT_DETAIL_CELL}>{highlightSearchText(item.brand, highlightQuery)}</TableCell>
                            <TableCell className={STOCK_PRODUCT_DETAIL_CELL}>{highlightSearchText(item.size, highlightQuery)}</TableCell>
                            <TableCell className={STOCK_PRODUCT_DETAIL_CELL}>{highlightSearchText(item.color || '—', highlightQuery)}</TableCell>
                            <TableCell className={STOCK_PRODUCT_DETAIL_CELL}>{highlightSearchText(item.department || '—', highlightQuery)}</TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "font-mono font-semibold")}>{highlightSearchText(item.barcode, highlightQuery)}</TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right bg-blue-50/80 dark:bg-blue-950/50 font-medium")}>
                              {item.opening_qty}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right bg-green-50/80 dark:bg-green-950/50 font-medium text-green-700 dark:text-green-400")}>
                              +{item.purchase_qty}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right bg-orange-50/80 dark:bg-orange-950/50 font-medium text-orange-700 dark:text-orange-400")}>
                              {item.purchase_return_qty > 0 ? `-${item.purchase_return_qty}` : '0'}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right bg-red-50/80 dark:bg-red-950/50 font-medium text-red-700 dark:text-red-400")}>
                              {item.sales_qty > 0 ? `-${item.sales_qty}` : '0'}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right bg-emerald-50/80 dark:bg-emerald-950/50 font-medium text-emerald-700 dark:text-emerald-400")}>
                              {item.sale_return_qty > 0 ? `+${item.sale_return_qty}` : '0'}
                            </TableCell>
                            <TableCell className={STOCK_QTY_HIGHLIGHT_CELL}>
                              {item.stock_qty}{item.uom && item.uom !== 'NOS' && item.uom !== 'PCS' ? ` ${item.uom}` : ''}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right")}>
                              {item.pur_price ? (
                                <span>₹{item.pur_price}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right font-medium text-primary")}>
                              {item.pur_price ? (
                                <span>₹{(item.pur_price * item.stock_qty).toLocaleString('en-IN')}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className={cn(STOCK_DATA_CELL, "text-right")}>
                              <span>₹{item.sale_price}</span>
                            </TableCell>
                            <TableCell className={STOCK_DATA_CELL}>
                              {item.stock_qty === 0 ? (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5">Out</Badge>
                              ) : item.stock_qty <= lowStockThreshold ? (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">Low</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">In</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                    {filteredStockItems.length > 0 && (
                      <TableFooter className={STOCK_TABLE_FOOTER}>
                        <TableRow>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-center bg-slate-200 dark:bg-slate-700")} colSpan={9}>
                            GRAND TOTAL
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-blue-100 dark:bg-blue-900/60 text-blue-900 dark:text-blue-100")}>
                            {allStockTotals.opening.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400")}>
                            +{allStockTotals.purchase.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400")}>
                            -{allStockTotals.purchaseReturn.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400")}>
                            -{allStockTotals.sales.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400")}>
                            +{allStockTotals.saleReturn.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-violet-50 dark:bg-violet-950 text-violet-800 dark:text-violet-300")}>
                            {allStockTotals.currentStock.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-slate-200 dark:bg-slate-700")}>—</TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right text-primary bg-slate-200 dark:bg-slate-700")}>
                            ₹{allStockTotals.stockValue.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "text-right bg-slate-200 dark:bg-slate-700")}>
                            ₹{allStockTotals.saleValue.toLocaleString('en-IN')}
                          </TableCell>
                          <TableCell className={cn(STOCK_FOOTER_CELL, "bg-slate-200 dark:bg-slate-700")}>—</TableCell>
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>

                  {/* Pagination Controls — server-side pages via get_stock_report */}
                  {hasSearched && serverTotalRows > ITEMS_PER_PAGE && (
                    <div className="flex items-center justify-between px-3 py-2.5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 shrink-0">
                      <div className="text-xs text-slate-500">
                        Page {currentPage} of {totalPages} · {matchingVariantCount.toLocaleString("en-IN")} variants
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                        >
                          First
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Prev
                        </Button>
                        
                        {/* Page number buttons */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            return (
                              <Button
                                key={pageNum}
                                variant={currentPage === pageNum ? "default" : "outline"}
                                size="sm"
                                className="w-9"
                                onClick={() => setCurrentPage(pageNum)}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                        >
                          Last
                        </Button>
                      </div>
                    </div>
                  )}
              </CardContent>
            </TabsContent>

            <TabsContent value="sizewise" className="mt-0 flex-1 min-h-0 flex flex-col focus-visible:outline-none data-[state=inactive]:hidden">
              <CardContent className="p-0 flex flex-col flex-1 min-h-0">
                <div className="px-2 py-1 border-b border-slate-100 shrink-0">
                  <div className="relative max-w-2xl">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search live: product-brand-style-color-size"
                      value={sizeWiseSearch}
                      onChange={(e) => setSizeWiseSearch(e.target.value)}
                      className="pl-8 h-8 text-sm font-medium"
                    />
                  </div>
                  {sizeWiseSearch && (
                    <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                      {sizeWiseData.rows.length} matching products
                    </div>
                  )}
                </div>
                {sizeWiseData.rows.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-3">No products found matching your filters</p>
                ) : (
                  <>
                    <div className="md:hidden px-3 py-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <ChevronLeft className="h-3 w-3" />
                      <span>Swipe to see all sizes</span>
                      <ChevronRight className="h-3 w-3" />
                    </div>
                    <div className={cn(STOCK_TABLE_SCROLL, "border-b border-slate-100 scroll-smooth snap-x snap-mandatory md:snap-none")}>
                        <Table className="min-w-max text-sm border-separate border-spacing-0">
                          <TableHeader className={STOCK_TABLE_HEAD}>
                            <TableRow>
                              <TableHead className={cn("min-w-[180px] md:min-w-[250px] sticky left-0 z-10", STOCK_NEUTRAL_TH)}>Product</TableHead>
                              {sizeWiseData.sizes.map((size, idx) => (
                                <TableHead
                                  key={size}
                                  className={cn(
                                    "text-center min-w-[50px] md:min-w-[60px] snap-start",
                                    STOCK_NEUTRAL_TH,
                                    "bg-blue-50 dark:bg-blue-950 text-blue-800 dark:text-blue-100",
                                    idx === 0 ? "scroll-ml-[180px] md:scroll-ml-0" : "",
                                  )}
                                >
                                  {size}
                                </TableHead>
                              ))}
                              <TableHead className={cn("text-center min-w-[60px] md:min-w-[80px] sticky right-0 z-10", STOCK_NEUTRAL_TH, "bg-violet-50 dark:bg-violet-950 text-violet-800 dark:text-violet-100")}>
                                Stock
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {sizeWiseData.rows.map((row, index) => {
                              const swQuery = sizeWiseSearch.trim();
                              const swHighlight = swQuery && multiTokenMatch(swQuery, row.productName, row.brand, row.color, row.category, row.department);
                              return (
                              <TableRow
                                key={row.productKey}
                                className={cn(
                                  index % 2 === 0 ? "bg-background" : "bg-muted/20",
                                  swHighlight && "bg-amber-50/80 dark:bg-amber-950/25 ring-1 ring-inset ring-amber-300/50",
                                )}
                              >
                                <TableCell className="font-medium sticky left-0 bg-inherit z-10 backdrop-blur-sm min-w-[160px] md:min-w-[220px] py-1 px-2 align-top">
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-base font-bold text-foreground truncate max-w-[150px] md:max-w-none bg-blue-50/40 dark:bg-blue-950/20 px-1 rounded">
                                      {highlightSearchText(row.productName, swQuery)}
                                    </span>
                                    {(row.brand || row.color) && (
                                      <span className="text-sm font-semibold text-foreground truncate max-w-[200px] md:max-w-none">
                                        <span className="font-bold">Brand:</span> {highlightSearchText(row.brand || '-', swQuery)}
                                        {row.color && <> · <span className="font-bold">Color:</span> {highlightSearchText(row.color, swQuery)}</>}
                                      </span>
                                    )}
                                    {(row.category || row.department) && (
                                      <span className="text-sm font-semibold text-foreground truncate max-w-[200px] md:max-w-none">
                                        {row.category && <><span className="font-bold">Cat:</span> {highlightSearchText(row.category, swQuery)}</>}
                                        {row.category && row.department && ' · '}
                                        {row.department && <><span className="font-bold">Style:</span> {highlightSearchText(row.department, swQuery)}</>}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                {sizeWiseData.sizes.map(size => {
                                  const qty = row.sizeStocks[size] || 0;
                                  return (
                                    <TableCell
                                      key={size}
                                      className={cn(
                                        SIZEWISE_DATA_CELL,
                                        "font-medium snap-start",
                                        qty === 0
                                          ? "text-muted-foreground/50 bg-transparent"
                                          : "text-foreground bg-green-50/80 dark:bg-green-900/30",
                                      )}
                                    >
                                      {qty}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-center font-bold text-primary bg-primary/10 sticky right-0 backdrop-blur-sm min-w-[52px] md:min-w-[64px] px-2 py-1 text-base tabular-nums">
                                  {row.totalStock}
                                </TableCell>
                              </TableRow>
                              );
                            })}
                          </TableBody>
                          {sizeWiseData.rows.length > 0 && (
                            <TableFooter className={STOCK_TABLE_FOOTER}>
                              <TableRow>
                                <TableCell className="text-destructive font-bold sticky left-0 z-10 bg-slate-200 dark:bg-slate-700 min-w-[160px] md:min-w-[220px] px-2 py-1.5 align-middle text-xs">
                                  Total Stock
                                </TableCell>
                                {sizeWiseData.sizes.map(size => (
                                  <TableCell
                                    key={size}
                                    className={cn(
                                      SIZEWISE_FOOTER_CELL,
                                      "text-destructive bg-slate-200 dark:bg-slate-700",
                                    )}
                                  >
                                    {sizeWiseTotals.sizeTotals[size] || 0}
                                  </TableCell>
                                ))}
                                <TableCell className="text-center font-bold text-destructive bg-slate-300 dark:bg-slate-600 sticky right-0 backdrop-blur-sm min-w-[52px] md:min-w-[64px] px-2 py-1.5 text-xs tabular-nums">
                                  {sizeWiseTotals.grandTotal}
                                </TableCell>
                              </TableRow>
                            </TableFooter>
                          )}
                        </Table>
                    </div>
                    </>
                  )}
              </CardContent>
            </TabsContent>
        </Tabs>
        )}
      </Card>
      </div>
    </div>
  );
}
