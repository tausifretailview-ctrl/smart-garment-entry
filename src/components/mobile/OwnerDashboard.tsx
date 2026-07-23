import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  TrendingUp, BarChart3, AlertTriangle, WifiOff, RefreshCw,
  IndianRupee, ShoppingCart, Wallet, Users, Building2, ArrowUpRight,
  ArrowDownRight, Clock, Star, AlertCircle,
} from "lucide-react";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { localDayBounds, saleRowCalendarYmd, todayLocalYmd } from "@/lib/localDayBounds";
import { MOBILE_HOME_SALE_TYPES, MOBILE_SALES_PATH, MOBILE_REPORTS_PATH } from "@/lib/mobileShell";
import { useEffect, useState } from "react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { PullToRefreshIndicator } from "@/components/mobile/PullToRefreshIndicator";
import { invalidateOwnerDashboardQueries } from "@/lib/mobileHubRefresh";
import { withMobileQueryTimeout } from "@/lib/mobileQueryTimeout";
import { MobileModuleNavStrip } from "@/components/mobile/MobileModuleNavStrip";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area,
} from "recharts";
import { useOrganizationReceivablesSummary } from "@/hooks/useOrganizationReceivablesSummary";
import {
  ORGANIZATION_SUPPLIER_PAYABLE_QUERY_KEY,
  fetchOrganizationSupplierPayableSummary,
} from "@/utils/organizationReceivables";
import { resolveFirstAllowedPath } from "@/lib/menuPermissions";

