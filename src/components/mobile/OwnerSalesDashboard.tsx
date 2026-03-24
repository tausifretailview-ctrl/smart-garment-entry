import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  IndianRupee, FileText, ShoppingBag, TrendingUp, CreditCard,
  Banknote, Smartphone, Receipt, Users, Tag, CalendarIcon, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts";

/* ─── Helpers ─── */
const fmt = (v: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(v);

const fmtShort = (v: number) =>
  v >= 10000000 ? `₹${(v / 10000000).toFixed(1)}Cr` :
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` :
  v >= 1000 ? `₹${(v / 1000).toFixed(1)}K` :
  `₹${Math.round(v).toLocaleString("en-IN")}`;

interface Props {
  period: "today" | "week" | "month" | "custom";
  setPeriod: (p: "today" | "week" | "month" | "custom") => void;
  customRange: { from: Date; to: Date } | null;
  setCustomRange: (r: { from: Date; to: Date } | null) => void;
  onViewAllBills: () => void;
  onViewBill: (id: string) => void;
}

function getDateRange(period: string, custom: { from: Date; to: Date } | null) {
  const now = new Date();
  switch (period) {
    case "week":
      return { start: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"), end: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd") };
    case "month":
      return { start: format(startOfMonth(now), "yyyy-MM-dd"), end: format(endOfMonth(now), "yyyy-MM-dd") };
    case "custom":
      if (custom) return { start: format(custom.from, "yyyy-MM-dd"), end: format(custom.to, "yyyy-MM-dd") };
      return { start: format(now, "yyyy-MM-dd"), end: format(now, "yyyy-MM-dd") };
    default:
      return { start: format(now, "yyyy-MM-dd"), end: format(now, "yyyy-MM-dd") };
  }
}

const PIE_COLORS = [
  "hsl(var(--success))",
  "hsl(var(--primary))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
];

export const OwnerSalesDashboard = ({ period, setPeriod, customRange, setCustomRange, onViewAllBills, onViewBill }: Props) => {
  const { currentOrganization } = useOrganization();
  const { start, end } = getDateRange(period, customRange);
  const [showFromCal, setShowFromCal] = useState(false);
  const [showToCal, setShowToCal] = useState(false);

  /* ── Sales data ── */
  const { data: salesData, isLoading } = useQuery({
    queryKey: ["owner-sales-dash", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization) return null;
      const { data: sales } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, gross_amount, discount_amount, payment_method, customer_name, customer_id, cash_amount, upi_amount, card_amount, total_qty, sale_date, payment_status")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .gte("sale_date", start)
        .lte("sale_date", end + "T23:59:59")
        .order("sale_date", { ascending: false });
      return sales || [];
    },
    enabled: !!currentOrganization,
    staleTime: 30000,
  });

  /* ── Sale items for top products & brand analysis ── */
  const { data: itemsData } = useQuery({
    queryKey: ["owner-sales-items", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization) return [];
      const { data } = await supabase
        .from("sale_items")
        .select("product_name, product_id, size, quantity, line_total, sales!inner(organization_id, sale_date, deleted_at, is_cancelled)")
        .eq("sales.organization_id", currentOrganization.id)
        .is("sales.deleted_at", null)
        .eq("sales.is_cancelled", false)
        .gte("sales.sale_date", start)
        .lte("sales.sale_date", end + "T23:59:59");
      return data || [];
    },
    enabled: !!currentOrganization,
    staleTime: 30000,
  });

  /* ── Brand data ── */
  const { data: brandData } = useQuery({
    queryKey: ["owner-sales-brands", currentOrganization?.id, start, end],
    queryFn: async () => {
      if (!currentOrganization || !itemsData?.length) return [];
      const productIds = [...new Set(itemsData.map((i) => i.product_id))];
      if (!productIds.length) return [];
      const { data } = await supabase
        .from("products")
        .select("id, brand")
        .in("id", productIds.slice(0, 500));
      return data || [];
    },
    enabled: !!currentOrganization && (itemsData?.length || 0) > 0,
    staleTime: 60000,
  });

  /* ── Computed stats ── */
  const stats = useMemo(() => {
    if (!salesData) return { total: 0, count: 0, avg: 0, qty: 0, cash: 0, upi: 0, card: 0, credit: 0 };
    const total = salesData.reduce((s, r) => s + (r.net_amount || 0), 0);
    const count = salesData.length;
    const qty = salesData.reduce((s, r) => s + (r.total_qty || 0), 0);
    const cash = salesData.reduce((s, r) => s + (r.cash_amount || 0), 0);
    const upi = salesData.reduce((s, r) => s + (r.upi_amount || 0), 0);
    const card = salesData.reduce((s, r) => s + (r.card_amount || 0), 0);
    const credit = total - cash - upi - card;
    return { total, count, avg: count ? total / count : 0, qty, cash, upi, card, credit: Math.max(0, credit) };
  }, [salesData]);

  /* Top products */
  const topProducts = useMemo(() => {
    if (!itemsData?.length) return [];
    const map = new Map<string, { name: string; size: string; qty: number; revenue: number }>();
    itemsData.forEach((i) => {
      const key = `${i.product_name}||${i.size}`;
      const ex = map.get(key) || { name: i.product_name, size: i.size, qty: 0, revenue: 0 };
      ex.qty += i.quantity || 0;
      ex.revenue += i.line_total || 0;
      map.set(key, ex);
    });
    return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [itemsData]);

  /* Top customers */
  const topCustomers = useMemo(() => {
    if (!salesData?.length) return [];
    const map = new Map<string, { name: string; bills: number; total: number }>();
    salesData.forEach((s) => {
      const key = s.customer_name || "Walk-in";
      const ex = map.get(key) || { name: key, bills: 0, total: 0 };
      ex.bills++;
      ex.total += s.net_amount || 0;
      map.set(key, ex);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10);
  }, [salesData]);

  /* Brand sales */
  const brandSales = useMemo(() => {
    if (!itemsData?.length || !brandData?.length) return [];
    const prodBrand = new Map(brandData.map((p) => [p.id, p.brand || "Unknown"]));
    const map = new Map<string, number>();
    itemsData.forEach((i) => {
      const brand = prodBrand.get(i.product_id) || "Unknown";
      map.set(brand, (map.get(brand) || 0) + (i.line_total || 0));
    });
    return [...map.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
  }, [itemsData, brandData]);

  /* Payment pie data */
  const paymentPie = useMemo(() => {
    const items = [
      { name: "Cash", value: stats.cash },
      { name: "UPI", value: stats.upi },
      { name: "Card", value: stats.card },
      { name: "Credit", value: stats.credit },
    ].filter((i) => i.value > 0);
    return items;
  }, [stats]);

  const summaryCards = [
    { label: "Total Sale", value: stats.total, icon: IndianRupee, tint: "bg-success/10", color: "text-success" },
    { label: "Bills", value: stats.count, icon: FileText, tint: "bg-primary/10", color: "text-primary", raw: true },
    { label: "Avg Bill", value: stats.avg, icon: TrendingUp, tint: "bg-info/10", color: "text-info" },
    { label: "Items Sold", value: stats.qty, icon: ShoppingBag, tint: "bg-warning/10", color: "text-warning", raw: true },
  ];

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      {/* ── Period Toggle ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex gap-2">
          {(["today", "week", "month", "custom"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "flex-1 text-xs font-semibold py-2 rounded-lg transition-all touch-manipulation",
                period === p
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {p === "today" ? "Today" : p === "week" ? "This Week" : p === "month" ? "This Month" : "Custom"}
            </button>
          ))}
        </div>
        {/* Custom date pickers */}
        {period === "custom" && (
          <div className="flex gap-2 mt-2">
            <Popover open={showFromCal} onOpenChange={setShowFromCal}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 text-xs justify-start">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {customRange?.from ? format(customRange.from, "dd MMM") : "From"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={customRange?.from}
                  onSelect={(d) => {
                    if (d) setCustomRange({ from: d, to: customRange?.to || d });
                    setShowFromCal(false);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Popover open={showToCal} onOpenChange={setShowToCal}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-1 text-xs justify-start">
                  <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                  {customRange?.to ? format(customRange.to, "dd MMM") : "To"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={customRange?.to}
                  onSelect={(d) => {
                    if (d) setCustomRange({ from: customRange?.from || d, to: d });
                    setShowToCal(false);
                  }}
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {/* ── Summary Cards (horizontal scroll) ── */}
      <div className="px-4 mt-4">
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 snap-x">
          {summaryCards.map((c) => {
            const Icon = c.icon;
            return (
              <div
                key={c.label}
                className="min-w-[140px] snap-start bg-card rounded-2xl p-3.5 border border-border/40 shadow-sm shrink-0"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", c.tint)}>
                    <Icon className={cn("h-3.5 w-3.5", c.color)} />
                  </div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-6 w-20" />
                ) : (
                  <p className="text-lg font-bold text-foreground tabular-nums">
                    {c.raw ? Math.round(c.value).toLocaleString("en-IN") : fmtShort(c.value)}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Payment Mode Breakdown ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Payment Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {isLoading ? (
              <Skeleton className="h-[120px] w-full" />
            ) : paymentPie.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={paymentPie} dataKey="value" cx="50%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2}>
                      {paymentPie.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1.5">
                  {paymentPie.map((item, i) => {
                    const pct = stats.total > 0 ? ((item.value / stats.total) * 100).toFixed(0) : "0";
                    const icons = [Banknote, Smartphone, CreditCard, Receipt];
                    const Icon = icons[i % icons.length];
                    return (
                      <div key={item.name} className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span className="text-xs text-foreground flex-1">{item.name}</span>
                        <span className="text-xs font-semibold tabular-nums">{fmtShort(item.value)}</span>
                        <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No sales data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── View All Bills Button ── */}
      <div className="px-4 mt-4">
        <button
          onClick={onViewAllBills}
          className="w-full flex items-center justify-between bg-card rounded-2xl px-4 py-3 border border-border/40 shadow-sm active:scale-[0.98] transition-all touch-manipulation"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">View All Bills</p>
              <p className="text-[10px] text-muted-foreground">{stats.count} bills in period</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* ── Top Selling Products ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-warning" />
              Top Selling Products
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {topProducts.length > 0 ? (
              <div className="space-y-0">
                {topProducts.map((item, idx) => (
                  <div
                    key={`${item.name}-${item.size}`}
                    className={cn("flex items-center gap-2.5 py-2", idx < topProducts.length - 1 && "border-b border-border/40")}
                  >
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">Size: {item.size} • Qty: {item.qty}</p>
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{fmtShort(item.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Top Customers ── */}
      <div className="px-4 mt-5">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Top Customers
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {topCustomers.length > 0 ? (
              <div className="space-y-0">
                {topCustomers.map((c, idx) => (
                  <div
                    key={c.name}
                    className={cn("flex items-center gap-2.5 py-2", idx < topCustomers.length - 1 && "border-b border-border/40")}
                  >
                    <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.bills} bills</p>
                    </div>
                    <span className="text-xs font-semibold text-foreground tabular-nums shrink-0">{fmtShort(c.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Brand Sales ── */}
      <div className="px-4 mt-5 mb-6">
        <Card className="border-border/40">
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Tag className="h-4 w-4 text-accent" />
              Brand-wise Sales
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            {brandSales.length > 0 ? (
              <div className="space-y-0">
                {brandSales.slice(0, 10).map((b, idx) => (
                  <div
                    key={b.name}
                    className={cn("flex items-center justify-between py-2", idx < Math.min(brandSales.length, 10) - 1 && "border-b border-border/40")}
                  >
                    <span className="text-xs font-medium text-foreground">{b.name}</span>
                    <span className="text-xs font-semibold text-foreground tabular-nums">{fmtShort(b.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">No data for this period</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
