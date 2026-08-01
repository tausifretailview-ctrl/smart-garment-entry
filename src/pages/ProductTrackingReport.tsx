import { useState, useMemo, useCallback } from "react";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters, WINDOW_FILTER_IDS } from "@/lib/dashboardFilterPersistence";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, AlertTriangle, Activity } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { format, subDays } from "date-fns";
import { ColumnDef } from "@tanstack/react-table";
import { ERPTable } from "@/components/erp-table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  INSIGHTS_TAB_SHELL,
  InsightsKpiCard,
  InsightsPanel,
} from "@/components/business-insights/insightsLayout";

// Tab-return stable: keep cached data, never auto-refetch on focus/mount/reconnect.
const STABLE_TAB_OPTIONS = {
  staleTime: 5 * 60 * 1000,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false as const,
  refetchOnMount: false as const,
  refetchOnReconnect: false as const,
};

interface MovementRecord {
  id: string;
  created_at: string;
  movement_type: string;
  quantity: number;
  bill_number: string;
  notes: string;
  variant_id: string;
  product_name: string;
  size: string;
  color: string;
  barcode: string;
  category: string;
  brand: string;
}

const columns: ColumnDef<MovementRecord, any>[] = [
  {
    id: "date",
    accessorKey: "created_at",
    header: "Date & Time",
    size: 160,
    cell: ({ getValue }) => (
      <span className="font-mono text-sm">
        {format(new Date(getValue()), "dd/MM/yyyy HH:mm")}
      </span>
    ),
  },
  {
    id: "barcode",
    accessorKey: "barcode",
    header: "Barcode",
    size: 140,
    cell: ({ getValue }) => (
      <span className="font-mono font-semibold">{getValue() || "N/A"}</span>
    ),
  },
  {
    id: "product_name",
    accessorKey: "product_name",
    header: "Product Name",
    size: 200,
    cell: ({ getValue }) => <span className="font-medium">{getValue()}</span>,
  },
  {
    id: "size",
    accessorKey: "size",
    header: "Size",
    size: 80,
  },
  {
    id: "color",
    accessorKey: "color",
    header: "Color",
    size: 100,
    cell: ({ getValue }) => (
      <span className="text-sm">{getValue() as string || "—"}</span>
    ),
  },
  {
    id: "type",
    accessorKey: "movement_type",
    header: "Type",
    size: 100,
    cell: ({ getValue }) => {
      const type = getValue() as string;
      const typeConfig: Record<string, { label: string; className: string }> = {
        purchase:        { label: "Purchase",        className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
        sale:            { label: "Sale",             className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
        sale_return:     { label: "Sale Return",      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
        purchase_return: { label: "Purchase Return",  className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
        adjustment:      { label: "Adjustment",       className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
        purchase_delete: { label: "Bill Deleted",     className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
      };
      const config = typeConfig[type] || { label: type, className: "bg-slate-100 text-slate-600" };
      return (
        <span className={`px-2 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${config.className}`}>
          {config.label}
        </span>
      );
    },
  },
  {
    id: "bill_number",
    accessorKey: "bill_number",
    header: "Bill Number",
    size: 130,
    cell: ({ getValue }) => <span className="font-mono">{getValue()}</span>,
  },
  {
    id: "credit",
    accessorFn: (row) =>
      row.movement_type === "purchase" || row.movement_type === "sale_return"
        ? Math.abs(row.quantity)
        : null,
    header: "Credit (In)",
    size: 100,
    cell: ({ getValue }) => (
      <span className="text-right font-semibold text-green-600 block tabular-nums">
        {getValue() != null ? getValue() : "-"}
      </span>
    ),
  },
  {
    id: "debit",
    accessorFn: (row) =>
      row.movement_type === "sale" || row.movement_type === "purchase_return"
        ? Math.abs(row.quantity)
        : null,
    header: "Debit (Out)",
    size: 100,
    cell: ({ getValue }) => (
      <span className="text-right font-semibold text-red-600 block tabular-nums">
        {getValue() != null ? getValue() : "-"}
      </span>
    ),
  },
  {
    id: "notes",
    accessorKey: "notes",
    header: "Notes",
    size: 200,
    cell: ({ getValue }) => (
      <span className="text-sm text-muted-foreground truncate max-w-xs block">
        {getValue() as string}
      </span>
    ),
  },
];

const PAGE_SIZE = 100;
const MAX_DATE_RANGE_DAYS = 365;

const ProductTrackingReport = () => {
  const { currentOrganization } = useOrganization();
  const reduceMotion = usePrefersReducedMotion();
  const [searchBarcode, setSearchBarcode] = useState("");
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const productTrackingFilterSnapshot = useMemo(
    () => ({
      searchBarcode,
      startDate,
      endDate,
      movementTypeFilter,
      categoryFilter,
      brandFilter,
      currentPage,
    }),
    [searchBarcode, startDate, endDate, movementTypeFilter, categoryFilter, brandFilter, currentPage],
  );

  useDashboardFilterPersistence(
    WINDOW_FILTER_IDS.productTracking,
    currentOrganization?.id,
    productTrackingFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchBarcode", setSearchBarcode],
          ["startDate", setStartDate],
          ["endDate", setEndDate],
          ["movementTypeFilter", setMovementTypeFilter],
          ["categoryFilter", setCategoryFilter],
          ["brandFilter", setBrandFilter],
        ],
        numbers: [["currentPage", setCurrentPage]],
      });
    },
  );

  // Validate date range
  const dateRangeError = useMemo(() => {
    if (!startDate || !endDate) return "Please select a date range";
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return "End date must be after start date";
    const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays > MAX_DATE_RANGE_DAYS) return `Date range cannot exceed 1 year`;
    return null;
  }, [startDate, endDate]);

  // Category/brand options via same RPC as Stock Report (no 1000-row products cap)
  const { data: filterOptions } = useQuery({
    queryKey: ["product-tracking-filters", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { categories: [], brands: [] };
      const { data, error } = await (
        supabase as unknown as {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => ReturnType<typeof supabase.rpc>;
        }
      ).rpc("get_stock_report_filter_options", {
        p_org_id: currentOrganization.id,
      });
      if (error) throw error;
      const payload = data as {
        rawProducts?: Array<{ brand: string; category: string }>;
      } | null;
      const rawProducts = payload?.rawProducts ?? [];
      const categories = [...new Set(rawProducts.map((p) => p.category).filter(Boolean))].sort() as string[];
      const brands = [...new Set(rawProducts.map((p) => p.brand).filter(Boolean))].sort() as string[];
      return { categories, brands };
    },
    enabled: !!currentOrganization?.id,
    ...STABLE_TAB_OPTIONS,
  });

  // Server-side paginated query
  const { data: queryResult, isLoading } = useQuery({
    queryKey: [
      "product-tracking",
      currentOrganization?.id,
      startDate,
      endDate,
      searchBarcode,
      movementTypeFilter,
      categoryFilter,
      brandFilter,
      currentPage,
    ],
    queryFn: async () => {
      if (!currentOrganization?.id || dateRangeError) return { data: [], totalCount: 0 };

      // Build the query with server-side filters
      let query = supabase
        .from("stock_movements")
        .select(`
          id,
          created_at,
          movement_type,
          quantity,
          bill_number,
          notes,
          variant_id,
          organization_id,
          product_variants!inner (
            barcode,
            size,
            color,
            products!inner (
              product_name,
              category,
              brand
            )
          )
        `, { count: "exact" })
        .eq("organization_id", currentOrganization.id)
        .gte("created_at", startDate + "T00:00:00")
        .lte("created_at", endDate + "T23:59:59")
        .order("created_at", { ascending: false });

      // Server-side filters
      if (movementTypeFilter !== "all") {
        query = query.eq("movement_type", movementTypeFilter);
      }

      if (searchBarcode) {
        const trimmed = searchBarcode.trim();
        // Detect barcode: numeric-only OR alphanumeric like SZ13777323, EAN codes etc.
        // Rule: if it contains ANY digit AND is 5+ chars, treat as barcode first
        const looksLikeBarcode = /\d/.test(trimmed) && trimmed.length >= 5;
        if (looksLikeBarcode) {
          // Search barcode on variant — try exact match first, then partial
          query = query.or(
            `barcode.eq.${trimmed},barcode.ilike.${trimmed}%`,
            { referencedTable: "product_variants" }
          );
        } else {
          // Pure text — search product name
          query = query.ilike(
            "product_variants.products.product_name",
            `%${trimmed}%`
          );
        }
      }

      if (categoryFilter !== "all") {
        query = query.eq("product_variants.products.category", categoryFilter);
      }

      if (brandFilter !== "all") {
        query = query.eq("product_variants.products.brand", brandFilter);
      }

      // Server-side pagination
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      const movements: MovementRecord[] = (data || []).map((movement: any) => ({
        id: movement.id,
        created_at: movement.created_at,
        movement_type: movement.movement_type,
        quantity: movement.quantity,
        bill_number: movement.bill_number,
        notes: movement.notes,
        variant_id: movement.variant_id,
        product_name: movement.product_variants.products.product_name,
        size: movement.product_variants.size,
        color: movement.product_variants.color || "",
        barcode: movement.product_variants.barcode || "",
        category: movement.product_variants.products.category || "",
        brand: movement.product_variants.products.brand || "",
      }));

      return { data: movements, totalCount: count || 0 };
    },
    enabled: !!currentOrganization?.id && !dateRangeError,
    ...STABLE_TAB_OPTIONS,
  });

  const movements = queryResult?.data || [];
  const totalCount = queryResult?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Full filtered qty totals (not page-only) — light columns, paginated.
  const { data: qtyTotals } = useQuery({
    queryKey: [
      "product-tracking-qty-totals",
      currentOrganization?.id,
      startDate,
      endDate,
      searchBarcode,
      movementTypeFilter,
      categoryFilter,
      brandFilter,
    ],
    queryFn: async () => {
      if (!currentOrganization?.id || dateRangeError) return { inQty: 0, outQty: 0 };
      let inQty = 0;
      let outQty = 0;
      let from = 0;
      while (true) {
        let query = supabase
          .from("stock_movements")
          .select(`
            movement_type,
            quantity,
            product_variants!inner (
              barcode,
              products!inner (product_name, category, brand)
            )
          `)
          .eq("organization_id", currentOrganization.id)
          .gte("created_at", startDate + "T00:00:00")
          .lte("created_at", endDate + "T23:59:59")
          .range(from, from + 999);

        if (movementTypeFilter !== "all") {
          query = query.eq("movement_type", movementTypeFilter);
        }
        if (searchBarcode) {
          const trimmed = searchBarcode.trim();
          const looksLikeBarcode = /\d/.test(trimmed) && trimmed.length >= 5;
          if (looksLikeBarcode) {
            query = query.or(
              `barcode.eq.${trimmed},barcode.ilike.${trimmed}%`,
              { referencedTable: "product_variants" },
            );
          } else {
            query = query.ilike("product_variants.products.product_name", `%${trimmed}%`);
          }
        }
        if (categoryFilter !== "all") {
          query = query.eq("product_variants.products.category", categoryFilter);
        }
        if (brandFilter !== "all") {
          query = query.eq("product_variants.products.brand", brandFilter);
        }

        const { data, error } = await query;
        if (error) throw error;
        const rows = data || [];
        for (const row of rows as Array<{ movement_type: string; quantity: number }>) {
          const qty = Math.abs(Number(row.quantity) || 0);
          if (row.movement_type === "purchase" || row.movement_type === "sale_return") inQty += qty;
          else if (row.movement_type === "sale" || row.movement_type === "purchase_return") outQty += qty;
        }
        if (rows.length < 1000) break;
        from += 1000;
      }
      return { inQty, outQty };
    },
    enabled: !!currentOrganization?.id && !dateRangeError,
    ...STABLE_TAB_OPTIONS,
  });

  // Reset page when filters change
  const handleFilterChange = useCallback((setter: (v: string) => void) => {
    return (value: string) => {
      setter(value);
      setCurrentPage(1);
    };
  }, []);

  const inQty = qtyTotals?.inQty ?? 0;
  const outQty = qtyTotals?.outQty ?? 0;
  const flowChart = useMemo(
    () => [
      { name: "Stock In", value: inQty, fill: "#10b981" },
      { name: "Stock Out", value: outQty, fill: "#ef4444" },
    ],
    [inQty, outQty],
  );

  if (isLoading && !movements.length) {
    return (
      <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
        <div className="p-6 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden w-full">
      <div className={`${INSIGHTS_TAB_SHELL} overflow-y-auto`}>
        <div className="no-print flex flex-wrap items-center gap-2 shrink-0">
          <BackToDashboard />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
              <Activity className="h-5 w-5 shrink-0" />
              Product Tracking Report
            </h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              Track product movements · purchases · sales · returns · adjustments
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 w-full shrink-0">
          <InsightsKpiCard
            label="Stock In"
            value={inQty}
            valueFormat="int"
            tone="positive"
            sub="Purchase + sale return (all filtered rows)"
          />
          <InsightsKpiCard
            label="Stock Out"
            value={outQty}
            valueFormat="int"
            tone="critical"
            sub="Sale + purchase return (all filtered rows)"
          />
          <InsightsKpiCard
            label="Total Records"
            value={totalCount}
            valueFormat="int"
            tone="neutral"
            sub={totalCount > 0 ? `Page ${currentPage} of ${totalPages}` : "No matches"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 shrink-0">
          <InsightsPanel title="In vs Out" subtitle="Filtered quantity flow" className="h-[200px]">
            <div className="h-[150px] px-2 py-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={flowChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Bar
                    dataKey="value"
                    name="Qty"
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={!reduceMotion}
                    animationDuration={900}
                  >
                    {flowChart.map((entry) => (
                      <Cell key={entry.name} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </InsightsPanel>

          <Card className="rounded-lg border border-slate-200 shadow-sm p-3 space-y-3 lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Search by Barcode / Product</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Enter barcode or product name..."
                  value={searchBarcode}
                  onChange={(e) => { setSearchBarcode(e.target.value); setCurrentPage(1); }}
                  className="pl-10 h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Movement Type</label>
              <Select value={movementTypeFilter} onValueChange={handleFilterChange(setMovementTypeFilter)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="purchase">Purchase (Stock In)</SelectItem>
                  <SelectItem value="sale">Sale (Stock Out)</SelectItem>
                  <SelectItem value="sale_return">Sale Return (Stock In)</SelectItem>
                  <SelectItem value="purchase_return">Purchase Return (Stock Out)</SelectItem>
                  <SelectItem value="adjustment">Stock Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Category</label>
              <Select value={categoryFilter} onValueChange={handleFilterChange(setCategoryFilter)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {(filterOptions?.categories || []).map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Brand</label>
              <Select value={brandFilter} onValueChange={handleFilterChange(setBrandFilter)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Brands</SelectItem>
                  {(filterOptions?.brands || []).map((brand) => (
                    <SelectItem key={brand} value={brand}>
                      {brand}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">End Date</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="h-9"
              />
            </div>
          </div>

          {dateRangeError && (
            <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 rounded-md text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {dateRangeError}
            </div>
          )}

          <div className="flex justify-between items-center pt-1">
            <p className="text-sm text-muted-foreground">
              {totalCount > 0
                ? <span>Found <span className="font-semibold text-foreground">{totalCount}</span> movements — showing page {currentPage} of {totalPages}</span>
                : <span className="text-muted-foreground/60 italic">No movements found for the selected filters</span>
              }
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchBarcode("");
                setStartDate(format(subDays(new Date(), 90), "yyyy-MM-dd"));
                setEndDate(format(new Date(), "yyyy-MM-dd"));
                setMovementTypeFilter("all");
                setCategoryFilter("all");
                setBrandFilter("all");
                setCurrentPage(1);
              }}
            >
              Clear Filters
            </Button>
          </div>
          </Card>
        </div>

        <Card className="rounded-lg border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0">
          <ERPTable
            tableId="product_tracking"
            columns={columns}
            data={movements}
            stickyFirstColumn={true}
            isLoading={isLoading}
            emptyMessage={dateRangeError ? "Please fix the date range to view data" : "No movement records found"}
            defaultColumnVisibility={{}}
          />

          {/* Server-side Pagination */}
          {totalCount > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages} ({totalCount} total records)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm px-4">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ProductTrackingReport;
