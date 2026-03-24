import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";
import {
  TrendingUp, BarChart3, Package, AlertTriangle, WifiOff, RefreshCw,
  IndianRupee, ShoppingCart, Wallet, Users, Building2, ArrowUpRight,
  ArrowDownRight, Clock, Star, AlertCircle,
} from "lucide-react";
import { format, subDays, formatDistanceToNow } from "date-fns";
import { useRef, useState, useEffect, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip,
  AreaChart, Area,
} from "recharts";

/* ─── helpers ─── */
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` :
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` :
  v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` :
  `₹${Math.round(v).toLocaleString("en-IN")}`;

/* ─── Skeleton for stat cards ─── */
const StatCardSkeleton = () => (
  <div className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm">
    <Skeleton className="h-3 w-16 mb-2" />
    <Skeleton className="h-6 w-24 mb-1" />
    <Skeleton className="h-3 w-12" />
  </div>
);

/* ─── Main Component ─── */
export const OwnerDashboard = () => {
  const { currentOrganization } = useOrganization();
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { getRefreshInterval } = useTierBasedRefresh();

  const today = format(new Date(), "yyyy-MM-dd");

  /* Pull-to-refresh */
  const scrollRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 80 && scrollRef.current && scrollRef.current.scrollTop <= 0) {
      handleRefresh();
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["owner-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-sales-trend"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-recent-activity"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-low-stock"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-top-selling"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-purchase-today"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-payments-today"] }),
      queryClient.invalidateQueries({ queryKey: ["owner-outstanding"] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  /* Greeting */
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  /* ── Query: Today's sales ── */
  const { data: todaySales, isLoading: salesLoading } = useQuery({
    queryKey: ["owner-dashboard", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0 };
      const { data } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", today)
        .lte("sale_date", today + "T23:59:59");
      const total = data?.reduce((s, r) => s + (r.net_amount || 0), 0) || 0;
      return { total, count: data?.length || 0 };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
    refetchInterval: getRefreshInterval("fast"),
  });

  /* ── Query: Today's purchases ── */
  const { data: todayPurchase, isLoading: purchaseLoading } = useQuery({
    queryKey: ["owner-purchase-today", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0 };
      const { data } = await supabase
        .from("purchase_bills")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", today)
        .lte("bill_date", today + "T23:59:59");
      const total = data?.reduce((s, r) => s + (Number(r.net_amount) || 0), 0) || 0;
      return { total, count: data?.length || 0 };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
    refetchInterval: getRefreshInterval("medium"),
  });

  /* ── Query: Payments received today (from voucher receipts) ── */
  const { data: paymentsToday, isLoading: paymentsLoading } = useQuery({
    queryKey: ["owner-payments-today", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      const { data } = await supabase
        .from("voucher_entries")
        .select("total_amount")
        .eq("organization_id", currentOrganization.id)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null)
        .gte("voucher_date", today)
        .lte("voucher_date", today + "T23:59:59");
      return data?.reduce((s, r) => s + (Number(r.total_amount) || 0), 0) || 0;
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
    refetchInterval: getRefreshInterval("medium"),
  });

  /* ── Query: Outstanding balances ── */
  const { data: outstanding, isLoading: outstandingLoading } = useQuery({
    queryKey: ["owner-outstanding", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return { customer: 0, supplier: 0 };
      const [{ data: cust }, { data: supp }] = await Promise.all([
        supabase.from("customers").select("opening_balance").eq("organization_id", currentOrganization.id).is("deleted_at", null),
        supabase.from("suppliers").select("opening_balance").eq("organization_id", currentOrganization.id).is("deleted_at", null),
      ]);
      return {
        customer: cust?.reduce((s, r) => s + (r.opening_balance || 0), 0) || 0,
        supplier: supp?.reduce((s, r) => s + (r.opening_balance || 0), 0) || 0,
      };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 120000,
  });

  /* ── Query: Sales trend (7 days) ── */
  const { data: salesTrend } = useQuery({
    queryKey: ["owner-sales-trend", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const days = Array.from({ length: 7 }, (_, i) => subDays(new Date(), 6 - i));
      const startDate = format(days[0], "yyyy-MM-dd");
      const { data } = await supabase
        .from("sales")
        .select("net_amount, sale_date")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", startDate)
        .order("sale_date");
      return days.map((d) => {
        const dayStr = format(d, "yyyy-MM-dd");
        const label = format(d, "EEE");
        const daySales = data?.filter((s) => s.sale_date?.startsWith(dayStr)) || [];
        return { name: label, sales: daySales.reduce((s, r) => s + (r.net_amount || 0), 0) };
      });
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 120000,
  });

  /* ── Query: Recent activity (last 10) ── */
  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ["owner-recent-activity", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const [{ data: sales }, { data: purchases }, { data: payments }] = await Promise.all([
        supabase
          .from("sales")
          .select("id, bill_number, net_amount, created_at, customer_name")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("purchase_bills")
          .select("id, bill_number, net_amount, created_at, supplier_name")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("customer_payments")
          .select("id, amount, created_at, customer_name, payment_method")
          .eq("organization_id", currentOrganization.id)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      const items = [
        ...(sales || []).map((s) => ({
          id: s.id, type: "sale" as const, desc: `Sale ${s.bill_number} — ${s.customer_name || "Walk-in"}`,
          amount: s.net_amount || 0, time: s.created_at,
        })),
        ...(purchases || []).map((p) => ({
          id: p.id, type: "purchase" as const, desc: `Purchase ${p.bill_number} — ${p.supplier_name || ""}`,
          amount: Number(p.net_amount) || 0, time: p.created_at,
        })),
        ...(payments || []).map((p) => ({
          id: p.id, type: "payment" as const, desc: `Payment — ${p.customer_name || "Unknown"} (${p.payment_method || "cash"})`,
          amount: Number(p.amount) || 0, time: p.created_at,
        })),
      ];
      items.sort((a, b) => new Date(b.time!).getTime() - new Date(a.time!).getTime());
      return items.slice(0, 10);
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
  });

  /* ── Query: Low stock (qty < 5) ── */
  const { data: lowStock, isLoading: lowStockLoading } = useQuery({
    queryKey: ["owner-low-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("product_variants")
        .select("id, size, color, stock_qty, barcode, products!inner(product_name, brand, organization_id)")
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
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 120000,
  });

  /* ── Query: Top selling today ── */
  const { data: topSelling, isLoading: topSellingLoading } = useQuery({
    queryKey: ["owner-top-selling", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("sale_items")
        .select("product_name, size, quantity, line_total, sales!inner(organization_id, sale_date, deleted_at)")
        .eq("sales.organization_id", currentOrganization.id)
        .is("sales.deleted_at", null)
        .gte("sales.sale_date", today)
        .lte("sales.sale_date", today + "T23:59:59");
      
      // aggregate by product_name + size
      const map = new Map<string, { name: string; size: string; qty: number; revenue: number }>();
      (data || []).forEach((item) => {
        const key = `${item.product_name}||${item.size}`;
        const existing = map.get(key) || { name: item.product_name, size: item.size, qty: 0, revenue: 0 };
        existing.qty += item.quantity || 0;
        existing.revenue += item.line_total || 0;
        map.set(key, existing);
      });
      return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
  });

  const allLoading = salesLoading || purchaseLoading;
  const profitToday = (todaySales?.total || 0) - (todayPurchase?.total || 0);

  /* ── Stat cards config ── */
  const statCards = [
    { label: "Today's Sale", value: todaySales?.total || 0, sub: `${todaySales?.count || 0} bills`, icon: IndianRupee, tint: "bg-success/10", iconColor: "text-success", loading: salesLoading },
    { label: "Today's Purchase", value: todayPurchase?.total || 0, sub: `${todayPurchase?.count || 0} bills`, icon: ShoppingCart, tint: "bg-warning/10", iconColor: "text-warning", loading: purchaseLoading },
    { label: "Today's Profit", value: profitToday, sub: profitToday >= 0 ? "Positive" : "Loss", icon: TrendingUp, tint: "bg-primary/10", iconColor: "text-primary", loading: allLoading },
    { label: "Payment Received", value: paymentsToday || 0, sub: "Today", icon: Wallet, tint: "bg-success/10", iconColor: "text-success", loading: paymentsLoading },
    { label: "Customer O/S", value: outstanding?.customer || 0, sub: "Pending", icon: Users, tint: "bg-destructive/10", iconColor: "text-destructive", loading: outstandingLoading },
    { label: "Supplier O/S", value: outstanding?.supplier || 0, sub: "Pending", icon: Building2, tint: "bg-destructive/10", iconColor: "text-destructive", loading: outstandingLoading },
  ];

  const activityIcon = { sale: ArrowUpRight, purchase: ArrowDownRight, payment: Wallet };
  const activityColor = { sale: "text-success", purchase: "text-warning", payment: "text-primary" };
  const activityBg = { sale: "bg-success/10", purchase: "bg-warning/10", payment: "bg-primary/10" };

  return (
    <div
      ref={scrollRef}
      className="min-h-screen bg-muted/30 pb-24 overflow-y-auto"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull-to-refresh indicator */}
      {isRefreshing && (
        <div className="flex justify-center py-2">
          <RefreshCw className="h-5 w-5 text-primary animate-spin" />
        </div>
      )}

      {/* ── HEADER ── */}
      <div className="relative bg-gradient-to-br from-[#0a0f1e] via-[#111827] to-[#1e2a4a] px-4 pt-5 pb-14 overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl" />
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-lg font-semibold text-white">{greeting}!</h1>
            <p className="text-xs text-white/60 mt-0.5">{currentOrganization?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center active:scale-90 transition-all touch-manipulation"
            >
              <RefreshCw className={cn("h-4 w-4 text-white/70", isRefreshing && "animate-spin")} />
            </button>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{format(new Date(), "EEE, d MMM yyyy")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── STAT CARDS 2×3 ── */}
      <div className="px-4 -mt-8 relative z-10">
        <div className="grid grid-cols-2 gap-2.5">
          {statCards.map((card) => {
            const Icon = card.icon;
            return card.loading ? (
              <StatCardSkeleton key={card.label} />
            ) : (
              <div
                key={card.label}
                className="bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    {card.label}
                  </span>
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", card.tint)}>
                    <Icon className={cn("h-3.5 w-3.5", card.iconColor)} />
                  </div>
                </div>
                <p className="text-lg font-bold text-foreground tabular-nums leading-tight">
                  {fmtShort(card.value)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{card.sub}</p>
              </div>
            );
          })}
        </div>
      </div>

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
            {salesTrend && salesTrend.length > 0 ? (
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
                      onClick={() => alert(`ID: ${item.id}`)}
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
                <button className="w-full text-center text-[11px] font-medium text-primary pt-2 touch-manipulation">
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
