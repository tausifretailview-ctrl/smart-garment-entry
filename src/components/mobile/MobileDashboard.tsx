import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";
import { MobileDashboardSummary } from "./MobileDashboardSummary";
import { 
  TrendingUp, BarChart3, Package, AlertCircle, WifiOff, RefreshCw, 
  ShoppingCart, Receipt, ShoppingBag, Calculator, Users, Building2, CreditCard, Calendar,
  IndianRupee, Layers,
} from "lucide-react";
import { format } from "date-fns";
import { useRef, useState, useEffect, useCallback } from "react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateOwnerDashboardQueries } from "@/lib/mobileHubRefresh";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ErpDashboardStats = {
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
};

function formatCompactInr(value: number | null | undefined): string {
  if (value == null) return "₹0";
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

// Skeleton for lazy-loaded summary
const SummarySkeleton = () => (
  <Card>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-medium flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        Today's Summary
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex justify-between items-center py-2.5 border-b border-border last:border-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-12" />
        </div>
      ))}
    </CardContent>
  </Card>
);

export const MobileDashboard = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const { getRefreshInterval } = useTierBasedRefresh();
  const { scrollRef, isRefreshing, pullHandlers, refresh: handleManualRefresh } = usePullToRefresh(
    useCallback(async () => {
      await invalidateOwnerDashboardQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["mobile-month-stats"] });
    }, [queryClient])
  );
  
  // Lazy loading for summary section
  const [summaryVisible, setSummaryVisible] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  
  const today = format(new Date(), "yyyy-MM-dd");
  
  // Intersection Observer for lazy loading summary
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSummaryVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (summaryRef.current) {
      observer.observe(summaryRef.current);
    }

    return () => observer.disconnect();
  }, []);
  
  // Greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Single RPC call replaces 4 separate queries
  const { 
    data: dashStats, 
    isLoading,
    isError,
    refetch
  } = useQuery({
    queryKey: ["mobile-dashboard-stats", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return null;
      
      const { data, error } = await supabase.rpc('get_erp_dashboard_stats', {
        p_org_id: currentOrganization.id,
        p_start_date: today,
        p_end_date: today,
      });
      if (error) throw error;
      return data as ErpDashboardStats;
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
    refetchInterval: false,
    retry: 2,
  });

  // Also fetch month stats with a separate RPC call (different date range)
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd");
  
  const { data: monthStats, isLoading: monthLoading } = useQuery({
    queryKey: ["mobile-month-stats", currentOrganization?.id, monthStart],
    queryFn: async () => {
      if (!currentOrganization) return null;
      const { data, error } = await supabase.rpc('get_erp_dashboard_stats', {
        p_org_id: currentOrganization.id,
        p_start_date: monthStart,
        p_end_date: monthEnd,
      });
      if (error) throw error;
      return data as { total_sales: number };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 120000,
    refetchInterval: false,
    retry: 2,
  });

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-slate-50 dark:bg-background pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />

      {/* ── HEADER BANNER ── gradient top section */}
      <div className="relative bg-gradient-to-br from-[#0a0f1e] via-[#111827] to-[#1e2a4a] px-4 pt-5 pb-16 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
        
        {/* Top row */}
        <div className="relative flex items-start justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-white">{getGreeting()}!</h1>
            <p className="text-xs text-white/60 mt-0.5">{currentOrganization?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Refresh button */}
            <button
              onClick={handleManualRefresh}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-all touch-manipulation"
            >
              <RefreshCw className={cn("h-4 w-4 text-white/70", isRefreshing && "animate-spin")} />
            </button>
            {/* Date */}
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{format(new Date(), "d MMM")}</p>
              <p className="text-[10px] text-white/50">{format(new Date(), "EEEE")}</p>
            </div>
          </div>
        </div>
        
        {/* Today's Sales — hero metric */}
        <div className="relative">
          <p className="text-xs text-white/50 uppercase tracking-wider mb-1">Today's Sales</p>
          {isLoading ? (
            <Skeleton className="h-10 w-40 bg-white/10" />
          ) : (
            <p className="text-3xl font-bold text-white tracking-tight tabular-nums">
              {formatCompactInr(dashStats?.total_sales)}
            </p>
          )}
          <p className="text-xs text-white/40 mt-1">{dashStats?.invoice_count ?? 0} invoices today</p>
        </div>
      </div>

      {/* ── METRIC CARDS — pulled up into the gradient ── */}
      <div className="px-4 -mt-8 relative z-10">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            {
              label: "This Month",
              value: monthStats?.total_sales,
              icon: BarChart3,
              color: "text-blue-600",
              bg: "bg-blue-50",
              nav: "/daily-cashier-report",
              loading: monthLoading,
            },
            {
              label: "Stock Value",
              value: dashStats?.total_stock_value,
              icon: Package,
              color: "text-amber-600",
              bg: "bg-amber-50",
              nav: "/stock-report",
              loading: isLoading,
            },
            {
              label: "Receivables",
              value: dashStats?.total_receivables,
              icon: AlertCircle,
              color: "text-rose-600",
              bg: "bg-rose-50",
              nav: "/mobile-accounts",
              loading: isLoading,
            },
          ].map((card) => {
            const Icon = card.icon;
            const displayValue = formatCompactInr(card.value);
            return (
              <button
                key={card.label}
                onClick={() => orgNavigate(card.nav)}
                className="bg-white dark:bg-card rounded-2xl p-3 shadow-sm border border-border/40 active:scale-95 transition-all duration-100 touch-manipulation text-left"
              >
                <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center mb-1.5", card.bg)}>
                  <Icon className={cn("h-3.5 w-3.5", card.color)} />
                </div>
                <p className="text-[10px] text-muted-foreground">{card.label}</p>
                {card.loading ? (
                  <Skeleton className="h-5 w-16 mt-0.5" />
                ) : (
                  <p className="text-sm font-bold tabular-nums text-foreground">{displayValue}</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TODAY'S BUSINESS ── */}
      <div className="px-4 mt-5">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Today&apos;s Business
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {
              label: "Purchase",
              sub: `${dashStats?.purchase_count ?? 0} bills`,
              value: formatCompactInr(dashStats?.total_purchase),
              icon: ShoppingBag,
              color: "text-orange-600",
              bg: "bg-orange-50",
              nav: "/owner-purchases",
              isCount: false,
            },
            {
              label: "Gross Profit",
              sub: "Sales − purchase",
              value: formatCompactInr(dashStats?.gross_profit),
              icon: TrendingUp,
              color: "text-emerald-600",
              bg: "bg-emerald-50",
              nav: "/owner-reports",
              isCount: false,
            },
            {
              label: "Collection",
              sub: "Cash received",
              value: formatCompactInr(dashStats?.cash_collection),
              icon: IndianRupee,
              color: "text-blue-600",
              bg: "bg-blue-50",
              nav: "/mobile-accounts",
              isCount: false,
            },
            {
              label: "Pending",
              sub: "Unpaid invoices",
              value: String(dashStats?.pending_count ?? 0),
              icon: AlertCircle,
              color: "text-amber-600",
              bg: "bg-amber-50",
              nav: "/mobile-accounts",
              isCount: true,
            },
          ].map((row) => {
            const Icon = row.icon;
            return (
              <button
                key={row.label}
                type="button"
                onClick={() => orgNavigate(row.nav)}
                className="bg-white dark:bg-card rounded-2xl p-3.5 shadow-sm border border-border/40 text-left touch-manipulation active:scale-[0.98] transition-transform"
              >
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-2", row.bg)}>
                  <Icon className={cn("h-4 w-4", row.color)} />
                </div>
                <p className="text-[10px] text-muted-foreground">{row.label}</p>
                {isLoading && !row.isCount ? (
                  <Skeleton className="h-6 w-20 mt-0.5" />
                ) : (
                  <p className="text-base font-bold tabular-nums text-foreground">{row.value}</p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">{row.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── BUSINESS TOTALS ── */}
      <div className="px-4 mt-5">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Business Totals
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: "Customers", value: dashStats?.customer_count, icon: Users, nav: "/customers" },
            { label: "Suppliers", value: dashStats?.supplier_count, icon: Building2, nav: "/suppliers" },
            { label: "Products", value: dashStats?.product_count, icon: Layers, nav: "/products" },
            { label: "Stock Qty", value: dashStats?.total_stock_qty, icon: Package, nav: "/owner-stock" },
          ].map((row) => {
            const Icon = row.icon;
            return (
              <button
                key={row.label}
                type="button"
                onClick={() => orgNavigate(row.nav)}
                className="flex items-center gap-3 bg-white dark:bg-card rounded-2xl p-3 border border-border/40 shadow-sm touch-manipulation active:scale-[0.98] transition-transform"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[10px] text-muted-foreground">{row.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-5 w-12 mt-0.5" />
                  ) : (
                    <p className="text-sm font-bold tabular-nums">{(row.value ?? 0).toLocaleString("en-IN")}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── QUICK ACTIONS ── */}
      <div className="px-4 mt-5">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</h2>
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { icon: ShoppingCart, label: "POS", nav: "/pos-sales", gradient: "from-emerald-400 to-green-500" },
            { icon: Receipt, label: "New Sale", nav: "/sales-invoice-dashboard", gradient: "from-blue-400 to-indigo-500" },
            { icon: ShoppingBag, label: "Purchase", nav: "/purchase-entry", gradient: "from-orange-400 to-amber-500" },
            { icon: Calculator, label: "Cashier", nav: "/daily-cashier-report", gradient: "from-purple-400 to-violet-500" },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => orgNavigate(a.nav)}
                className={`bg-gradient-to-br ${a.gradient} rounded-2xl p-3 flex flex-col items-center gap-1.5 shadow-sm active:scale-90 transition-all duration-100 touch-manipulation`}
              >
                <Icon className="h-5 w-5 text-white" />
                <span className="text-[10px] font-medium text-white/90">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── SECONDARY ACTIONS ── */}
      <div className="px-4 mt-5">
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { icon: Users, label: "Customers", nav: "/customers", color: "text-purple-500", bg: "bg-purple-50" },
            { icon: Building2, label: "Suppliers", nav: "/suppliers", color: "text-orange-500", bg: "bg-orange-50" },
            { icon: CreditCard, label: "Payments", nav: "/mobile-accounts", color: "text-blue-500", bg: "bg-blue-50" },
            { icon: BarChart3, label: "Reports", nav: "/owner-reports", color: "text-teal-500", bg: "bg-teal-50" },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <button
                key={a.label}
                onClick={() => orgNavigate(a.nav)}
                className="bg-white dark:bg-card rounded-2xl p-3 flex flex-col items-center gap-1.5 border border-border/40 shadow-sm active:scale-90 transition-all duration-100 touch-manipulation"
              >
                <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", a.bg)}>
                  <Icon className={cn("h-4 w-4", a.color)} />
                </div>
                <span className="text-[10px] font-medium text-muted-foreground">{a.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── TODAY'S SUMMARY (lazy loaded) ── */}
      <div ref={summaryRef} className="px-4 mt-5">
        {summaryVisible ? (
          <MobileDashboardSummary 
            invoiceCount={dashStats?.invoice_count ?? 0}
            itemsSold={dashStats?.sold_qty ?? 0}
            pendingCount={dashStats?.pending_count ?? 0}
            isLoading={isLoading}
          />
        ) : <SummarySkeleton />}
      </div>

      {/* ── OFFLINE BANNER ── */}
      {!isOnline && (
        <div className="mx-4 mt-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">You're offline — showing cached data</p>
        </div>
      )}
    </div>
  );
};
