import { useState, useRef, useEffect, useMemo } from "react";
import { flushSync } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useOrganizationReceivablesSummary } from "@/hooks/useOrganizationReceivablesSummary";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";

import { useContextMenu, useIsDesktop } from "@/hooks/useContextMenu";
import {
  DASHBOARD_MANUAL_REFRESH_OPTIONS,
  DASHBOARD_REFRESH_QUERY_KEYS,
  isDashboardMetricsQueryEnabled,
} from "@/lib/dashboardQueryOptions";
import { fetchCustomerSegmentCounts, type CustomerSegmentCounts } from "@/utils/customerSegments";
import type { OrganizationReceivablesSummary } from "@/utils/organizationReceivables";
import { PageContextMenu, ContextMenuItem } from "@/components/DesktopContextMenu";
import { DashboardSkeleton, MetricCardSkeleton } from "@/components/ui/skeletons";
import {
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  Building2,
  Users,
  Store,
  DollarSign,
  Calendar,
  RotateCcw,
  AlertCircle,
  Smartphone,
  MapPin,
  ClipboardList,
  IndianRupee,
  Loader2,
  RefreshCw,
  TrendingDown,
  Minus,
  Megaphone,
  Calculator,
  Layers,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import { StatsChartsSection } from "@/components/dashboard/StatsChartsSection";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  format,
  formatDistanceToNow,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  subMonths,
  parse,
} from "date-fns";
import { cn } from "@/lib/utils";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import { SizeStockDialog } from "@/components/SizeStockDialog";
// Currency formatter helper
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

// Vasy-style pastel KPI card — centered value, soft background, large readable type
const METRIC_PASTEL: Record<string, { shell: string; value: string }> = {
  "bg-blue-500": { shell: "bg-sky-50 border-sky-200/70 hover:bg-sky-100/80", value: "text-sky-800" },
  "bg-blue-600": { shell: "bg-sky-50 border-sky-200/70 hover:bg-sky-100/80", value: "text-sky-800" },
  "bg-green-500": { shell: "bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80", value: "text-emerald-800" },
  "bg-green-600": { shell: "bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80", value: "text-emerald-800" },
  "bg-emerald-500": { shell: "bg-emerald-50 border-emerald-200/70 hover:bg-emerald-100/80", value: "text-emerald-800" },
  "bg-orange-500": { shell: "bg-orange-50 border-orange-200/70 hover:bg-orange-100/80", value: "text-orange-800" },
  "bg-amber-500": { shell: "bg-amber-50 border-amber-200/70 hover:bg-amber-100/80", value: "text-amber-900" },
  "bg-red-500": { shell: "bg-rose-50 border-rose-200/70 hover:bg-rose-100/80", value: "text-rose-800" },
  "bg-pink-500": { shell: "bg-pink-50 border-pink-200/70 hover:bg-pink-100/80", value: "text-pink-800" },
  "bg-purple-500": { shell: "bg-violet-50 border-violet-200/70 hover:bg-violet-100/80", value: "text-violet-800" },
  "bg-violet-500": { shell: "bg-violet-50 border-violet-200/70 hover:bg-violet-100/80", value: "text-violet-800" },
  "bg-indigo-500": { shell: "bg-indigo-50 border-indigo-200/70 hover:bg-indigo-100/80", value: "text-indigo-800" },
  "bg-cyan-500": { shell: "bg-cyan-50 border-cyan-200/70 hover:bg-cyan-100/80", value: "text-cyan-800" },
  "bg-teal-500": { shell: "bg-teal-50 border-teal-200/70 hover:bg-teal-100/80", value: "text-teal-800" },
  "bg-slate-500": { shell: "bg-slate-50 border-slate-200/70 hover:bg-slate-100/80", value: "text-slate-800" },
};