/* ─── helpers ─── */
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` :
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` :
  v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` :
  `₹${Math.round(v).toLocaleString("en-IN")}`;

const BALANCE_STALE_MS = 2 * 60 * 1000;

type ErpDashboardStats = {
  total_sales: number;
  invoice_count: number;
  total_purchase: number;
  purchase_count: number;
  gross_profit: number;
  cash_collection: number;
};

type StatCardConfig = {
  label: string;
  value: number;
  sub: string;
  icon: React.ElementType;
  gradient: string;
  iconBg: string;
  iconColor: string;
  valueClass?: string;
  loading: boolean;
  path: string;
};

/* ─── Skeleton for stat cards ─── */
const StatCardSkeleton = () => (
  <div className="rounded-2xl p-3.5 border border-border/30 shadow-sm bg-card">
    <Skeleton className="h-3 w-16 mb-2" />
    <Skeleton className="h-6 w-24 mb-1" />
    <Skeleton className="h-3 w-12" />
  </div>
);

const TodayHeroSkeleton = () => (
  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
    <Skeleton className="h-3 w-28 mb-4 bg-white/10" />
    <div className="grid grid-cols-2 gap-4 mb-4">
      <Skeleton className="h-10 w-full bg-white/10" />
      <Skeleton className="h-10 w-full bg-white/10" />
    </div>
    <Skeleton className="h-3 w-full mb-2 bg-white/10" />
    <Skeleton className="h-3 w-4/5 bg-white/10" />
  </div>
);

/* ─── Main Component ─── */
export const OwnerDashboard = () => {
  const { currentOrganization, organizationRole } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const { hasMenuAccess, permissions, loading: permissionsLoading } = useUserPermissions();
  // User Rights: Main Dashboard off → no KPI cards / values (same as desktop Index).
  const canAccessMainDashboard =
    permissions === null || hasMenuAccess("main_dashboard");

  const today = todayLocalYmd();
  const { startIso: todayStartIso, endIso: todayEndIso } = localDayBounds(today, today);
  const orgId = currentOrganization?.id;
  const kpisEnabled = !!orgId && !permissionsLoading && canAccessMainDashboard;

  const { scrollRef, isRefreshing, pullHandlers, refresh: handleRefresh } = usePullToRefresh(
    () => invalidateOwnerDashboardQueries(queryClient)
  );

  /* Greeting */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  /* ── Primary KPI: today's stats (single RPC) ── */
  const { data: dashStats, isLoading: dashLoading, isSuccess: dashReady } = useQuery({
    queryKey: ["owner-erp-dashboard-stats", orgId, today],
    queryFn: async () => {
      if (!orgId) return null;
      return withMobileQueryTimeout(async () => {
        const { data, error } = await supabase.rpc("get_erp_dashboard_stats", {
          p_org_id: orgId,
          p_start_date: today,
          p_end_date: today,
        });
        if (error) throw error;
        return data as ErpDashboardStats;
      });
    },
    enabled: kpisEnabled,
    staleTime: BALANCE_STALE_MS,
    refetchInterval: false,
    retry: 1,
  });

  /* ── Primary KPI: org receivables (canonical RPC, shared with Accounts) ── */
  const { summary: receivablesSummary, isLoading: receivablesLoading } =
    useOrganizationReceivablesSummary(orgId, {
      staleTime: BALANCE_STALE_MS,
      enabled: kpisEnabled,
    });

  /* ── Primary KPI: org supplier payables (canonical RPC) ── */
  const { data: supplierSummary, isLoading: supplierLoading } = useQuery({
    queryKey: [ORGANIZATION_SUPPLIER_PAYABLE_QUERY_KEY, "summary", orgId],
    queryFn: () =>
      withMobileQueryTimeout(() => fetchOrganizationSupplierPayableSummary(orgId!)),
    enabled: kpisEnabled,
    staleTime: BALANCE_STALE_MS,
    retry: 1,
  });

  /* Defer secondary sections until main KPI cards are ready */
  const [deferredReady, setDeferredReady] = useState(false);
  useEffect(() => {
    if (!dashReady) return;
    let cancelled = false;
    const enable = () => {
      if (!cancelled) setDeferredReady(true);
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(enable, { timeout: 1200 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }
    const t = window.setTimeout(enable, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [dashReady]);

  const deferredEnabled = deferredReady && kpisEnabled;

  /* ── Deferred: Sales trend (7 days) ── */
  const { data: salesTrend } = useQuery({
    queryKey: ["owner-sales-trend", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      return withMobileQueryTimeout(async () => {
        const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
        const startDate = format(days[0], "yyyy-MM-dd");
        const endDate = format(days[6], "yyyy-MM-dd");
        const { startIso, endIso } = localDayBounds(startDate, endDate);
        const { data } = await supabase
          .from("sales")
          .select("net_amount, sale_date, created_at")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .in("sale_type", [...MOBILE_HOME_SALE_TYPES])
          .gte("sale_date", startIso)
          .lte("sale_date", endIso)
          .order("sale_date");
        return days.map((d) => {
          const dayStr = format(d, "yyyy-MM-dd");
          const label = format(d, "EEE");
          const daySales = data?.filter((s) => saleRowCalendarYmd(s) === dayStr) || [];
          return { name: label, sales: daySales.reduce((s, r) => s + (r.net_amount || 0), 0) };
        });
      });
    },
    enabled: deferredEnabled,
    staleTime: 120000,
    retry: 1,
  });

  /* ── Deferred: Recent activity (last 10) ── */
  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["owner-recent-activity", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      return withMobileQueryTimeout(async () => {
        const [{ data: sales }, { data: purchases }, { data: vouchers }] = await Promise.all([
          supabase
            .from("sales")
            .select("id, sale_number, net_amount, created_at, customer_name")
            .eq("organization_id", currentOrganization.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("purchase_bills")
            .select("id, software_bill_no, net_amount, created_at, supplier_name")
            .eq("organization_id", currentOrganization.id)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
          supabase
            .from("voucher_entries")
            .select("id, voucher_number, total_amount, created_at, voucher_type, description")
            .eq("organization_id", currentOrganization.id)
            .eq("voucher_type", "receipt")
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const items = [
          ...(sales || []).map((s) => ({
            id: s.id, type: "sale" as const, desc: `Sale ${s.sale_number} — ${s.customer_name || "Walk-in"}`,
            amount: s.net_amount || 0, time: s.created_at,
          })),
          ...(purchases || []).map((p) => ({
            id: p.id, type: "purchase" as const, desc: `Purchase ${p.software_bill_no || ""} — ${p.supplier_name || ""}`,
            amount: Number(p.net_amount) || 0, time: p.created_at,
          })),
          ...(vouchers || []).map((v) => ({
            id: v.id, type: "payment" as const, desc: `Receipt ${v.voucher_number} — ${v.description || ""}`,
            amount: Number(v.total_amount) || 0, time: v.created_at,
          })),
        ];
        items.sort((a, b) => new Date(b.time!).getTime() - new Date(a.time!).getTime());
        return items.slice(0, 10);
      });
    },
    enabled: deferredEnabled,
    staleTime: 60000,
    retry: 1,
  });

  /* ── Deferred: CN drift alerts ── */
  const { data: cnDrift, isLoading: cnDriftLoading } = useQuery({
    queryKey: ["owner-cn-drift", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return { count: 0, customers: [] as string[] };
      return withMobileQueryTimeout(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data, error } = await sb
          .from("cn_drift_alerts")
          .select("customer_id, delta, severity")
          .eq("organization_id", currentOrganization.id)
          .eq("check_date", today)
          .neq("severity", "ok");
        if (error) {
          console.warn("cn_drift_alerts query failed (table may not be deployed yet):", error.message);
          return { count: 0, customers: [] };
        }
        const rows = (data || []) as unknown as Array<{ customer_id: string }>;
        return { count: rows.length, customers: rows.map((r) => r.customer_id) };
      });
    },
    enabled: deferredEnabled,
    staleTime: 300000,
    retry: 1,
  });

  /* ── Deferred: Low stock (qty < 5) ── */
  const { data: lowStock, isLoading: lowStockLoading } = useQuery({
    queryKey: ["owner-low-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      return withMobileQueryTimeout(async () => {
        const { data } = await supabase
          .from("product_variants")
          .select("id, size, color, stock_qty, barcode, products!inner(product_name, brand, organization_id)")
          .eq("organization_id", currentOrganization.id)
          .eq("products.organization_id", currentOrganization.id)
          .lt("stock_qty", 5)
          .gte("stock_qty", 0)
          .order("stock_qty", { ascending: true })
          .limit(5);
        return (data || []).map((v) => ({
          id: v.id,
          name: v.products.product_name,
          brand: v.products.brand,
          size: v.size,
          color: v.color,
          qty: v.stock_qty || 0,
        }));
      });
    },
    enabled: deferredEnabled,
    staleTime: 120000,
    retry: 1,
  });

  /* ── Deferred: Top selling today ── */
  const { data: topSelling, isLoading: topSellingLoading } = useQuery({
    queryKey: ["owner-top-selling", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return [];
      return withMobileQueryTimeout(async () => {
        const { data } = await supabase
          .from("sale_items")
          .select("product_name, size, quantity, line_total, sales!inner(organization_id, sale_date, deleted_at)")
          .eq("sales.organization_id", currentOrganization.id)
          .is("sales.deleted_at", null)
          .gte("sales.sale_date", todayStartIso)
          .lte("sales.sale_date", todayEndIso);

        const map = new Map<string, { name: string; size: string; qty: number; revenue: number }>();
        (data || []).forEach((item) => {
          const key = `${item.product_name}||${item.size}`;
          const existing = map.get(key) || { name: item.product_name, size: item.size, qty: 0, revenue: 0 };
          existing.qty += item.quantity || 0;
          existing.revenue += item.line_total || 0;
          map.set(key, existing);
        });
        return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
      });
    },
    enabled: deferredEnabled,
    staleTime: 60000,
    retry: 1,
  });

  const totalSales = dashStats?.total_sales ?? 0;
  const salesCount = dashStats?.invoice_count ?? 0;
  const totalPurchase = dashStats?.total_purchase ?? 0;
  const purchaseCount = dashStats?.purchase_count ?? 0;
  const grossProfit = dashStats?.gross_profit ?? 0;
  const cashCollection = dashStats?.cash_collection ?? 0;
  const profitMarginPct =
    totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : "0.0";

  const customerOs = receivablesSummary.netReceivable;
  const customersPending = receivablesSummary.customersOwing;
  const supplierOs = Math.max(0, supplierSummary?.netOutstanding ?? 0);
  const suppliersPending = supplierSummary?.supplierCount ?? 0;

  /* ── Stat cards config ── */
  const statCards: StatCardConfig[] = [
    {
      label: "Today's Sale",
      value: totalSales,
      sub: `${salesCount} bill${salesCount === 1 ? "" : "s"} today`,
      icon: IndianRupee,
      gradient: "bg-gradient-to-br from-emerald-500/15 via-emerald-500/8 to-card",
      iconBg: "bg-emerald-500/20",
      iconColor: "text-emerald-600",
      loading: dashLoading,
      path: MOBILE_SALES_PATH,
    },
    {
      label: "Today's Purchase",
      value: totalPurchase,
      sub: `${purchaseCount} bill${purchaseCount === 1 ? "" : "s"} today`,
      icon: ShoppingCart,
      gradient: "bg-gradient-to-br from-amber-500/15 via-amber-500/8 to-card",
      iconBg: "bg-amber-500/20",
      iconColor: "text-amber-600",
      loading: dashLoading,
      path: "/owner-purchases",
    },
    {
      label: "Today's Profit",
      value: grossProfit,
      sub: `${profitMarginPct}% margin`,
      icon: TrendingUp,
      gradient: "bg-gradient-to-br from-primary/15 via-primary/8 to-card",
      iconBg: "bg-primary/20",
      iconColor: "text-primary",
      valueClass: grossProfit >= 0 ? "text-emerald-600" : "text-destructive",
      loading: dashLoading,
      path: `${MOBILE_REPORTS_PATH}?report=profit-loss`,
    },
    {
      label: "Payment Received",
      value: cashCollection,
      sub: "Cash + UPI + Card",
      icon: Wallet,
      gradient: "bg-gradient-to-br from-teal-500/15 via-teal-500/8 to-card",
      iconBg: "bg-teal-500/20",
      iconColor: "text-teal-600",
      loading: dashLoading,
      path: `${MOBILE_REPORTS_PATH}?report=payment-collection`,
    },
    {
      label: "Customer O/S",
      value: customerOs,
      sub: `${customersPending} customer${customersPending === 1 ? "" : "s"} pending`,
      icon: Users,
      gradient: "bg-gradient-to-br from-rose-500/15 via-rose-500/8 to-card",
      iconBg: "bg-rose-500/20",
      iconColor: "text-rose-600",
      valueClass: "text-destructive",
      loading: receivablesLoading,
      path: `${MOBILE_REPORTS_PATH}?report=customer-balance`,
    },
    {
      label: "Supplier O/S",
      value: supplierOs,
      sub: `${suppliersPending} supplier${suppliersPending === 1 ? "" : "s"} pending`,
      icon: Building2,
      gradient: "bg-gradient-to-br from-orange-500/15 via-orange-500/8 to-card",
      iconBg: "bg-orange-500/20",
      iconColor: "text-orange-600",
      valueClass: "text-destructive",
      loading: supplierLoading,
      path: `${MOBILE_REPORTS_PATH}?report=supplier-balance`,
    },
  ];

  const activityIcon = { sale: ArrowUpRight, purchase: ArrowDownRight, payment: Wallet };
  const activityColor = { sale: "text-success", purchase: "text-warning", payment: "text-primary" };
  const activityBg = { sale: "bg-success/10", purchase: "bg-warning/10", payment: "bg-primary/10" };

  useEffect(() => {
    if (permissionsLoading) return;
    if (canAccessMainDashboard) return;
    const fallback = resolveFirstAllowedPath(hasMenuAccess, permissions, organizationRole);
    orgNavigate(fallback ? `/${fallback}` : "/pos-sales");
  }, [
    permissionsLoading,
    canAccessMainDashboard,
    hasMenuAccess,
    permissions,
    organizationRole,
    orgNavigate,
  ]);

  if (permissionsLoading || !canAccessMainDashboard) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-muted/30 pb-24"
      {...pullHandlers}
    >
      <PullToRefreshIndicator visible={isRefreshing} />

      {/* ── HEADER + TODAY HERO ── */}
      <div className="relative bg-gradient-to-br from-[#0a0f1e] via-[#111827] to-[#1e2a4a] px-4 pt-5 pb-5 overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-blue-500/5 rounded-full blur-2xl" />
        <div className="relative flex items-start justify-between mb-1">
          <div>
            <h1 className="text-lg font-semibold text-white">{greeting}!</h1>
            <p className="text-xs text-white/60 mt-0.5">{currentOrganization?.name}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-all touch-manipulation"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={cn("h-4 w-4 text-white/70", isRefreshing && "animate-spin")} />
          </button>
        </div>

        {/* Today at a glance — reuses dashStats + receivables (no extra query) */}
        {dashLoading ? (
          <TodayHeroSkeleton />
        ) : (
          <div className="relative mt-4 rounded-2xl border border-white/10 bg-white/[0.07] backdrop-blur-sm p-4 shadow-lg shadow-black/20">
            <p className="text-xs font-medium text-white/70">
              Today · {format(new Date(), "EEE, d MMM")}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/50">Revenue</p>
                <p className="text-xl font-bold text-white tabular-nums mt-0.5">{fmtShort(totalSales)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/50">Profit</p>
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums mt-0.5",
                    grossProfit >= 0 ? "text-emerald-300" : "text-rose-300",
                  )}
                >
                  {fmtShort(grossProfit)}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-white/60 tabular-nums">
              Bills:{" "}
              <span className="text-white/90 font-medium">{salesCount}</span> sales ·{" "}
              <span className="text-white/90 font-medium">{purchaseCount}</span> purchases
            </p>
            <p className="mt-1.5 text-xs text-white/60 tabular-nums">
              Collected:{" "}
              <span className="text-emerald-300 font-medium">{fmtShort(cashCollection)}</span>
              {" · "}
              Outstanding:{" "}
              {receivablesLoading ? (
                <span className="text-white/40">…</span>
              ) : (
                <span className="text-rose-300 font-medium">{fmtShort(customerOs)}</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* ── STAT CARDS 2×3 ── */}
      <div className="px-4 mt-3 relative z-10">
        <div className="grid grid-cols-2 gap-2.5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return card.loading ? (
              <StatCardSkeleton key={card.label} />
            ) : (
              <button
                type="button"
                key={card.label}
                onClick={() => orgNavigate(card.path)}
                className={cn(
                  "rounded-2xl p-3.5 border border-border/30 shadow-sm text-left",
                  "active:scale-[0.98] touch-manipulation transition-transform",
                  card.gradient,
                )}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {card.label}
                  </span>
                  <div className={cn("w-7 h-7 rounded-full flex items-center justify-center", card.iconBg)}>
                    <Icon className={cn("h-3.5 w-3.5", card.iconColor)} />
                  </div>
                </div>
                <p className={cn("text-lg font-bold tabular-nums leading-tight", card.valueClass || "text-foreground")}>
                  {fmtShort(card.value)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
              </button>
            );
          })}
        </div>
      </div>

      <MobileModuleNavStrip className="mt-4" />

      {/* ── SALES TREND — Last 7 Days ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Sales Trend — Last 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-3">
            {salesTrend !== undefined ? (
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={salesTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                  <RechartsTooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                    formatter={(v: number) => [fmt(v), "Sales"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#salesGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[160px] flex items-center justify-center">
                <Skeleton className="h-full w-full rounded-lg" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── RECENT ACTIVITY ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {activityLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-3/4 mb-1" />
                      <Skeleton className="h-2.5 w-16" />
                    </div>
                    <Skeleton className="h-4 w-14" />
                  </div>
                ))}
              </div>
            ) : recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-0">
                {recentActivity.map((item, idx) => {
                  const Icon = activityIcon[item.type];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.type === "sale") orgNavigate(MOBILE_SALES_PATH);
                        else if (item.type === "purchase") orgNavigate("/owner-purchases");
                        else orgNavigate(`${MOBILE_REPORTS_PATH}?report=payment-collection`);
                      }}
                      className={cn(
                        "w-full flex items-center gap-3 py-2.5 touch-manipulation active:bg-muted/50 transition-colors",
                        idx < recentActivity.length - 1 && "border-b border-border/40"
                      )}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", activityBg[item.type])}>
                        <Icon className={cn("h-4 w-4", activityColor[item.type])} />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{item.desc}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.time ? formatDistanceToNow(new Date(item.time), { addSuffix: true }) : ""}
                        </p>
                      </div>
                      <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">
                        {fmtShort(item.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── CN DRIFT ALERTS ── */}
      {(cnDriftLoading || (cnDrift?.count ?? 0) > 0) && (
        <div className="px-4 mt-5">
          <Card className="border-destructive/30 bg-destructive/5">
            <CardHeader className="pb-2 px-4 pt-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                CN Drift
                {!cnDriftLoading && cnDrift && cnDrift.count > 0 && (
                  <span className="ml-auto text-[10px] bg-destructive/15 text-destructive font-bold px-2 py-0.5 rounded-full">
                    {cnDrift.count} customer{cnDrift.count === 1 ? "" : "s"}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {cnDriftLoading ? (
                <Skeleton className="h-4 w-full" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  Credit-note voucher totals diverge from CN headers for {cnDrift?.count} customer
                  {cnDrift?.count === 1 ? "" : "s"} today. Review in Accounts → Customer reconciliation.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── LOW STOCK ALERTS ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Low Stock
              {lowStock && lowStock.length > 0 && (
                <span className="ml-auto text-[10px] bg-warning/15 text-warning font-bold px-2 py-0.5 rounded-full">
                  {lowStock.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {lowStockLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            ) : lowStock && lowStock.length > 0 ? (
              <div className="space-y-0">
                {lowStock.map((item, idx) => (
                  <div
                    key={item.id}
                    className={cn(
                      "flex items-center justify-between py-2",
                      idx < lowStock.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">
                        {item.name} {item.color ? `(${item.color})` : ""}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{item.brand} • {item.size}</p>
                    </div>
                    <span className="text-xs font-bold text-destructive tabular-nums ml-2">
                      {item.qty}
                    </span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => orgNavigate("/owner-stock")}
                  className="w-full text-center text-[11px] font-medium text-primary pt-2 touch-manipulation"
                >
                  View All →
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">All stock levels OK</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── TOP SELLING TODAY ── */}
      <div className="px-4 mt-5 mb-6">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="h-4 w-4 text-warning" />
              Top Selling Today
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {topSellingLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : topSelling && topSelling.length > 0 ? (
              <div className="space-y-0">
                {topSelling.map((item, idx) => (
                  <div
                    key={`${item.name}-${item.size}`}
                    className={cn(
                      "flex items-center gap-2.5 py-2",
                      idx < topSelling.length - 1 && "border-b border-border/40"
                    )}
                  >
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">Size: {item.size} • Qty: {item.qty}</p>
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">
                      {fmtShort(item.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No sales today yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Offline banner */}
      {!isOnline && (
        <div className="mx-4 mb-6 bg-warning/10 border border-warning/30 rounded-2xl px-4 py-3 flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-warning shrink-0" />
          <p className="text-xs text-warning">You're offline — showing cached data</p>
        </div>
      )}
    </div>
  );
};
