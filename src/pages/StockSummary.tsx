import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  Filter,
  IndianRupee,
  Layers,
  Loader2,
  PackageX,
  Printer,
  RefreshCcw,
  Rows3,
  Scissors,
  Search,
  Tags,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type * as XLSXType from "xlsx";
import type jsPDFType from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useProductFieldSettings, type ProductFieldKey } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { colorSwatchesFor, isLightSwatch } from "@/lib/colorSwatch";
import {
  buildStockReportFilterOptions,
  buildStockReportRpcFilters,
  deriveStockReportFilterOptions,
  fetchLatestPurchaseSourceByVariantId,
  type StockReportRpcFilterInput,
  type StockReportRpcRow,
  type SupplierPair,
} from "@/lib/stockReportRpc";
import {
  buildStockSummaryArticles,
  countArticleStatuses,
  type ArticleSizeStatus,
  type StockSummaryArticle,
  type StockSummaryVariant,
} from "@/lib/stockSummaryArticles";
import { buildStockSummaryPdf, type PdfCell, type PdfColumn, type PdfKpi } from "@/lib/stockSummaryPdf";

/** Lazily loaded on export — keeps the xlsx bundle off this page's initial chunk. */
let xlsxModulePromise: Promise<typeof XLSXType> | null = null;
const loadXlsx = (): Promise<typeof XLSXType> => (xlsxModulePromise ??= import("xlsx"));
let jsPdfPromise: Promise<typeof jsPDFType> | null = null;
const loadJsPdf = (): Promise<typeof jsPDFType> => (jsPdfPromise ??= import("jspdf").then((m) => m.default));

const VARIANT_PAGE_SIZES = [50, 100, 200, 500] as const;
const ARTICLE_PAGE_SIZES = [25, 50, 100, 200] as const;
/** Same cap as Stock Report's Size-wise tab (get_stock_report in one call). */
const ARTICLE_FETCH_LIMIT = 10000;

type ViewMode = "variants" | "articles";
/** Stock qty filter: all, more than N, less than N (still in stock), or out of stock (0 or below). */
type StockQtyMode = "all" | "gt" | "lt" | "out";

/**
 * Map the stock qty filter onto get_stock_report's existing flags so totals and rows stay
 * identical to Stock Report: "gt N" = p_in_stock (stock > threshold N), "lt N" = p_low_stock_band
 * (0 < stock <= N - 1), "out" = p_low_stock (stock <= 0).
 */
function stockQtyToRpc(mode: StockQtyMode, value: number): { stockStatusFilter: string; threshold: number } {
  const n = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  if (mode === "gt") return { stockStatusFilter: "in", threshold: n };
  if (mode === "lt") return { stockStatusFilter: "low", threshold: Math.max(n - 1, 0) };
  if (mode === "out") return { stockStatusFilter: "out", threshold: 0 };
  return { stockStatusFilter: "all", threshold: 10 };
}
type ArticleStatusFilter = "all" | ArticleSizeStatus;

interface SummaryRow extends StockSummaryVariant {
  supplier_name: string;
  supplier_invoice_no: string;
}

interface Totals {
  totalStock: number;
  stockValue: number;
  saleValue: number;
  variantCount: number;
}

type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => ReturnType<typeof supabase.rpc>;
};
const rpcClient = supabase as unknown as RpcClient;

const REPORT_CACHE = {
  staleTime: 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false as const,
  refetchOnReconnect: false as const,
  placeholderData: keepPreviousData,
};

function toVariant(row: StockReportRpcRow): StockSummaryVariant {
  return {
    id: row.variant_id,
    product_name: row.product_name || "",
    brand: row.brand || "",
    category: row.category || "",
    style: row.style || "",
    color: row.color || "",
    size: row.size || "",
    barcode: row.barcode || "",
    uom: row.uom || "NOS",
    stock_qty: row.current_stock ?? 0,
    opening_qty: row.opening_qty ?? 0,
    purchase_qty: Number(row.purchase_qty ?? 0),
    purchase_return_qty: Number(row.purchase_return_qty ?? 0),
    sales_qty: Number(row.sales_qty ?? 0),
    sale_return_qty: Number(row.sale_return_qty ?? 0),
    sale_price: Number(row.sale_price ?? 0),
    pur_price: row.pur_price != null ? Number(row.pur_price) : null,
  };
}

/** Latest purchase supplier / invoice per variant, as a plain record (safe for the persisted cache). */
async function fetchSupplierRecord(
  orgId: string,
  variantIds: string[],
): Promise<Record<string, { supplier_name: string; supplier_invoice_no: string }>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  const out: Record<string, { supplier_name: string; supplier_invoice_no: string }> = {};
  const CHUNK = 400;
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  // Four chunks at a time; each chunk queries purchase_items in batches of 40.
  for (let i = 0; i < chunks.length; i += 4) {
    const maps = await Promise.all(
      chunks.slice(i, i + 4).map((c) => fetchLatestPurchaseSourceByVariantId(orgId, c)),
    );
    for (const m of maps) {
      m.forEach((value, key) => {
        out[key] = value;
      });
    }
  }
  return out;
}