const AnimatedMetricCard = ({
  title,
  value,
  icon: Icon,
  accentColor,
  onClick,
  tooltip,
  isCurrency = false,
  placeholder = false,
  loading = false,
}: {
  title: string;
  value: number;
  icon: any;
  accentColor: string;
  onClick?: () => void;
  tooltip?: string;
  isCurrency?: boolean;
  placeholder?: boolean;
  loading?: boolean;
}) => {
  const displayValue = placeholder
    ? "—"
    : isCurrency
      ? formatCurrency(value)
      : value.toLocaleString("en-IN");

  const pastel = METRIC_PASTEL[accentColor] ?? METRIC_PASTEL["bg-blue-500"];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group dashboard-metric-card" onClick={placeholder ? undefined : onClick}>
          <Card
            className={cn(
              "dashboard-metric-card-inner relative overflow-hidden rounded-xl border shadow-sm transition-colors duration-150",
              pastel.shell,
              placeholder
                ? "cursor-default opacity-90"
                : "cursor-pointer hover:shadow-md",
            )}
          >
            <CardContent className="flex h-full min-h-[100px] flex-col items-center justify-center px-3 py-4 text-center">
              <p className="text-sm font-semibold leading-snug text-slate-600 line-clamp-2">{title}</p>
              <p
                className={cn(
                  "mt-2 text-2xl font-bold tabular-nums leading-none sm:text-[1.65rem]",
                  placeholder ? "text-slate-400" : pastel.value,
                )}
              >
                {loading && !placeholder ? (
                  <Loader2 className="mx-auto h-6 w-6 animate-spin opacity-70" />
                ) : (
                  displayValue
                )}
              </p>
              <Icon
                className={cn(
                  "absolute right-2.5 top-2.5 h-4 w-4 opacity-25",
                  placeholder ? "text-slate-400" : "text-slate-500",
                )}
              />
            </CardContent>
          </Card>
        </div>
      </TooltipTrigger>
      {tooltip && (
        <TooltipContent side="bottom" className="max-w-[220px] border-border bg-popover text-popover-foreground">
          <p className="text-sm">{tooltip}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
};

type DateRangeType = "monthly" | "quarterly" | "yearly" | "all";

type DashStats = {
  total_sales: number;
  invoice_count: number;
  sold_qty: number;
  total_purchase: number;
  purchase_count: number;
  purchase_qty: number;
  customer_count: number;
  supplier_count: number;
  product_count: number;
  total_stock_qty: number;
  total_stock_value: number;
  total_receivables: number;
  pending_count: number;
  gross_profit: number;
  cash_collection: number;
  sale_return_total: number;
  sale_return_count: number;
  sale_return_qty: number;
  purchase_return_total: number;
  purchase_return_count: number;
  purchase_return_qty: number;
};

/** Hint only — never auto-fetch when cache is older than this. */
const DASHBOARD_CACHE_STALE_MS = 30 * 60 * 1000;

const MONTH_PICKER_OPTIONS_COUNT = 36;

function buildMonthPickerOptions(count = MONTH_PICKER_OPTIONS_COUNT) {
  const anchor = startOfMonth(new Date());
  return Array.from({ length: count }, (_, i) => {
    const d = subMonths(anchor, i);
    return {
      value: format(d, "yyyy-MM"),
      label: format(d, "MMMM yyyy"),
    };
  });
}

function monthKeyToDate(monthKey: string): Date {
  const parsed = parse(monthKey, "yyyy-MM", new Date());
  return Number.isNaN(parsed.getTime()) ? startOfMonth(new Date()) : startOfMonth(parsed);
}

const getDateRange = (type: DateRangeType, referenceDate?: Date) => {
  const now = referenceDate ?? new Date();
  switch (type) {
    case "monthly":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: format(endOfMonth(now), "yyyy-MM-dd"),
        label: format(now, "MMMM yyyy"),
      };
    case "quarterly":
      return {
        start: format(startOfQuarter(now), "yyyy-MM-dd"),
        end: format(endOfQuarter(now), "yyyy-MM-dd"),
        label: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${format(now, "yyyy")}`,
      };
    case "yearly":
      return {
        start: format(startOfYear(now), "yyyy-MM-dd"),
        end: format(endOfYear(now), "yyyy-MM-dd"),
        label: format(now, "yyyy"),
      };
    case "all":
      return {
        start: "2000-01-01",
        end: format(endOfYear(now), "yyyy-MM-dd"),
        label: "All Time",
      };
  }
};

const DesktopDashboard = () => {
  const { currentOrganization, organizationRole } = useOrganization();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { hasAccess: hasFieldSalesAccess, employeeName } = useFieldSalesAccess();
  const { isAdmin, hasSpecialPermission, hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  // Custom rights: Main Dashboard off → no page, no KPI values, no stats fetch.
  const canAccessMainDashboard =
    permissions === null || hasMenuAccess("main_dashboard");
  const [dateRange, setDateRange] = useState<DateRangeType>("monthly");
  const [selectedMonthKey, setSelectedMonthKey] = useState(() =>
    format(startOfMonth(new Date()), "yyyy-MM"),
  );
  const monthPickerOptions = useMemo(() => {
    const base = buildMonthPickerOptions();
    if (base.some((o) => o.value === selectedMonthKey)) return base;
    const d = monthKeyToDate(selectedMonthKey);
    return [{ value: selectedMonthKey, label: format(d, "MMMM yyyy") }, ...base];
  }, [selectedMonthKey]);

  useDashboardFilterPersistence(
    "",
    currentOrganization?.id,
    useMemo(() => ({ dateRange, selectedMonthKey }), [dateRange, selectedMonthKey]),
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["dateRange", (v) => setDateRange(v as DateRangeType)],
          ["selectedMonthKey", setSelectedMonthKey],
        ],
      });
    },
  );

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [metricsLoadRequested, setMetricsLoadRequested] = useState(false);
  const [auxiliaryMetricsEnabled, setAuxiliaryMetricsEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [cacheTick, setCacheTick] = useState(0);
  const queryClient = useQueryClient();
  const [showSizeStock, setShowSizeStock] = useState(false);
  
  // Context menu for desktop right-click
  const isDesktop = useIsDesktop();
  const pageContextMenu = useContextMenu<void>();

  // Dashboard context menu items
  const getDashboardContextMenuItems = (): ContextMenuItem[] => [
    {
      label: "POS Billing",
      icon: ShoppingCart,
      shortcut: "Ctrl+N",
      onClick: () => navigate("/pos-sales"),
    },
    {
      label: "Stock Report",
      icon: Package,
      shortcut: "Ctrl+G",
      onClick: () => navigate("/stock-report"),
    },
    {
      label: "Daily Cash Report",
      icon: Calculator,
      shortcut: "Ctrl+T",
      onClick: () => navigate("/daily-cashier-report"),
    },
    {
      label: "Size-wise Stock",
      icon: Layers,
      onClick: () => setShowSizeStock(true),
    },
    { label: "", separator: true, onClick: () => {} },
    {
      label: "Today Sales",
      icon: TrendingUp,
      onClick: () => navigate("/sales-invoice-dashboard"),
    },
    {
      label: "Refresh Dashboard",
      icon: RefreshCw,
      shortcut: "F5",
      onClick: () => handleRefreshAll(),
    },
  ];

  // Handle page right-click (empty area)
  const handlePageContextMenu = (e: React.MouseEvent) => {
    if (!isDesktop) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) return;
    pageContextMenu.openMenu(e, undefined);
  };
  
  const canViewGrossProfit = isAdmin || hasSpecialPermission("view_gross_profit");
  const canViewNetProfit =
    !permissionsLoading && (permissions === null || hasMenuAccess("net_profit_analysis"));
  const canViewSupplierBalance =
    !permissionsLoading && (permissions === null || hasMenuAccess("supplier_party_balances"));
  
  const { start: startDate, end: endDate, label: dateLabel } = getDateRange(
    dateRange,
    dateRange === "monthly" ? monthKeyToDate(selectedMonthKey) : undefined,
  );

  const dashStatsQueryKey = useMemo(
    () => ["dashboard-stats", currentOrganization?.id, startDate, endDate] as const,
    [currentOrganization?.id, startDate, endDate],
  );
  const customerSegmentsQueryKey = useMemo(
    () => ["customer-segment-counts", currentOrganization?.id] as const,
    [currentOrganization?.id],
  );
  const receivablesQueryKey = useMemo(
    () => ["organization-receivables", "summary", currentOrganization?.id] as const,
    [currentOrganization?.id],
  );

  const metricsQueryEnabled =
    !permissionsLoading &&
    canAccessMainDashboard &&
    isDashboardMetricsQueryEnabled(
      currentOrganization?.id,
      metricsLoadRequested,
    );

  useEffect(() => {
    if (!currentOrganization?.id || permissionsLoading) return;
    if (!canAccessMainDashboard) {
      setMetricsLoadRequested(false);
      setAuxiliaryMetricsEnabled(false);
      return;
    }
    setMetricsLoadRequested(true);
    setAuxiliaryMetricsEnabled(false);
  }, [currentOrganization?.id, permissionsLoading, canAccessMainDashboard]);

  // Leave dashboard when Main Dashboard right is disabled
  useEffect(() => {
    if (permissionsLoading) return;
    if (canAccessMainDashboard) return;
    const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
    navigate(fallback ? `/${fallback}` : "/");
  }, [
    permissionsLoading,
    canAccessMainDashboard,
    hasMenuAccess,
    permissions,
    organizationRole,
    navigate,
  ]);

  useEffect(() => {
    const updatedAt = queryClient.getQueryState(dashStatsQueryKey)?.dataUpdatedAt;
    setLastUpdated(updatedAt ? new Date(updatedAt) : null);
  }, [dateRange, dashStatsQueryKey, queryClient]);

  // Re-render when persisted cache hydrates from IndexedDB (no network).
  useEffect(() => {
    const syncFromCache = () => {
      setCacheTick((n) => n + 1);
      const updatedAt = queryClient.getQueryState(dashStatsQueryKey)?.dataUpdatedAt;
      if (updatedAt && !metricsLoadRequested) {
        setLastUpdated(new Date(updatedAt));
      }
    };
    syncFromCache();
    return queryClient.getQueryCache().subscribe((event) => {
      const head = String(event.query?.queryKey?.[0] ?? "");
      if (
        head === "dashboard-stats" ||
        head === "customer-segment-counts" ||
        head === "organization-receivables"
      ) {
        syncFromCache();
      }
    });
  }, [queryClient, dashStatsQueryKey, metricsLoadRequested]);

  // Manual refresh — only time dashboard cards/charts hit Supabase
  const handleRefreshAll = async () => {
    if (!canAccessMainDashboard) return;
    setIsRefreshing(true);
    try {
      flushSync(() => {
        setMetricsLoadRequested(true);
        setAuxiliaryMetricsEnabled(true);
      });
      await Promise.all(
        DASHBOARD_REFRESH_QUERY_KEYS.map((key) =>
          queryClient.refetchQueries({ queryKey: [key] }),
        ),
      );
      setLastUpdated(new Date());
    } finally {
      setIsRefreshing(false);
    }
  };

  // Single RPC call replaces 8-10 separate queries
  const { data: liveDashStats, isFetching: isLoading } = useQuery({
    queryKey: dashStatsQueryKey,
    queryFn: async () => {
      if (!currentOrganization) return null;
      
      const { data, error } = await supabase.rpc('get_erp_dashboard_stats', {
        p_org_id: currentOrganization.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      setLastUpdated(new Date());
      return data as DashStats;
    },
    enabled: metricsQueryEnabled,
    ...DASHBOARD_MANUAL_REFRESH_OPTIONS,
  });

  const displayedDashStats = useMemo(() => {
    // Never surface cached KPI numbers when Main Dashboard is disabled / rights loading.
    if (permissionsLoading || !canAccessMainDashboard) return null;
    return (
      liveDashStats ??
      queryClient.getQueryData<DashStats>(dashStatsQueryKey) ??
      null
    );
  }, [
    permissionsLoading,
    canAccessMainDashboard,
    liveDashStats,
    queryClient,
    dashStatsQueryKey,
    cacheTick,
  ]);

  // Defer charts + customer segments until main RPC tiles are ready (faster first paint).
  useEffect(() => {
    if (!metricsLoadRequested) return;
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setAuxiliaryMetricsEnabled(true);
    };
    if (displayedDashStats) {
      if (typeof requestIdleCallback !== "undefined") {
        const id = requestIdleCallback(enable, { timeout: 2500 });
        return () => {
          cancelled = true;
          cancelIdleCallback(id);
        };
      }
      const t = window.setTimeout(enable, 800);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }
    const fallback = window.setTimeout(enable, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [metricsLoadRequested, displayedDashStats]);

  const cachedStatsUpdatedAt = queryClient.getQueryState(dashStatsQueryKey)?.dataUpdatedAt ?? null;

  // Receivables = true net customer AR (Master Reconciliation), shared with the
  // Customer Ledger card / Balance Sheet, instead of the invoice-only net−paid view.
  const { summary: receivablesSummary, isFetching: receivablesFetching } = useOrganizationReceivablesSummary(
    currentOrganization?.id,
    { manualRefreshOnly: true, enabled: metricsQueryEnabled },
  );

  const displayedReceivablesSummary = useMemo(() => {
    const cached =
      queryClient.getQueryData<OrganizationReceivablesSummary>(receivablesQueryKey);
    if (metricsLoadRequested && !receivablesFetching) {
      return receivablesSummary;
    }
    return cached ?? receivablesSummary;
  }, [
    metricsLoadRequested,
    receivablesFetching,
    receivablesSummary,
    queryClient,
    receivablesQueryKey,
    cacheTick,
  ]);

  const { data: liveCustomerSegments, isFetching: segmentsLoading } = useQuery({
    queryKey: customerSegmentsQueryKey,
    enabled: metricsQueryEnabled && auxiliaryMetricsEnabled,
    ...DASHBOARD_MANUAL_REFRESH_OPTIONS,
    queryFn: () => fetchCustomerSegmentCounts(currentOrganization!.id),
  });

  const displayedCustomerSegments = useMemo(
    () =>
      liveCustomerSegments ??
      queryClient.getQueryData<CustomerSegmentCounts>(customerSegmentsQueryKey) ??
      null,
    [liveCustomerSegments, queryClient, customerSegmentsQueryKey, cacheTick],
  );


  // Extract metrics from single RPC result (live or persisted cache)
  const salesData = { total: displayedDashStats?.total_sales || 0, count: displayedDashStats?.invoice_count || 0, soldQty: displayedDashStats?.sold_qty || 0 };
  const purchaseData = { total: displayedDashStats?.total_purchase || 0, count: displayedDashStats?.purchase_count || 0, purchaseQty: displayedDashStats?.purchase_qty || 0 };
  const customersCount = displayedDashStats?.customer_count || 0;
  const productsCount = displayedDashStats?.product_count || 0;
  const suppliersCount = displayedDashStats?.supplier_count || 0;
  const stockData = displayedDashStats?.total_stock_qty || 0;
  const stockValue = displayedDashStats?.total_stock_value || 0;
  const profitData = displayedDashStats?.gross_profit || 0;
  const cashCollection = displayedDashStats?.cash_collection || 0;
  const receivablesData = { total: displayedReceivablesSummary.netReceivable || 0, count: displayedDashStats?.pending_count || 0 };
  const saleReturnData = { total: displayedDashStats?.sale_return_total || 0, count: displayedDashStats?.sale_return_count || 0, returnQty: displayedDashStats?.sale_return_qty || 0 };
  const purchaseReturnData = { total: displayedDashStats?.purchase_return_total || 0, count: displayedDashStats?.purchase_return_count || 0, returnQty: displayedDashStats?.purchase_return_qty || 0 };

  // New Updates Panel Component - Maximized height to show all updates
  const NewUpdatesPanel = () => {
    const updates = [
      {
        version: "v1.4.5",
        date: "27/03/2026",
        changes: [
          "Sales Dashboard: actions column sticky to right edge",
          "Customer name single-line display in invoice table",
          "Action icon buttons compact size (h-7 w-7)",
          "Toolbar buttons (Comfortable/Columns/Reset) polished"
        ]
      },
      {
        version: "v1.4.4",
        date: "27/03/2026",
        changes: [
          "Sales Dashboard filter bar right-side blank gap fixed",
          "Stat cards stretch full width with truncation",
          "Filter bar stays in single row with overflow scroll"
        ]
      },
      {
        version: "v1.4.3",
        date: "27/03/2026",
        changes: [
          "Sidebar auto-hide: icon-only mode by default (44px)",
          "Hover to expand sidebar with smooth 0.22s transition",
          "Lock/unlock toggle button at sidebar bottom",
          "Sidebar preference saved to localStorage"
        ]
      },
      {
        version: "v1.4.2",
        date: "26/03/2026",
        changes: [
          "Purchase Bill: Auto-Focus Search Bar setting added",
          "Size Grid Review Mode setting — check prices before adding to bill",
          "Ctrl+A shortcut to add product to purchase bill",
          "Both settings under Settings → Purchase tab"
        ]
      },
      {
        version: "v1.4.1",
        date: "25/03/2026",
        changes: [
          "Purchase Bill: size grid review mode with editable Pur/Sale/MRP per size",
          "Cursor position setting — auto-focus search bar on product add",
          "After size qty entry: direct add to bill or review variant details"
        ]
      },
      {
        version: "v1.4.0",
        date: "20/03/2026",
        changes: [
          "Stock Settlement module with file import support",
          "Product Modify feature inside Purchase Bill screen",
          "DC Purchase feature for non-GST supplier purchases"
        ]
      },
      {
        version: "v1.3.9",
        date: "15/03/2026",
        changes: [
          "Barcode label printing fixes: 38×25mm and 40×25mm 2-up thermal",
          "TSC 80mm roll label layout improvements",
          "Label Designer settings sync via localStorage"
        ]
      },
      {
        version: "v1.3.8",
        date: "10/03/2026",
        changes: [
          "Brand-wise sale report bug fixes",
          "Size-group-based quantity entry with per-org feature flag",
          "Org-level barcode mode: Auto Generate vs Scan/Manual"
        ]
      },
      {
        version: "v1.3.7",
        date: "08/03/2026",
        changes: [
          "IST-aware Supabase date queries for accurate daily reports",
          "Inline calculator for price fields in purchase entry",
          "SIZE_ORDER constant for consistent size sorting"
        ]
      },
      {
        version: "v1.3.6",
        date: "05/03/2026",
        changes: [
          "KS Footwear: PDF download fix on mobile devices",
          "Customer account statement WhatsApp message fix",
          "Payment allocation mismatch fix (Tally bill-by-bill model)"
        ]
      },
      {
        version: "v1.3.5",
        date: "01/03/2026",
        changes: [
          "Purchase Discount and Sale Discount feature with Settings toggle",
          "Discounts auto-apply in Purchase Bills, Sales, and POS",
          "UI color system polish across all dashboards"
        ]
      },
      {
        version: "v1.3.4",
        date: "24/02/2026",
        changes: [
          "Five-phase mobile app redesign — read-only owner dashboard",
          "Mobile POS improvements and bottom navigation polish",
          "Offline indicator for mobile ERP mode"
        ]
      },
      {
        version: "v1.3.3",
        date: "18/02/2026",
        changes: [
          "A4 invoice print footer section fixed",
          "Size selection checkboxes in Add Product",
          "Auto-focus on Product Name in new product dialog"
        ]
      },
      {
        version: "v1.3.2",
        date: "16/02/2026",
        changes: [
          "Improved A4 print layout with proper page sizing",
          "Enhanced print font scaling for all formats"
        ]
      },
      {
        version: "v1.3.1",
        date: "10/02/2026",
        changes: [
          "Purchase entry product cursor position fix",
          "Size group partial selection feature"
        ]
      },
      {
        version: "v1.3.0",
        date: "05/02/2026",
        changes: [
          "Purple theme with improved contrast",
          "White text on sidebar for better visibility",
          "Header & footer styling improvements"
        ]
      },
      {
        version: "v1.2.9",
        date: "04/02/2026",
        changes: [
          "Sidebar font size increased for readability",
          "Menu alignment improvements"
        ]
      },
      {
        version: "v1.2.8",
        date: "02/02/2026",
        changes: [
          "WhatsApp duplicate prevention for invoices",
          "Improved message delivery tracking"
        ]
      },
      {
        version: "v1.2.7",
        date: "31/01/2026",
        changes: [
          "Windows Native UI redesign - WinUI/Fluent style",
          "Clean white dashboard cards with accent borders",
          "Professional enterprise color system"
        ]
      },
      {
        version: "v1.2.6",
        date: "29/01/2026",
        changes: [
          "Draft resume fix for Sale Order Dashboard",
          "Removed total qty box from sales invoice"
        ]
      },
      {
        version: "v1.2.5",
        date: "28/01/2026",
        changes: [
          "Stock validation improvements during invoice edit",
          "Fixed aggregation for same variant multiple entries"
        ]
      },
      {
        version: "v1.2.4",
        date: "27/01/2026",
        changes: [
          "Draft management moved to dashboard banners",
          "Improved draft resume functionality"
        ]
      },
      {
        version: "v1.2.3",
        date: "25/01/2026",
        changes: [
          "Dashboard resolution enhanced to match ERP style",
          "Larger metric cards with better readability"
        ]
      },
      {
        version: "v1.2.2",
        date: "22/01/2026",
        changes: [
          "Bold black font for draft notifications",
          "Enhanced visual hierarchy"
        ]
      },
      {
        version: "v1.2.1",
        date: "20/01/2026",
        changes: [
          "Fixed bugs for better user experience",
          "Performance optimizations"
        ]
      },
      {
        version: "v1.2.0",
        date: "18/01/2026",
        changes: [
          "New dark theme with VASY ERP styling",
          "Vibrant gradient card backgrounds"
        ]
      }
    ];

    return (
      <Card className="border border-border bg-card shadow-elevated h-fit">
        <CardHeader className="bg-muted/30 border-b border-border p-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2 text-card-foreground">
            <div className="p-1.5 rounded-md bg-primary/10">
              <Megaphone className="h-4 w-4 text-primary" />
            </div>
            New Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[520px]" showScrollbar>
            <div className="p-3 space-y-3">
              {updates.map((update, index) => (
                <div key={index} className="border-b border-border pb-2 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold text-card-foreground">{update.version}</span>
                    <span className="text-xs text-muted-foreground">{update.date}</span>
                  </div>
                  <ul className="space-y-0.5">
                    {update.changes.map((change, changeIndex) => (
                      <li key={changeIndex} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  };

  const hasMetrics = Boolean(displayedDashStats);
  const showPlaceholders =
    permissionsLoading ||
    !canAccessMainDashboard ||
    (!hasMetrics && (!metricsLoadRequested || isLoading));

  if (!permissionsLoading && !canAccessMainDashboard) {
    return <DashboardSkeleton />;
  }
  const metricsLoading = metricsLoadRequested && isLoading && hasMetrics;
  const displayUpdatedAt =
    lastUpdated ?? (cachedStatsUpdatedAt ? new Date(cachedStatsUpdatedAt) : null);
  const cacheAgeMs = displayUpdatedAt ? Date.now() - displayUpdatedAt.getTime() : null;
  const isCacheStale =
    cacheAgeMs !== null && cacheAgeMs > DASHBOARD_CACHE_STALE_MS && hasMetrics && !isLoading;
  const staleHint = isCacheStale ? " · Data may be stale — Refresh" : "";
  const statusLabel = isLoading && metricsLoadRequested && !hasMetrics
    ? "Loading…"
    : displayUpdatedAt
      ? `Last updated ${formatDistanceToNow(displayUpdatedAt, { addSuffix: true })}${staleHint}`
      : hasMetrics
        ? "Showing last loaded figures · click Refresh for latest"
        : metricsLoadRequested
          ? "Loading dashboard…"
          : "Click Refresh to load dashboard data";
  const segmentsBusy = metricsLoadRequested && segmentsLoading && !displayedCustomerSegments;

  return (
    <>
    <TooltipProvider>
    <div 
      className="dashboard-workspace flex w-full min-h-0 flex-1 flex-col bg-slate-50 px-2 pb-2 pt-0 sm:px-3"
      onContextMenu={handlePageContextMenu}
    >
      {/* Desktop Context Menu */}
      <PageContextMenu
        isOpen={pageContextMenu.isOpen}
        position={pageContextMenu.position}
        items={getDashboardContextMenuItems()}
        onClose={pageContextMenu.closeMenu}
        title="Quick Actions"
      />

      {/* Dashboard toolbar */}
      <div className="dashboard-toolbar mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-none tracking-tight text-teal-700 sm:text-xl">
            Dashboard
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <div className={cn("h-2 w-2 shrink-0 rounded-full", isLoading ? "animate-pulse bg-amber-400" : "bg-emerald-500")} />
            <span className="truncate">{statusLabel}</span>
          </div>
        </div>
        <div className="flex shrink-0 flex-nowrap items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 shadow-sm">
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Select value={dateRange} onValueChange={(v: DateRangeType) => setDateRange(v)}>
              <SelectTrigger className="h-8 w-[100px] border-0 bg-transparent px-1 text-sm shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover">
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            {isLoading ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
            ) : dateRange === "monthly" ? (
              <Select value={selectedMonthKey} onValueChange={setSelectedMonthKey}>
                <SelectTrigger className="h-8 w-[9.5rem] border-0 bg-transparent px-1 text-sm font-medium text-primary shadow-none">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent className="max-h-[min(20rem,70vh)] border-border bg-popover">
                  {monthPickerOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-sm">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="max-w-[8rem] truncate text-sm font-medium text-primary">{dateLabel}</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing || isLoading}
            title="Load latest sales, stock, and charts from the server (F5)"
            className="h-9 shrink-0 border-slate-200 bg-white text-sm hover:bg-slate-50"
          >
            <RefreshCw className={cn("mr-1.5 h-4 w-4", (isRefreshing || isLoading) && "animate-spin")} />
            Refresh
          </Button>
          {canViewNetProfit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/net-profit-analysis")}
              title="Open Net Profit Analysis report"
              className="h-9 shrink-0 border-emerald-200 bg-emerald-50 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              <TrendingUp className="mr-1.5 h-4 w-4" />
              Net Profit
            </Button>
          )}
          {canViewSupplierBalance && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/supplier-party-balances")}
              title="Open Supplier Balance"
              className="h-9 shrink-0 border-amber-200 bg-amber-50 text-sm font-medium text-amber-800 hover:bg-amber-100"
            >
              <Building2 className="mr-1.5 h-4 w-4" />
              Supplier Balance
            </Button>
          )}
        </div>
      </div>

      {/* Main Content — single scroll region */}
      <div className="dashboard-body tab-scroll-stable flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="space-y-4 pb-3 pr-1">
        <div className="space-y-4 dashboard-metrics-panel">
          {/* Row 1 - Sales Metrics */}
          <div className="dashboard-metric-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatedMetricCard
              title="Total Sales"
              value={salesData?.total || 0}
              icon={DollarSign}
              accentColor="bg-blue-500"
              onClick={() => navigate("/sales-invoice-dashboard")}
              tooltip="Total revenue from all sales invoices. Click to view Sales Dashboard."
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Invoices"
              value={salesData?.count || 0}
              icon={FileText}
              accentColor="bg-orange-500"
              onClick={() => navigate("/sales-invoice-dashboard")}
              tooltip="Number of sales invoices generated. Click to view all invoices."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Sold Qty"
              value={salesData?.soldQty || 0}
              icon={ShoppingCart}
              accentColor="bg-green-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total quantity of items sold. Click to view Stock Report."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="S/R Amount"
              value={saleReturnData?.total || 0}
              icon={RotateCcw}
              accentColor="bg-amber-500"
              onClick={() => navigate("/sale-returns")}
              tooltip="Total sale return amount. Click to view Sale Returns."
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="S/R Qty"
              value={saleReturnData?.returnQty || 0}
              icon={RotateCcw}
              accentColor="bg-slate-500"
              onClick={() => navigate("/sale-returns")}
              tooltip="Total sale return quantity. Click to view Sale Returns."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Customers"
              value={customersCount || 0}
              icon={Users}
              accentColor="bg-pink-500"
              onClick={() => navigate("/customers")}
              tooltip="Total registered customers. Click to manage customers."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
          </div>

          {/* Row 2 - Purchase Metrics */}
          <div className="dashboard-metric-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatedMetricCard
              title="Total Purchase"
              value={purchaseData?.total || 0}
              icon={ShoppingCart}
              accentColor="bg-emerald-500"
              onClick={() => navigate("/purchase-bills")}
              tooltip="Total amount spent on purchases. Click to view Purchase Dashboard."
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Bills"
              value={purchaseData?.count || 0}
              icon={FileText}
              accentColor="bg-teal-500"
              onClick={() => navigate("/purchase-bills")}
              tooltip="Number of purchase bills recorded. Click to view all bills."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Purchase Qty"
              value={purchaseData?.purchaseQty || 0}
              icon={Package}
              accentColor="bg-orange-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total quantity of items purchased. Click to view Stock Report."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="P/R Amount"
              value={purchaseReturnData?.total || 0}
              icon={RotateCcw}
              accentColor="bg-amber-500"
              onClick={() => navigate("/purchase-return-dashboard")}
              tooltip="Total purchase return amount. Click to view Purchase Returns."
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="P/R Qty"
              value={purchaseReturnData?.returnQty || 0}
              icon={RotateCcw}
              accentColor="bg-slate-500"
              onClick={() => navigate("/purchase-return-dashboard")}
              tooltip="Total purchase return quantity. Click to view Purchase Returns."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Suppliers"
              value={suppliersCount || 0}
              icon={Store}
              accentColor="bg-violet-500"
              onClick={() => navigate("/suppliers")}
              tooltip="Total registered suppliers. Click to manage suppliers."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
          </div>

          {/* Row 3 - Inventory & Financial Metrics */}
          <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
              <Layers className="h-4 w-4 text-teal-600" />
              Inventory &amp; Financial Overview
            </h3>
            <div className="dashboard-metric-grid grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            <AnimatedMetricCard
              title="Products"
              value={productsCount || 0}
              icon={Package}
              accentColor="bg-indigo-500"
              onClick={() => navigate("/products")}
              tooltip="Total unique products in inventory. Click to view Product Dashboard."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Stock Qty"
              value={stockData || 0}
              icon={Package}
              accentColor="bg-cyan-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total items in stock across all variants. Click to view Stock Report."
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Stock Value"
              value={stockValue || 0}
              icon={DollarSign}
              accentColor="bg-purple-500"
              onClick={() => navigate("/stock-report")}
              tooltip="Total value of current inventory at purchase price. Click to view details."
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            {canViewGrossProfit && (
              <AnimatedMetricCard
                title="Gross Profit"
                value={profitData || 0}
                icon={TrendingUp}
                accentColor="bg-green-600"
                onClick={() => navigate("/daily-cashier-report")}
                tooltip="Sales revenue minus purchase cost. Click to view Cashier Report."
                isCurrency
                placeholder={showPlaceholders}
                loading={metricsLoading}
              />
            )}
            <AnimatedMetricCard
              title="Receivables"
              value={receivablesData?.total || 0}
              icon={AlertCircle}
              accentColor="bg-red-500"
              onClick={() => navigate("/payments-dashboard")}
              tooltip={`Net customer receivable (after advances/credits). ${receivablesData?.count || 0} pending invoices. Click to view Payments Dashboard.`}
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            <AnimatedMetricCard
              title="Cash Collection"
              value={cashCollection || 0}
              icon={DollarSign}
              accentColor="bg-blue-600"
              onClick={() => navigate("/daily-cashier-report")}
              tooltip="Total cash collected from sales. Click to view Cashier Report."
              isCurrency
              placeholder={showPlaceholders}
              loading={metricsLoading}
            />
            </div>
          </div>

          {/* Field Sales App Section - Only visible for users with field sales access */}
          {hasFieldSalesAccess && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-600">
                <div className="h-1 w-8 rounded-full bg-amber-500" />
                Field Sales App
              </h2>
              <Card className="border border-border bg-card shadow-sm border-l-[3px] border-l-warning">
                <CardHeader className="p-3 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-warning/10">
                      <Smartphone className="h-4 w-4 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-card-foreground">Field Sales Mobile App</CardTitle>
                      <CardDescription className="text-xs text-muted-foreground">
                        Welcome, {employeeName || "Salesman"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      size="sm"
                      onClick={() => navigate("/salesman")}
                      className="h-9 text-sm"
                    >
                      <Smartphone className="mr-1 h-3.5 w-3.5" />
                      Open App
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/order/new")}
                      className="h-9 text-sm border-border"
                    >
                      <ClipboardList className="mr-1 h-3.5 w-3.5" />
                      New Order
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/customers")}
                      className="h-9 text-sm border-border"
                    >
                      <MapPin className="mr-1 h-3.5 w-3.5" />
                      Customers
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/outstanding")}
                      className="h-9 text-sm border-border"
                    >
                      <IndianRupee className="mr-1 h-3.5 w-3.5" />
                      Outstanding
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Charts Section */}
          <StatsChartsSection loadEnabled={metricsLoadRequested && auxiliaryMetricsEnabled} />
        </div>

        {/* Customer Category Cards */}
        <div className="dashboard-segment-grid grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
          <Card
            className="min-h-[88px] cursor-pointer rounded-xl border border-amber-200/70 bg-amber-50 shadow-sm transition-shadow hover:bg-amber-100/80 hover:shadow-md"
            onClick={() => navigate("/sales-analytics?tab=customers")}
            title="Last sale within 90 days and (5+ invoices or ₹50k+ lifetime revenue)"
          >
            <CardContent className="flex min-h-[88px] flex-col items-center justify-center p-4 text-center">
              <div className="flex min-h-[32px] items-center justify-center text-2xl font-bold tabular-nums text-amber-900 sm:text-[1.65rem]">
                {showPlaceholders ? (
                  <span className="text-slate-400">—</span>
                ) : segmentsBusy ? (
                  <Loader2 className="h-6 w-6 animate-spin opacity-70" />
                ) : (
                  displayedCustomerSegments?.vip ?? 0
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">VIP Customer</div>
            </CardContent>
          </Card>
          <Card
            className="min-h-[88px] cursor-pointer rounded-xl border border-emerald-200/70 bg-emerald-50 shadow-sm transition-shadow hover:bg-emerald-100/80 hover:shadow-md"
            onClick={() => navigate("/sales-analytics?tab=customers")}
            title="Active in last 90 days, below VIP thresholds, or no sales yet (CRM only)"
          >
            <CardContent className="flex min-h-[88px] flex-col items-center justify-center p-4 text-center">
              <div className="flex min-h-[32px] items-center justify-center text-2xl font-bold tabular-nums text-emerald-800 sm:text-[1.65rem]">
                {showPlaceholders ? (
                  <span className="text-slate-400">—</span>
                ) : segmentsBusy ? (
                  <Loader2 className="h-6 w-6 animate-spin opacity-70" />
                ) : (
                  displayedCustomerSegments?.regular ?? 0
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">Regular Customer</div>
            </CardContent>
          </Card>
          <Card
            className="min-h-[88px] cursor-pointer rounded-xl border border-orange-200/70 bg-orange-50 shadow-sm transition-shadow hover:bg-orange-100/80 hover:shadow-md"
            onClick={() => navigate("/sales-analytics?tab=customers")}
            title="Last sale between 91 and 365 days ago"
          >
            <CardContent className="flex min-h-[88px] flex-col items-center justify-center p-4 text-center">
              <div className="flex min-h-[32px] items-center justify-center text-2xl font-bold tabular-nums text-orange-900 sm:text-[1.65rem]">
                {showPlaceholders ? (
                  <span className="text-slate-400">—</span>
                ) : segmentsBusy ? (
                  <Loader2 className="h-6 w-6 animate-spin opacity-70" />
                ) : (
                  displayedCustomerSegments?.risk ?? 0
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">Risk Customer</div>
            </CardContent>
          </Card>
          <Card
            className="min-h-[88px] cursor-pointer rounded-xl border border-rose-200/70 bg-rose-50 shadow-sm transition-shadow hover:bg-rose-100/80 hover:shadow-md"
            onClick={() => navigate("/sales-analytics?tab=customers")}
            title="Last sale over 365 days ago (inactive)"
          >
            <CardContent className="flex min-h-[88px] flex-col items-center justify-center p-4 text-center">
              <div className="flex min-h-[32px] items-center justify-center text-2xl font-bold tabular-nums text-rose-800 sm:text-[1.65rem]">
                {showPlaceholders ? (
                  <span className="text-slate-400">—</span>
                ) : segmentsBusy ? (
                  <Loader2 className="h-6 w-6 animate-spin opacity-70" />
                ) : (
                  displayedCustomerSegments?.lost ?? 0
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-600">Lost Customer</div>
            </CardContent>
          </Card>
        </div>

        {/* New Updates — Collapsible below main content */}
        <details className="group shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1 shadow-sm">
          <summary className="flex cursor-pointer select-none items-center gap-2 py-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
            <Megaphone className="h-4 w-4 text-teal-600" />
            New Updates &amp; Changelog
            <span className="text-xs transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="mt-2">
            <NewUpdatesPanel />
          </div>
        </details>
        </div>
      </div>
    </div>
    </TooltipProvider>
    <SizeStockDialog open={showSizeStock} onOpenChange={setShowSizeStock} />
    </>
  );
};

const DashboardContent = () => (
  <div className="h-full min-h-0 flex flex-col">
    <DesktopDashboard />
  </div>
);

const Index = () => {
  const { currentOrganization, organizations, loading } = useOrganization();

  // Only redirect if user genuinely has no organizations
  // If organizations exist, we're just waiting for currentOrganization to be set by OrgLayout
  if (!loading && organizations.length === 0) {
    window.location.href = "/organization-setup";
    return null;
  }

  // Show skeleton loader while waiting for currentOrganization to be set
  if (!currentOrganization) {
    return <DashboardSkeleton />;
  }

  return <DashboardContent />;
};

export default Index;