async function fetchStockReportRows(
  filters: StockReportRpcFilterInput,
  limit: number,
  offset: number,
): Promise<StockReportRpcRow[]> {
  const { data, error } = await rpcClient.rpc("get_stock_report", {
    ...buildStockReportRpcFilters(filters),
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data || []) as unknown as StockReportRpcRow[];
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const qty = (n: number) => n.toLocaleString("en-IN");

function ColorChip({ name }: { name: string }) {
  const text = name.trim();
  if (!text) return <span className="text-slate-400">—</span>;
  const swatches = colorSwatchesFor(text);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {swatches.length > 0 && (
        <span className="inline-flex -space-x-1">
          {swatches.map((c) => (
            <span
              key={c}
              className={cn(
                "inline-block h-3.5 w-3.5 rounded-full ring-2 ring-white shadow-sm",
                isLightSwatch(c) && "border border-slate-300",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </span>
      )}
      <span className="font-semibold text-slate-700">{text}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: ArticleSizeStatus }) {
  const map: Record<ArticleSizeStatus, { label: string; cls: string }> = {
    full: { label: "Full set", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    cut: { label: "Cut size", cls: "bg-amber-50 text-amber-800 border-amber-300" },
    out: { label: "Out", cls: "bg-rose-50 text-rose-700 border-rose-200" },
    single: { label: "Single size", cls: "bg-slate-50 text-slate-600 border-slate-200" },
  };
  const m = map[status];
  return (
    <Badge variant="outline" className={cn("text-[11px] font-semibold px-2 py-0 h-5", m.cls)}>
      {m.label}
    </Badge>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: ReactNode;
  tone: string;
  loading?: boolean;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-xl px-3.5 py-2 text-white shadow-sm", tone)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/80">{label}</span>
        <span className="opacity-80">{icon}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-1 h-6 w-24 bg-white/30" />
      ) : (
        <div className="text-xl font-bold tabular-nums leading-tight">{value}</div>
      )}
      {sub && <div className="text-[10px] text-white/75 truncate">{sub}</div>}
    </div>
  );
}

const TH = "sticky top-0 z-10 bg-slate-800 text-white text-[11px] font-bold uppercase tracking-wide whitespace-nowrap px-3 py-2.5";
const TD = "px-3 py-1.5 align-middle whitespace-nowrap tabular-nums";

export default function StockSummary() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { orgNavigate } = useOrgNavigation();
  const queryClient = useQueryClient();
  const productFieldSettings = useProductFieldSettings();
  const fieldLabels = {
    brand: productFieldSettings.brand?.label || "Brand",
    category: productFieldSettings.category?.label || "Category",
    style: productFieldSettings.style?.label || "Style",
    color: productFieldSettings.color?.label || "Color",
  };
  const isOn = (key: ProductFieldKey) => productFieldSettings[key]?.enabled !== false;
  const showBrand = isOn("brand");
  const showCategory = isOn("category");
  const showStyle = isOn("style");
  const showColor = isOn("color");
  const [view, setView] = useState<ViewMode>("variants");
  const [searchDraft, setSearchDraft] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [productNameFilter, setProductNameFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [supplierInvoiceFilter, setSupplierInvoiceFilter] = useState("all");
  const [stockQtyMode, setStockQtyMode] = useState<StockQtyMode>("all");
  const [stockQtyValue, setStockQtyValue] = useState(0);
  const [variantPageSize, setVariantPageSize] = useState<number>(100);
  const [articlePageSize, setArticlePageSize] = useState<number>(50);
  const [variantPage, setVariantPage] = useState(1);
  const [articlePage, setArticlePage] = useState(1);
  const [byColor, setByColor] = useState(true);
  const [articleStatus, setArticleStatus] = useState<ArticleStatusFilter>("all");
  const [articleQuickFind, setArticleQuickFind] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { stockStatusFilter, threshold: lowStockThreshold } = stockQtyToRpc(stockQtyMode, stockQtyValue);
  const filterInput = useMemo((): StockReportRpcFilterInput | null => {
    if (!orgId) return null;
    return {
      orgId,
      searchTerm: appliedSearch,
      categoryFilter,
      brandFilter,
      stockStatusFilter,
      lowStockThreshold,
      departmentFilter,
      sizeFilter,
      colorFilter,
      productNameFilter,
      pinnedProducts: [],
      supplierFilter,
      supplierInvoiceFilter,
    };
  }, [
    orgId,
    appliedSearch,
    categoryFilter,
    brandFilter,
    stockStatusFilter,
    lowStockThreshold,
    departmentFilter,
    sizeFilter,
    colorFilter,
    productNameFilter,
    supplierFilter,
    supplierInvoiceFilter,
  ]);

  const hasFilters =
    !!appliedSearch.trim() ||
    !!productNameFilter ||
    [brandFilter, categoryFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter, stockStatusFilter].some(
      (f) => f !== "all",
    );

  // Reset paging whenever the filter set changes.
  useEffect(() => {
    setVariantPage(1);
    setArticlePage(1);
  }, [filterInput]);
  useEffect(() => {
    setArticlePage(1);
  }, [byColor, articleStatus, articleQuickFind, articlePageSize]);
  useEffect(() => {
    setVariantPage(1);
  }, [variantPageSize]);

  // ── Totals: same RPCs and cache keys as Stock Report, so both pages show the same figures ──
  const { data: globalTotals, isLoading: globalLoading } = useQuery({
    queryKey: ["stock-report-global-totals", orgId],
    queryFn: async (): Promise<Totals | null> => {
      if (!orgId) return null;
      const { data, error } = await supabase.rpc("get_stock_report_totals", { p_organization_id: orgId });
      if (error) throw error;
      const row = data as { total_stock?: number; stock_value?: number; sale_value?: number; variant_count?: number } | null;
      return {
        totalStock: row?.total_stock ?? 0,
        stockValue: Number(row?.stock_value ?? 0),
        saleValue: Number(row?.sale_value ?? 0),
        variantCount: row?.variant_count ?? 0,
      };
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
  });

  const { data: filteredTotals, isFetching: filteredFetching } = useQuery({
    // Same key shape as Stock Report (filters + hasSearched=true) so the cache is shared.
    queryKey: ["stock-report-filtered-totals", filterInput, true],
    queryFn: async (): Promise<Totals | null> => {
      if (!filterInput) return null;
      const { data, error } = await rpcClient.rpc(
        "get_stock_report_filtered_totals",
        buildStockReportRpcFilters(filterInput),
      );
      if (error) throw error;
      const row = data as { total_stock?: number; stock_value?: number; sale_value?: number; variant_count?: number } | null;
      return {
        totalStock: Number(row?.total_stock ?? 0),
        stockValue: Number(row?.stock_value ?? 0),
        saleValue: Number(row?.sale_value ?? 0),
        variantCount: Number(row?.variant_count ?? 0),
      };
    },
    enabled: !!filterInput && hasFilters,
    ...REPORT_CACHE,
  });

  const totals = hasFilters ? filteredTotals : globalTotals;
  const totalsLoading = hasFilters ? filteredFetching && !filteredTotals : globalLoading;

  // ── Filter dropdown options (same RPC + cascading rules as Stock Report) ──
  const { data: filterOptionsData } = useQuery({
    queryKey: ["stock-report-filter-options", orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await rpcClient.rpc("get_stock_report_filter_options", { p_org_id: orgId });
      if (error) throw error;
      const payload = data as {
        rawProducts?: Array<{ id: string; product_name: string; brand: string; category: string; style: string }>;
        variantRows?: Array<{ product_id: string; size: string | null; color: string | null }>;
        supplierPairs?: SupplierPair[];
      } | null;
      return buildStockReportFilterOptions({
        rawProducts: payload?.rawProducts ?? [],
        variantRows: payload?.variantRows ?? [],
        supplierPairs: payload?.supplierPairs ?? [],
      });
    },
    enabled: !!orgId,
    ...REPORT_CACHE,
    staleTime: 5 * 60 * 1000,
  });

  const options = useMemo(
    () =>
      deriveStockReportFilterOptions(
        filterOptionsData ?? { rawProducts: [], variantRows: [], supplierPairs: [] },
        {
          productNameFilter,
          brandFilter,
          categoryFilter,
          departmentFilter,
          sizeFilter,
          colorFilter,
          supplierFilter,
          supplierInvoiceFilter,
        },
      ),
    [filterOptionsData, productNameFilter, brandFilter, categoryFilter, departmentFilter, sizeFilter, colorFilter, supplierFilter, supplierInvoiceFilter],
  );

  // ── Variant list: get_stock_report one server page at a time ──
  const {
    data: variantPageData,
    isFetching: variantsFetching,
    error: variantsError,
  } = useQuery({
    queryKey: ["stock-summary-variants", filterInput, variantPage, variantPageSize],
    queryFn: async () => {
      if (!filterInput || !orgId) return { rows: [] as SummaryRow[], total: 0 };
      const rows = await fetchStockReportRows(filterInput, variantPageSize, (variantPage - 1) * variantPageSize);
      const suppliers = await fetchSupplierRecord(orgId, rows.map((r) => r.variant_id));
      return {
        total: Number(rows[0]?.total_rows ?? 0),
        rows: rows.map((r): SummaryRow => ({
          ...toVariant(r),
          supplier_name: suppliers[r.variant_id]?.supplier_name || "",
          supplier_invoice_no: suppliers[r.variant_id]?.supplier_invoice_no || "",
        })),
      };
    },
    enabled: !!filterInput && view === "variants",
    ...REPORT_CACHE,
  });

  // ── Article view: full match set (like Stock Report's Size-wise tab), grouped client-side ──
  const catalogTooBig = !hasFilters && (globalTotals?.variantCount ?? 0) > ARTICLE_FETCH_LIMIT;
  const {
    data: articleVariants,
    isFetching: articlesFetching,
    error: articlesError,
  } = useQuery({
    queryKey: ["stock-summary-articles", filterInput],
    queryFn: async () => {
      if (!filterInput) return { rows: [] as StockSummaryVariant[], total: 0 };
      const rows = await fetchStockReportRows(filterInput, ARTICLE_FETCH_LIMIT, 0);
      return { total: Number(rows[0]?.total_rows ?? 0), rows: rows.map(toVariant) };
    },
    enabled: !!filterInput && view === "articles" && !globalLoading && !catalogTooBig,
    ...REPORT_CACHE,
  });

  const articles = useMemo(
    () => buildStockSummaryArticles(articleVariants?.rows ?? [], { byColor }),
    [articleVariants, byColor],
  );
  const statusCounts = useMemo(() => countArticleStatuses(articles), [articles]);
  const visibleArticles = useMemo(() => {
    const tokens = articleQuickFind.toLowerCase().split(/\s+/).filter(Boolean);
    return articles.filter((a) => {
      if (articleStatus !== "all" && a.status !== articleStatus) return false;
      if (tokens.length === 0) return true;
      const hay = [a.productName, a.brand, a.category, a.style, ...a.colors, ...a.sizes.map((s) => s.size)]
        .join(" ")
        .toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [articles, articleStatus, articleQuickFind]);
  const articlePageCount = Math.max(1, Math.ceil(visibleArticles.length / articlePageSize));
  const pagedArticles = useMemo(
    () => visibleArticles.slice((articlePage - 1) * articlePageSize, articlePage * articlePageSize),
    [visibleArticles, articlePage],
  );
  const pagedArticleVariantIds = useMemo(() => pagedArticles.flatMap((a) => a.variantIds), [pagedArticles]);
  const { data: articleSuppliers } = useQuery({
    queryKey: ["stock-summary-article-suppliers", orgId, pagedArticleVariantIds],
    queryFn: () => fetchSupplierRecord(orgId!, pagedArticleVariantIds),
    enabled: !!orgId && view === "articles" && pagedArticleVariantIds.length > 0,
    ...REPORT_CACHE,
  });
  const supplierLabel = useCallback(
    (a: StockSummaryArticle) => {
      if (!articleSuppliers) return null;
      const names: string[] = [];
      const invoices: string[] = [];
      for (const id of a.variantIds) {
        const s = articleSuppliers[id];
        if (!s) continue;
        if (s.supplier_name && !names.includes(s.supplier_name)) names.push(s.supplier_name);
        if (s.supplier_invoice_no && !invoices.includes(s.supplier_invoice_no)) invoices.push(s.supplier_invoice_no);
      }
      return { names, invoices };
    },
    [articleSuppliers],
  );

  const variantRows = variantPageData?.rows ?? [];
  const variantTotal = variantPageData?.total ?? 0;
  const variantPageCount = Math.max(1, Math.ceil(variantTotal / variantPageSize));
  const variantPageTotals = useMemo(() => {
    const t = { opening: 0, purchase: 0, purReturn: 0, sales: 0, saleReturn: 0, stock: 0, stockValue: 0, saleValue: 0 };
    for (const r of variantRows) {
      t.opening += r.opening_qty;
      t.purchase += r.purchase_qty;
      t.purReturn += r.purchase_return_qty;
      t.sales += r.sales_qty;
      t.saleReturn += r.sale_return_qty;
      t.stock += r.stock_qty;
      t.stockValue += (r.pur_price || 0) * r.stock_qty;
      t.saleValue += r.sale_price * r.stock_qty;
    }
    return t;
  }, [variantRows]);
  const articleTotals = useMemo(() => {
    let stock = 0;
    let stockValue = 0;
    let saleValue = 0;
    for (const a of visibleArticles) {
      stock += a.totalStock;
      stockValue += a.stockValue;
      saleValue += a.saleValue;
    }
    return { stock, stockValue, saleValue };
  }, [visibleArticles]);

  const applySearch = () => setAppliedSearch(searchDraft.trim());
  const clearFilters = () => {
    setSearchDraft("");
    setAppliedSearch("");
    setProductNameFilter("");
    setBrandFilter("all");
    setCategoryFilter("all");
    setDepartmentFilter("all");
    setSizeFilter("all");
    setColorFilter("all");
    setSupplierFilter("all");
    setSupplierInvoiceFilter("all");
    setStockQtyMode("all");
    setStockQtyValue(0);
    setArticleStatus("all");
    setArticleQuickFind("");
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["stock-report-global-totals", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["stock-report-filtered-totals"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-report-filter-options", orgId] });
    void queryClient.invalidateQueries({ queryKey: ["stock-summary-variants"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-summary-articles"] });
    void queryClient.invalidateQueries({ queryKey: ["stock-summary-article-suppliers"] });
  };

  // Active filter chips
  const chips: Array<{ label: string; clear: () => void }> = [];
  if (appliedSearch) chips.push({ label: `Search: ${appliedSearch}`, clear: () => { setSearchDraft(""); setAppliedSearch(""); } });
  if (productNameFilter) chips.push({ label: `Product: ${productNameFilter}`, clear: () => setProductNameFilter("") });
  if (brandFilter !== "all") chips.push({ label: `${fieldLabels.brand}: ${brandFilter}`, clear: () => setBrandFilter("all") });
  if (categoryFilter !== "all") chips.push({ label: `${fieldLabels.category}: ${categoryFilter}`, clear: () => setCategoryFilter("all") });
  if (departmentFilter !== "all") chips.push({ label: `${fieldLabels.style}: ${departmentFilter}`, clear: () => setDepartmentFilter("all") });
  if (sizeFilter !== "all") chips.push({ label: `Size: ${sizeFilter}`, clear: () => setSizeFilter("all") });
  if (colorFilter !== "all") chips.push({ label: `${fieldLabels.color}: ${colorFilter}`, clear: () => setColorFilter("all") });
  if (supplierFilter !== "all") chips.push({ label: `Supplier: ${supplierFilter}`, clear: () => setSupplierFilter("all") });
  if (supplierInvoiceFilter !== "all") chips.push({ label: `Invoice: ${supplierInvoiceFilter}`, clear: () => setSupplierInvoiceFilter("all") });
  if (stockQtyMode !== "all")
    chips.push({
      label: stockQtyMode === "out" ? "Stock: 0 or less" : `Stock ${stockQtyMode === "gt" ? ">" : "<"} ${stockQtyValue}`,
      clear: () => setStockQtyMode("all"),
    });

  // ── Export / print ──
  const exportExcel = async () => {
    if (!filterInput || !orgId) return;
    setExporting(true);
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.utils.book_new();
      const stamp = format(new Date(), "yyyy-MM-dd");
      if (view === "articles") {
        const allSuppliers = await fetchSupplierRecord(orgId, visibleArticles.flatMap((a) => a.variantIds));
        const header = [
          "Sr No", "Supplier", "Supplier Invoice", "Product",
          ...(showBrand ? [fieldLabels.brand] : []),
          ...(showCategory ? [fieldLabels.category] : []),
          ...(showStyle ? [fieldLabels.style] : []),
          ...(showColor ? [fieldLabels.color] : []),
          "Size-wise stock", "Cut sizes", "Sizes in stock", "Total Stock", "Stock Value", "Sale Value", "Status",
        ];
        const body = visibleArticles.map((a, i) => {
          const names = [...new Set(a.variantIds.map((id) => allSuppliers[id]?.supplier_name).filter(Boolean))];
          const invs = [...new Set(a.variantIds.map((id) => allSuppliers[id]?.supplier_invoice_no).filter(Boolean))];
          return [
            i + 1, names.join(", "), invs.join(", "), a.productName,
            ...(showBrand ? [a.brand] : []),
            ...(showCategory ? [a.category] : []),
            ...(showStyle ? [a.style] : []),
            ...(showColor ? [a.colors.join(", ")] : []),
            a.sizes.map((s) => `${s.size}:${s.qty}`).join("  "),
            a.cutSizes.join(", "),
            `${a.inStockSizes.length}/${a.sizes.length}`,
            a.totalStock, Math.round(a.stockValue), Math.round(a.saleValue),
            { full: "Full set", cut: "Cut size", out: "Out", single: "Single size" }[a.status],
          ];
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), "Article Summary");
        XLSX.writeFile(wb, `Stock_Summary_Articles_${stamp}.xlsx`);
      } else {
        const rpcRows = await fetchStockReportRows(filterInput, ARTICLE_FETCH_LIMIT, 0);
        const suppliers = await fetchSupplierRecord(orgId, rpcRows.map((r) => r.variant_id));
        const header = [
          "Sr No", "Supplier", "Supplier Invoice", "Product",
          ...(showBrand ? [fieldLabels.brand] : []),
          ...(showCategory ? [fieldLabels.category] : []),
          "Size",
          ...(showColor ? [fieldLabels.color] : []),
          ...(showStyle ? [fieldLabels.style] : []),
          "Barcode", "Opening Qty", "Purchase Qty", "Pur Return", "Sales Qty", "Sale Return", "Current Stock",
          "Pur Price", "Stock Value", "Sale Price",
        ];
        const body = rpcRows.map((r, i) => {
          const v = toVariant(r);
          return [
            i + 1, suppliers[v.id]?.supplier_name || "", suppliers[v.id]?.supplier_invoice_no || "", v.product_name,
            ...(showBrand ? [v.brand] : []),
            ...(showCategory ? [v.category] : []),
            v.size,
            ...(showColor ? [v.color] : []),
            ...(showStyle ? [v.style] : []),
            v.barcode, v.opening_qty, v.purchase_qty, v.purchase_return_qty, v.sales_qty, v.sale_return_qty, v.stock_qty,
            v.pur_price || 0, Math.round((v.pur_price || 0) * v.stock_qty), v.sale_price,
          ];
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), "Stock Summary");
        XLSX.writeFile(wb, `Stock_Summary_${stamp}.xlsx`);
        if (Number(rpcRows[0]?.total_rows ?? 0) > rpcRows.length) {
          toast.warning(`Exported first ${qty(rpcRows.length)} variants`, {
            description: "Narrow the filters to export the rest.",
          });
        }
      }
    } catch (err: unknown) {
      toast.error("Excel export failed", { description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setExporting(false);
    }
  };

  const exportPdf = async () => {
    if (!filterInput || !orgId) return;
    setExportingPdf(true);
    try {
      const JsPdf = await loadJsPdf();
      const stamp = format(new Date(), "yyyy-MM-dd");
      const num = (n: number) => Math.round(n).toLocaleString("en-IN");
      const kpis: PdfKpi[] = [
        { label: hasFilters ? "Stock (filtered)" : "Total stock", value: num(totals?.totalStock ?? 0), fill: [37, 99, 235] },
        { label: "Stock value (cost)", value: `Rs ${num(totals?.stockValue ?? 0)}`, fill: [234, 88, 12] },
        { label: "Sale value", value: `Rs ${num(totals?.saleValue ?? 0)}`, fill: [5, 150, 105] },
        { label: "Variants", value: num(totals?.variantCount ?? 0), fill: [139, 92, 246] },
      ];
      const base = {
        orgName: currentOrganization?.name || "",
        generatedAt: format(new Date(), "dd MMM yyyy, hh:mm a"),
        filters: chips.map((c) => c.label),
        kpis,
      };
      let doc;
      if (view === "articles") {
        const allSuppliers = await fetchSupplierRecord(orgId, visibleArticles.flatMap((a) => a.variantIds));
        const columns: PdfColumn[] = [
          { header: "#", weight: 3, align: "center", text: [100, 116, 139] },
          { header: "Supplier", weight: 13 },
          { header: "Product", weight: 12, bold: true },
          ...(showBrand ? [{ header: fieldLabels.brand, weight: 8, bold: true }] : []),
          ...(showCategory ? [{ header: fieldLabels.category, weight: 7 }] : []),
          ...(showStyle ? [{ header: fieldLabels.style, weight: 7 }] : []),
          ...(showColor ? [{ header: fieldLabels.color, weight: 10 }] : []),
          { header: "Size-wise stock", weight: 32 },
          { header: "Sizes", weight: 5, align: "center" },
          { header: "Stock", weight: 6, align: "right", head: [109, 40, 217], tint: [245, 243, 255], text: [76, 29, 149], bold: true },
          { header: "Stock value", weight: 9, align: "right", text: [67, 56, 202] },
          { header: "Sale value", weight: 9, align: "right" },
          { header: "Status", weight: 7, bold: true },
        ];
        const statusBadge: Record<ArticleSizeStatus, PdfCell> = {
          full: { badge: "Full set", fill: [209, 250, 229], text: [4, 120, 87] },
          cut: { badge: "Cut size", fill: [254, 243, 199], text: [146, 64, 14] },
          out: { badge: "Out", fill: [255, 228, 230], text: [190, 18, 60] },
          single: { badge: "Single size", fill: [241, 245, 249], text: [71, 85, 105] },
        };
        const rows: PdfCell[][] = visibleArticles.map((a, i) => {
          const names = [...new Set(a.variantIds.map((id) => allSuppliers[id]?.supplier_name).filter(Boolean))];
          return [
            i + 1,
            names.join(", ") || "—",
            a.productName,
            ...(showBrand ? [a.brand || "—"] : []),
            ...(showCategory ? [a.category || "—"] : []),
            ...(showStyle ? [a.style || "—"] : []),
            ...(showColor ? [{ color: a.colors.join(" / ") }] : []),
            { sizes: a.sizes.map((s) => ({ size: s.size, qty: s.qty })) },
            `${a.inStockSizes.length}/${a.sizes.length}`,
            num(a.totalStock),
            num(a.stockValue),
            num(a.saleValue),
            statusBadge[a.status],
          ];
        });
        const lead = 3 + (showBrand ? 1 : 0) + (showCategory ? 1 : 0) + (showStyle ? 1 : 0) + (showColor ? 1 : 0);
        const totalRow: PdfCell[] = [
          "", "", `TOTAL · ${num(visibleArticles.length)} ARTICLES`,
          ...Array.from({ length: lead - 3 }, () => ""),
          "", "",
          num(articleTotals.stock), num(articleTotals.stockValue), num(articleTotals.saleValue), "",
        ];
        doc = buildStockSummaryPdf(JsPdf, { ...base, title: "Stock Summary · Article & cut size", columns, rows, totalRow });
        doc.save(`Stock_Summary_Articles_${stamp}.pdf`);
      } else {
        const rpcRows = await fetchStockReportRows(filterInput, ARTICLE_FETCH_LIMIT, 0);
        const suppliers = await fetchSupplierRecord(orgId, rpcRows.map((r) => r.variant_id));
        const columns: PdfColumn[] = [
          { header: "Sr", weight: 3, align: "center", text: [100, 116, 139] },
          { header: "Supplier", weight: 11 },
          { header: "Invoice", weight: 8 },
          { header: "Product", weight: 9, bold: true },
          ...(showBrand ? [{ header: fieldLabels.brand, weight: 6, bold: true }] : []),
          ...(showCategory ? [{ header: fieldLabels.category, weight: 5 }] : []),
          { header: "Size", weight: 4, bold: true },
          ...(showColor ? [{ header: fieldLabels.color, weight: 8 }] : []),
          ...(showStyle ? [{ header: fieldLabels.style, weight: 5 }] : []),
          { header: "Barcode", weight: 8, bold: true },
          { header: "Opening", weight: 4.5, align: "right", head: [30, 58, 138], tint: [239, 246, 255] },
          { header: "Purchase", weight: 4.5, align: "right", head: [20, 83, 45], tint: [240, 253, 244], text: [21, 128, 61] },
          { header: "Pur Ret", weight: 4.5, align: "right", head: [124, 45, 18], tint: [255, 247, 237], text: [194, 65, 12] },
          { header: "Sales", weight: 4.5, align: "right", head: [127, 29, 29], tint: [254, 242, 242], text: [185, 28, 28] },
          { header: "Sale Ret", weight: 4.5, align: "right", head: [6, 78, 59], tint: [236, 253, 245], text: [4, 120, 87] },
          { header: "Stock", weight: 4.5, align: "right", head: [109, 40, 217], tint: [245, 243, 255], text: [76, 29, 149], bold: true },
          { header: "Pur Price", weight: 5, align: "right" },
          { header: "Stock Value", weight: 6.5, align: "right", text: [67, 56, 202] },
          { header: "Sale Price", weight: 5, align: "right" },
        ];
        const t = { opening: 0, purchase: 0, purReturn: 0, sales: 0, saleReturn: 0, stock: 0, stockValue: 0 };
        const rows: PdfCell[][] = rpcRows.map((r, i) => {
          const v = toVariant(r);
          const value = (v.pur_price || 0) * v.stock_qty;
          t.opening += v.opening_qty;
          t.purchase += v.purchase_qty;
          t.purReturn += v.purchase_return_qty;
          t.sales += v.sales_qty;
          t.saleReturn += v.sale_return_qty;
          t.stock += v.stock_qty;
          t.stockValue += value;
          return [
            i + 1,
            suppliers[v.id]?.supplier_name || "—",
            suppliers[v.id]?.supplier_invoice_no || "—",
            v.product_name,
            ...(showBrand ? [v.brand || "—"] : []),
            ...(showCategory ? [v.category || "—"] : []),
            v.size || "—",
            ...(showColor ? [{ color: v.color }] : []),
            ...(showStyle ? [v.style || "—"] : []),
            v.barcode,
            v.opening_qty,
            `+${v.purchase_qty}`,
            v.purchase_return_qty > 0 ? `-${v.purchase_return_qty}` : "0",
            v.sales_qty > 0 ? `-${v.sales_qty}` : "0",
            v.sale_return_qty > 0 ? `+${v.sale_return_qty}` : "0",
            v.stock_qty,
            v.pur_price ? num(v.pur_price) : "-",
            v.pur_price ? num(value) : "-",
            num(v.sale_price),
          ];
        });
        const lead = 6 + (showBrand ? 1 : 0) + (showCategory ? 1 : 0) + (showColor ? 1 : 0) + (showStyle ? 1 : 0);
        const totalRow: PdfCell[] = [
          "", "", "", `TOTAL · ${num(rpcRows.length)}`,
          ...Array.from({ length: lead - 4 }, () => ""),
          num(t.opening), `+${num(t.purchase)}`, `-${num(t.purReturn)}`, `-${num(t.sales)}`, `+${num(t.saleReturn)}`,
          num(t.stock), "", num(t.stockValue), "",
        ];
        const capped = Number(rpcRows[0]?.total_rows ?? 0) > rpcRows.length;
        doc = buildStockSummaryPdf(JsPdf, {
          ...base,
          title: "Stock Summary · Variant list",
          columns,
          rows,
          totalRow,
          note: capped ? `First ${num(rpcRows.length)} variants, narrow the filters for the rest` : undefined,
        });
        doc.save(`Stock_Summary_${stamp}.pdf`);
        if (capped) {
          toast.warning(`PDF has the first ${qty(rpcRows.length)} variants`, { description: "Narrow the filters to export the rest." });
        }
      }
    } catch (err: unknown) {
      toast.error("PDF export failed", { description: err instanceof Error ? err.message : "Try again." });
    } finally {
      setExportingPdf(false);
    }
  };

  const printView = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (s: string | number) =>
      String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
    let head = "";
    let rows = "";
    if (view === "articles") {
      head = `<tr><th>#</th><th>Product</th>${showBrand ? `<th>${esc(fieldLabels.brand)}</th>` : ""}${showColor ? `<th>${esc(fieldLabels.color)}</th>` : ""}<th>Size-wise stock</th><th>Cut sizes</th><th>Total</th><th>Status</th></tr>`;
      rows = visibleArticles
        .map(
          (a, i) =>
            `<tr><td>${i + 1}</td><td>${esc(a.productName)}</td>${showBrand ? `<td>${esc(a.brand)}</td>` : ""}${showColor ? `<td>${esc(a.colors.join(", "))}</td>` : ""}<td>${a.sizes.map((s) => `${esc(s.size)}:<b>${s.qty}</b>`).join(" &nbsp; ")}</td><td>${esc(a.cutSizes.join(", "))}</td><td style="text-align:right">${a.totalStock}</td><td>${esc(a.status)}</td></tr>`,
        )
        .join("");
    } else {
      head = `<tr><th>#</th><th>Supplier</th><th>Invoice</th><th>Product</th>${showBrand ? `<th>${esc(fieldLabels.brand)}</th>` : ""}<th>Size</th>${showColor ? `<th>${esc(fieldLabels.color)}</th>` : ""}<th>Barcode</th><th>Stock</th><th>Pur Price</th><th>Sale Price</th></tr>`;
      rows = variantRows
        .map(
          (r, i) =>
            `<tr><td>${(variantPage - 1) * variantPageSize + i + 1}</td><td>${esc(r.supplier_name)}</td><td>${esc(r.supplier_invoice_no)}</td><td>${esc(r.product_name)}</td>${showBrand ? `<td>${esc(r.brand)}</td>` : ""}<td>${esc(r.size)}</td>${showColor ? `<td>${esc(r.color)}</td>` : ""}<td>${esc(r.barcode)}</td><td style="text-align:right">${r.stock_qty}</td><td style="text-align:right">${r.pur_price ?? ""}</td><td style="text-align:right">${r.sale_price}</td></tr>`,
        )
        .join("");
    }
    w.document.write(`<!doctype html><html><head><title>Stock Summary</title><style>
      body{font-family:Arial,sans-serif;font-size:11px;margin:16px}h2{margin:0 0 4px}p{margin:0 0 10px;color:#555}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#1e293b;color:#fff}
    </style></head><body><h2>Stock Summary — ${esc(currentOrganization?.name || "")}</h2>
    <p>${format(new Date(), "dd MMM yyyy, hh:mm a")} · Total stock ${qty(totals?.totalStock ?? 0)} · Stock value ${inr(totals?.stockValue ?? 0)} · Sale value ${inr(totals?.saleValue ?? 0)}</p>
    <table><thead>${head}</thead><tbody>${rows}</tbody></table></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const loadError = (view === "variants" ? variantsError : articlesError) as Error | null;
  const busy = view === "variants" ? variantsFetching : articlesFetching;

  const filterField = (label: string, node: ReactNode) => (
    <div className="space-y-1 min-w-0">
      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</label>
      {node}
    </div>
  );

  return (
    <div className="stock-summary-page relative flex h-full min-h-0 w-full flex-col gap-2 overflow-hidden bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 px-2 py-2 sm:px-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" className="h-9 px-3 shrink-0" onClick={() => orgNavigate("/reports")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Reports
          </Button>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md">
              <Boxes className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">Stock Summary</h1>
              <p className="text-xs text-slate-500 mt-1 truncate">
                Live stock by article, size and colour · same figures as Stock Report
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={refresh} disabled={!orgId}>
            <RefreshCcw className={cn("h-4 w-4", busy && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => void exportExcel()} disabled={exporting || !orgId}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            Excel
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-gradient-to-r from-rose-600 to-fuchsia-600 text-white hover:from-rose-700 hover:to-fuchsia-700"
            onClick={() => void exportPdf()}
            disabled={exportingPdf || !orgId || (view === "articles" && catalogTooBig)}
          >
            {exportingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            PDF
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={printView}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 shrink-0">
        <KpiCard
          label={hasFilters ? "Stock (filtered)" : "Total Stock"}
          value={qty(totals?.totalStock ?? 0)}
          sub="Units on hand"
          icon={<Boxes className="h-5 w-5" />}
          tone="bg-gradient-to-br from-blue-600 to-indigo-600"
          loading={totalsLoading}
        />
        <KpiCard
          label="Stock Value (Cost)"
          value={inr(totals?.stockValue ?? 0)}
          sub="At purchase price"
          icon={<IndianRupee className="h-5 w-5" />}
          tone="bg-gradient-to-br from-amber-500 to-orange-600"
          loading={totalsLoading}
        />
        <KpiCard
          label="Sale Value"
          value={inr(totals?.saleValue ?? 0)}
          sub="At selling price"
          icon={<Tags className="h-5 w-5" />}
          tone="bg-gradient-to-br from-emerald-500 to-teal-600"
          loading={totalsLoading}
        />
        <KpiCard
          label="Variants"
          value={qty(totals?.variantCount ?? 0)}
          sub={hasFilters ? "Matching filters" : "Active barcodes"}
          icon={<Layers className="h-5 w-5" />}
          tone="bg-gradient-to-br from-violet-600 to-fuchsia-600"
          loading={totalsLoading}
        />
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm shrink-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-[280px] xl:w-[320px] shrink-0">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
              placeholder="Search name, brand, barcode, supplier…"
              className="h-9 pl-9 uppercase placeholder:normal-case"
            />
          </div>
          <Button size="sm" className="h-9 gap-1.5 bg-indigo-600 hover:bg-indigo-700" onClick={applySearch}>
            <Search className="h-4 w-4" />
            Search
          </Button>
          {(hasFilters || searchDraft) && (
            <Button size="sm" variant="ghost" className="h-9 gap-1 text-slate-600" onClick={clearFilters}>
              <X className="h-4 w-4" />
              Clear all
            </Button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => setView("variants")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                  view === "variants" ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <Rows3 className="h-4 w-4" />
                Variant list
              </button>
              <button
                type="button"
                onClick={() => setView("articles")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition",
                  view === "articles" ? "bg-indigo-600 text-white shadow" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <Scissors className="h-4 w-4" />
                Article & cut size
              </button>
            </div>
            {!(view === "articles" && catalogTooBig) && (
              <RowsControl
                pageSize={view === "variants" ? variantPageSize : articlePageSize}
                pageSizes={view === "variants" ? VARIANT_PAGE_SIZES : ARTICLE_PAGE_SIZES}
                onPageSize={view === "variants" ? setVariantPageSize : setArticlePageSize}
                label={view === "variants" ? `${qty(variantTotal)} variants` : `${qty(visibleArticles.length)} articles`}
                busy={view === "variants" ? variantsFetching : articlesFetching}
              />
            )}
            {!(view === "articles" && catalogTooBig) && (
              <Pager
                page={view === "variants" ? variantPage : articlePage}
                pageCount={view === "variants" ? variantPageCount : articlePageCount}
                onPage={view === "variants" ? setVariantPage : setArticlePage}
              />
            )}
          </div>
          {chips.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              {chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={c.clear}
                  className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
                >
                  {c.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10">
          {filterField(
            "Product",
            <SearchableSelect
              value={productNameFilter || "all"}
              onValueChange={(v) => setProductNameFilter(v === "all" ? "" : v)}
              options={options.productNames}
              allLabel="All Products"
              placeholder="All Products"
            />,
          )}
          {showBrand &&
            filterField(
              fieldLabels.brand,
              <SearchableSelect value={brandFilter} onValueChange={setBrandFilter} options={options.brands} allLabel={`All ${fieldLabels.brand}`} placeholder={`All ${fieldLabels.brand}`} />,
            )}
          {showCategory &&
            filterField(
              fieldLabels.category,
              <SearchableSelect value={categoryFilter} onValueChange={setCategoryFilter} options={options.categories} allLabel={`All ${fieldLabels.category}`} placeholder={`All ${fieldLabels.category}`} />,
            )}
          {showStyle &&
            filterField(
              fieldLabels.style,
              <SearchableSelect value={departmentFilter} onValueChange={setDepartmentFilter} options={options.departments} allLabel={`All ${fieldLabels.style}`} placeholder={`All ${fieldLabels.style}`} />,
            )}
          {filterField(
            "Size",
            <SearchableSelect value={sizeFilter} onValueChange={setSizeFilter} options={options.sizes} allLabel="All Sizes" placeholder="All Sizes" />,
          )}
          {showColor &&
            filterField(
              fieldLabels.color,
              <SearchableSelect value={colorFilter} onValueChange={setColorFilter} options={options.colors} allLabel={`All ${fieldLabels.color}`} placeholder={`All ${fieldLabels.color}`} />,
            )}
          {filterField(
            "Supplier",
            <SearchableSelect value={supplierFilter} onValueChange={setSupplierFilter} options={options.suppliers} allLabel="All Suppliers" placeholder="All Suppliers" />,
          )}
          {filterField(
            "Supplier Invoice",
            <SearchableSelect value={supplierInvoiceFilter} onValueChange={setSupplierInvoiceFilter} options={options.supplierInvoices} allLabel="All Invoices" placeholder="All Invoices" />,
          )}
          {filterField(
            "Stock Qty",
            <div className="flex gap-1">
              <Select
                value={stockQtyMode}
                onValueChange={(v) => {
                  const mode = v as StockQtyMode;
                  setStockQtyMode(mode);
                  if (mode === "lt" && stockQtyValue < 2) setStockQtyValue(5);
                }}
              >
                <SelectTrigger className="h-8 bg-white min-w-0 flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stock</SelectItem>
                  <SelectItem value="gt">Greater than</SelectItem>
                  <SelectItem value="lt">Less than (in stock)</SelectItem>
                  <SelectItem value="out">0 or less</SelectItem>
                </SelectContent>
              </Select>
              {(stockQtyMode === "gt" || stockQtyMode === "lt") && (
                <Input
                  type="number"
                  min={0}
                  value={stockQtyValue}
                  onChange={(e) => setStockQtyValue(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="h-8 w-16 px-2 text-center tabular-nums"
                  aria-label="Stock quantity"
                />
              )}
            </div>,
          )}
        </div>
      </div>

      {/* Article view tools */}
      {view === "articles" && !catalogTooBig && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "All", statusCounts.all, "border-slate-300 text-slate-700", "bg-slate-800 text-white border-slate-800"],
            ["cut", "Cut size", statusCounts.cut, "border-amber-300 text-amber-800", "bg-amber-500 text-white border-amber-500"],
            ["full", "Full set", statusCounts.full, "border-emerald-300 text-emerald-700", "bg-emerald-600 text-white border-emerald-600"],
            ["out", "Out", statusCounts.out, "border-rose-300 text-rose-700", "bg-rose-600 text-white border-rose-600"],
            ["single", "Single size", statusCounts.single, "border-slate-300 text-slate-600", "bg-slate-600 text-white border-slate-600"],
          ] as const
        ).map(([key, label, count, idle, active]) => (
          <button
            key={key}
            type="button"
            onClick={() => setArticleStatus(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-semibold transition",
              articleStatus === key ? active : idle,
            )}
          >
            {key === "cut" && <Scissors className="h-3.5 w-3.5" />}
            {key === "full" && <CheckCircle2 className="h-3.5 w-3.5" />}
            {key === "out" && <PackageX className="h-3.5 w-3.5" />}
            {label}
            <span className="tabular-nums opacity-80">{qty(count)}</span>
          </button>
        ))}
        {showColor && (
          <label className="ml-1 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            <Switch checked={byColor} onCheckedChange={setByColor} className="scale-75" />
            Split by {fieldLabels.color.toLowerCase()}
          </label>
        )}
      </div>
        </div>
      )}

      {/* Table card */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loadError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
            <AlertTriangle className="h-8 w-8 text-rose-500" />
            <p className="font-semibold text-slate-800">Could not load stock</p>
            <p className="text-sm text-slate-500 max-w-md">{loadError.message}. Try a narrower filter, then Refresh.</p>
          </div>
        ) : view === "articles" ? (
          catalogTooBig ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <Filter className="h-8 w-8 text-indigo-500" />
              <p className="font-semibold text-slate-800">Pick a filter to see articles and cut sizes</p>
              <p className="text-sm text-slate-500 max-w-md">
                This shop has {qty(globalTotals?.variantCount ?? 0)} variants. Choose a {fieldLabels.brand.toLowerCase()},{" "}
                {fieldLabels.category.toLowerCase()}, supplier or product above, or use the Variant list.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={articleQuickFind}
                    onChange={(e) => setArticleQuickFind(e.target.value)}
                    placeholder="Quick find in these articles…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {articlesFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />}
                  <span className="tabular-nums">
                    {qty(visibleArticles.length)} articles · {qty(articleVariants?.rows.length ?? 0)} variants
                  </span>
                  {(articleVariants?.total ?? 0) > (articleVariants?.rows.length ?? 0) && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      First {qty(articleVariants?.rows.length ?? 0)} of {qty(articleVariants?.total ?? 0)} — narrow the filters
                    </span>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className={cn(TH, "w-12 text-center")}>#</th>
                      <th className={TH}>Supplier</th>
                      <th className={TH}>Product</th>
                      {showBrand && <th className={TH}>{fieldLabels.brand}</th>}
                      {showCategory && <th className={TH}>{fieldLabels.category}</th>}
                      {showStyle && <th className={TH}>{fieldLabels.style}</th>}
                      {showColor && <th className={TH}>{fieldLabels.color}</th>}
                      <th className={cn(TH, "min-w-[260px]")}>Size-wise stock</th>
                      <th className={cn(TH, "text-center")}>Sizes</th>
                      <th className={cn(TH, "text-right bg-violet-700")}>Stock</th>
                      <th className={cn(TH, "text-right")}>Stock Value</th>
                      <th className={cn(TH, "text-right")}>Sale Value</th>
                      <th className={TH}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {articlesFetching && articles.length === 0 ? (
                      Array.from({ length: 8 }, (_, i) => (
                        <tr key={i}>
                          <td colSpan={13} className="px-3 py-2">
                            <Skeleton className="h-6 w-full" />
                          </td>
                        </tr>
                      ))
                    ) : pagedArticles.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="py-12 text-center text-slate-500">
                          No articles match these filters
                        </td>
                      </tr>
                    ) : (
                      pagedArticles.map((a, i) => {
                        const sup = supplierLabel(a);
                        return (
                          <tr
                            key={a.key}
                            className={cn(
                              "border-b border-slate-100 hover:bg-indigo-50/40",
                              a.status === "cut" && "bg-amber-50/30",
                            )}
                          >
                            <td className={cn(TD, "text-center text-xs text-slate-400")}>{(articlePage - 1) * articlePageSize + i + 1}</td>
                            <td className={cn(TD, "text-xs text-slate-600 max-w-[180px]")}>
                              {sup === null ? (
                                <Skeleton className="h-4 w-20" />
                              ) : sup.names.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="flex flex-col leading-tight">
                                  <span className="truncate font-medium">
                                    {sup.names[0]}
                                    {sup.names.length > 1 && <span className="text-slate-400"> +{sup.names.length - 1}</span>}
                                  </span>
                                  {sup.invoices.length > 0 && (
                                    <span className="truncate font-mono text-[10px] text-slate-400">
                                      Inv {sup.invoices.slice(0, 2).join(", ")}
                                      {sup.invoices.length > 2 && ` +${sup.invoices.length - 2}`}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className={cn(TD, "font-bold text-slate-900")}>{a.productName}</td>
                            {showBrand && <td className={cn(TD, "font-semibold text-slate-700")}>{a.brand || "—"}</td>}
                            {showCategory && <td className={cn(TD, "text-slate-600")}>{a.category || "—"}</td>}
                            {showStyle && <td className={cn(TD, "text-slate-600")}>{a.style || "—"}</td>}
                            {showColor && (
                              <td className={TD}>
                                {a.colors.length === 0 ? (
                                  <span className="text-slate-400">—</span>
                                ) : (
                                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                                    {a.colors.slice(0, 3).map((c) => (
                                      <ColorChip key={c} name={c} />
                                    ))}
                                    {a.colors.length > 3 && <span className="text-xs text-slate-400">+{a.colors.length - 3}</span>}
                                  </div>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-1.5 align-middle">
                              <div className="flex flex-wrap gap-1">
                                {a.sizes.map((s) => (
                                  <span
                                    key={s.size}
                                    className={cn(
                                      "inline-flex min-w-[46px] items-stretch overflow-hidden rounded-md border text-xs font-semibold",
                                      s.qty > 0
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                        : "border-rose-300 bg-rose-50 text-rose-700 border-dashed",
                                    )}
                                    title={s.qty > 0 ? `${s.size}: ${s.qty} in stock` : `${s.size}: cut (${s.qty})`}
                                  >
                                    <span className={cn("px-1.5 py-0.5", s.qty > 0 ? "bg-emerald-100" : "bg-rose-100 line-through")}>{s.size}</span>
                                    <span className="px-1.5 py-0.5 tabular-nums">{s.qty}</span>
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className={cn(TD, "text-center text-xs")}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    className={cn(
                                      "inline-block rounded-full px-2 py-0.5 font-bold",
                                      a.status === "full" ? "bg-emerald-100 text-emerald-800" : a.status === "cut" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600",
                                    )}
                                  >
                                    {a.inStockSizes.length}/{a.sizes.length}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {a.cutSizes.length > 0 ? `Cut: ${a.cutSizes.join(", ")}` : "All sizes in stock"}
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className={cn(TD, "text-right text-base font-bold text-violet-800 bg-violet-50/70")}>{qty(a.totalStock)}</td>
                            <td className={cn(TD, "text-right text-slate-700")}>{inr(a.stockValue)}</td>
                            <td className={cn(TD, "text-right text-slate-700")}>{inr(a.saleValue)}</td>
                            <td className={TD}>
                              <StatusBadge status={a.status} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {visibleArticles.length > 0 && (
                    <tfoot>
                      <tr className="sticky bottom-0 bg-amber-100 font-extrabold">
                        <td colSpan={3 + (showBrand ? 1 : 0) + (showCategory ? 1 : 0) + (showStyle ? 1 : 0) + (showColor ? 1 : 0)} className="bg-slate-800 px-3 py-2 text-center text-white tracking-wide">
                          TOTAL · {qty(visibleArticles.length)} ARTICLES
                        </td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right tabular-nums bg-violet-200 text-violet-950">{qty(articleTotals.stock)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{inr(articleTotals.stockValue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{inr(articleTotals.saleValue)}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className={cn(TH, "w-14 text-center")}>Sr No</th>
                    <th className={TH}>Supplier</th>
                    <th className={TH}>Supplier Invoice</th>
                    <th className={TH}>Product</th>
                    {showBrand && <th className={TH}>{fieldLabels.brand}</th>}
                    {showCategory && <th className={TH}>{fieldLabels.category}</th>}
                    <th className={TH}>Size</th>
                    {showColor && <th className={TH}>{fieldLabels.color}</th>}
                    {showStyle && <th className={TH}>{fieldLabels.style}</th>}
                    <th className={TH}>Barcode</th>
                    <th className={cn(TH, "text-right bg-blue-900")}>Opening</th>
                    <th className={cn(TH, "text-right bg-green-900")}>Purchase</th>
                    <th className={cn(TH, "text-right bg-orange-900")}>Pur Return</th>
                    <th className={cn(TH, "text-right bg-red-900")}>Sales</th>
                    <th className={cn(TH, "text-right bg-emerald-900")}>Sale Return</th>
                    <th className={cn(TH, "text-right bg-violet-700")}>Current Stock</th>
                    <th className={cn(TH, "text-right")}>Pur Price</th>
                    <th className={cn(TH, "text-right")}>Stock Value</th>
                    <th className={cn(TH, "text-right")}>Sale Price</th>
                  </tr>
                </thead>
                <tbody>
                  {variantsFetching && variantRows.length === 0 ? (
                    Array.from({ length: 10 }, (_, i) => (
                      <tr key={i}>
                        <td colSpan={19} className="px-3 py-2">
                          <Skeleton className="h-6 w-full" />
                        </td>
                      </tr>
                    ))
                  ) : variantRows.length === 0 ? (
                    <tr>
                      <td colSpan={19} className="py-12 text-center text-slate-500">
                        No stock matches these filters
                      </td>
                    </tr>
                  ) : (
                    variantRows.map((r, i) => (
                      <tr key={r.id} className="hover:bg-indigo-50/40">
                        <td className={cn(TD, "text-center text-xs text-slate-400 border-b border-slate-100")}>{(variantPage - 1) * variantPageSize + i + 1}</td>
                        <td className={cn(TD, "text-xs text-slate-600 border-b border-slate-100")}>{r.supplier_name || "—"}</td>
                        <td className={cn(TD, "font-mono text-xs border-b border-slate-100")}>{r.supplier_invoice_no || "—"}</td>
                        <td className={cn(TD, "font-bold text-slate-900 border-b border-slate-100")}>{r.product_name}</td>
                        {showBrand && <td className={cn(TD, "font-semibold text-slate-700 border-b border-slate-100")}>{r.brand || "—"}</td>}
                        {showCategory && <td className={cn(TD, "text-slate-600 border-b border-slate-100")}>{r.category || "—"}</td>}
                        <td className={cn(TD, "font-semibold border-b border-slate-100")}>{r.size || "—"}</td>
                        {showColor && (
                          <td className={cn(TD, "border-b border-slate-100")}>
                            <ColorChip name={r.color} />
                          </td>
                        )}
                        {showStyle && <td className={cn(TD, "text-slate-600 border-b border-slate-100")}>{r.style || "—"}</td>}
                        <td className={cn(TD, "font-mono font-semibold border-b border-slate-100")}>{r.barcode}</td>
                        <td className={cn(TD, "text-right bg-blue-50/70 border-b border-slate-100")}>{r.opening_qty}</td>
                        <td className={cn(TD, "text-right bg-green-50/70 text-green-700 font-medium border-b border-slate-100")}>+{r.purchase_qty}</td>
                        <td className={cn(TD, "text-right bg-orange-50/70 text-orange-700 border-b border-slate-100")}>{r.purchase_return_qty > 0 ? `-${r.purchase_return_qty}` : "0"}</td>
                        <td className={cn(TD, "text-right bg-red-50/70 text-red-700 border-b border-slate-100")}>{r.sales_qty > 0 ? `-${r.sales_qty}` : "0"}</td>
                        <td className={cn(TD, "text-right bg-emerald-50/70 text-emerald-700 border-b border-slate-100")}>{r.sale_return_qty > 0 ? `+${r.sale_return_qty}` : "0"}</td>
                        <td className={cn(TD, "text-right text-base font-bold bg-violet-50 text-violet-900 border-b border-slate-100")}>
                          {r.stock_qty}
                          {r.uom && r.uom !== "NOS" && r.uom !== "PCS" ? ` ${r.uom}` : ""}
                        </td>
                        <td className={cn(TD, "text-right border-b border-slate-100")}>{r.pur_price ? `₹${r.pur_price}` : "-"}</td>
                        <td className={cn(TD, "text-right font-medium text-indigo-700 border-b border-slate-100")}>
                          {r.pur_price ? `₹${(r.pur_price * r.stock_qty).toLocaleString("en-IN")}` : "-"}
                        </td>
                        <td className={cn(TD, "text-right border-b border-slate-100")}>₹{r.sale_price}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {variantRows.length > 0 && (
                  <tfoot>
                    <tr className="sticky bottom-0 bg-amber-100 font-extrabold tabular-nums">
                      <td
                        colSpan={6 + (showBrand ? 1 : 0) + (showCategory ? 1 : 0) + (showColor ? 1 : 0) + (showStyle ? 1 : 0)}
                        className="bg-slate-800 px-3 py-2 text-center text-white tracking-wide"
                      >
                        {variantPageCount > 1 ? "PAGE TOTAL" : "GRAND TOTAL"}
                      </td>
                      <td className="px-3 py-2 text-right bg-blue-200">{qty(variantPageTotals.opening)}</td>
                      <td className="px-3 py-2 text-right bg-green-200">+{qty(variantPageTotals.purchase)}</td>
                      <td className="px-3 py-2 text-right bg-orange-200">-{qty(variantPageTotals.purReturn)}</td>
                      <td className="px-3 py-2 text-right bg-red-200">-{qty(variantPageTotals.sales)}</td>
                      <td className="px-3 py-2 text-right bg-emerald-200">+{qty(variantPageTotals.saleReturn)}</td>
                      <td className="px-3 py-2 text-right bg-violet-300">{qty(variantPageTotals.stock)}</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right bg-amber-200">{inr(variantPageTotals.stockValue)}</td>
                      <td className="px-3 py-2 text-right bg-amber-200">{inr(variantPageTotals.saleValue)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Page numbers around the current page, e.g. 1 … 5 [6] 7 … 120. */
function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  const out: Array<number | "gap"> = [];
  const from = Math.max(1, page - 1);
  const to = Math.min(pageCount, page + 1);
  if (from > 1) out.push(1);
  if (from > 2) out.push("gap");
  for (let p = from; p <= to; p++) out.push(p);
  if (to < pageCount - 1) out.push("gap");
  if (to < pageCount) out.push(pageCount);
  return out;
}

/** Rows-per-page selector and count, shown on the search row next to the view toggle. */
function RowsControl({
  pageSize,
  pageSizes,
  onPageSize,
  label,
  busy,
}: {
  pageSize: number;
  pageSizes: readonly number[];
  onPageSize: (n: number) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-0.5 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5">
        Show
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-7 w-[70px] bg-white text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        rows
      </span>
      <span className="h-4 w-px bg-slate-200" />
      <span className="tabular-nums inline-flex items-center gap-1.5 font-semibold text-slate-700">
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" />}
        {label}
      </span>
    </div>
  );
}

/** Compact page buttons on the search row: First ‹ 1 … 4 [5] 6 … 31 › Last. */
function Pager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  const btn = "h-7 px-2 text-xs";
  return (
    <div className="inline-flex items-center gap-1">
      <Button variant="outline" size="sm" className={btn} disabled={page <= 1} onClick={() => onPage(1)}>
        First
      </Button>
      <Button variant="outline" size="sm" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="px-0.5 text-xs text-slate-400">
            …
          </span>
        ) : (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            size="sm"
            className={cn(btn, "min-w-7 tabular-nums", p === page && "bg-indigo-600 hover:bg-indigo-700")}
            onClick={() => onPage(p)}
          >
            {p}
          </Button>
        ),
      )}
      <Button variant="outline" size="sm" className={btn} disabled={page >= pageCount} onClick={() => onPage(page + 1)} aria-label="Next page">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className={btn} disabled={page >= pageCount} onClick={() => onPage(pageCount)}>
        Last
      </Button>
    </div>
  );
}
