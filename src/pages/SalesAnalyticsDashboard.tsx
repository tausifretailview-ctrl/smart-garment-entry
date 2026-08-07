import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  InsightsKpiCard,
  InsightsPanel,
} from "@/components/business-insights/insightsLayout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
fix/swr-cache-buster-ymd-keys
import { format, subDays, startOfMonth, endOfMonth, startOfYear, subMonths, parseISO, startOfWeek, endOfWeek, startOfDay } from "date-fns";
import { CalendarIcon, TrendingUp, IndianRupee, ShoppingCart, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
=======
import { format, subDays, startOfMonth, endOfMonth, startOfYear, subMonths, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { CalendarIcon, TrendingUp, IndianRupee, ShoppingCart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ReportPageSkeleton } from "@/components/skeletons/ReportPageSkeleton";
main
import { cn } from "@/lib/utils";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

type PeriodType = "today" | "yesterday" | "this-week" | "last-week" | "this-month" | "last-month" | "this-year" | "custom";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#10b981",
  "#f59e0b",
  "#ef4444",
];

const CHART_ANIM = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: "ease-out" as const,
};

export default function SalesAnalyticsDashboard() {
  const { currentOrganization } = useOrganization();
  const reduceMotion = usePrefersReducedMotion();
  const chartAnim = { ...CHART_ANIM, isAnimationActive: !reduceMotion };
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabFromUrl || "overview");
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [startDate, setStartDate] = useState<Date>(() => startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(() => startOfDay(new Date()));

  const salesAnalyticsFilterSnapshot = useMemo(
    () => ({
      activeTab,
      periodType,
      startDate,
      endDate,
    }),
    [activeTab, periodType, startDate, endDate],
  );

  useDashboardFilterPersistence(
    "sales-analytics",
    currentOrganization?.id,
    salesAnalyticsFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["activeTab", setActiveTab],
          ["periodType", (v) => setPeriodType(v as PeriodType)],
        ],
        requiredDates: [
          ["startDate", setStartDate],
          ["endDate", setEndDate],
        ],
      });
    },
  );
  
  // Sync tab from URL on mount
  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  // Calculate date range based on period type (day-normalized Dates for UI / queryFn).
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    switch (periodType) {
      case "today":
        return { start: today, end: today };
      case "yesterday": {
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: yesterday };
      }
      case "this-week":
        return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
      case "last-week": {
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        return { start: lastWeekStart, end: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
      }
      case "this-month":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "last-month": {
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case "this-year":
        return { start: startOfYear(today), end: today };
      case "custom":
        return { start: startOfDay(startDate), end: startOfDay(endDate) };
      default:
        return { start: startOfMonth(today), end: today };
    }
  }, [periodType, startDate, endDate]);

  // Stable cache keys — never put raw Date / range objects in queryKey.
  const rangeStartYmd = format(dateRange.start, "yyyy-MM-dd");
  const rangeEndYmd = format(dateRange.end, "yyyy-MM-dd");

  // Fetch sales data
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["sales-analytics", currentOrganization?.id, rangeStartYmd, rangeEndYmd],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_date, sale_number, customer_name, customer_id, gross_amount, discount_amount, flat_discount_amount, net_amount, paid_amount, payment_method, payment_status, sale_type")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .gte("sale_date", rangeStartYmd)
        .lte("sale_date", `${rangeEndYmd}T23:59:59`)
        .order("sale_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Fetch sale items for top products - use paginated fetch to bypass 1000 row limit
  const { data: saleItemsData } = useQuery({
    queryKey: ["sale-items-analytics", currentOrganization?.id, rangeStartYmd, rangeEndYmd],
    queryFn: async () => {
      if (!currentOrganization?.id || !salesData?.length) return [];
      const saleIds = salesData.map(s => s.id);
      return await fetchAllSaleItems(saleIds);
    },
    enabled: !!currentOrganization?.id && !!salesData?.length,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Fetch previous period data for comparison
  const previousPeriodRange = useMemo(() => {
    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    return {
      start: subDays(dateRange.start, daysDiff + 1),
      end: subDays(dateRange.start, 1),
    };
  }, [dateRange]);

  const prevRangeStartYmd = format(previousPeriodRange.start, "yyyy-MM-dd");
  const prevRangeEndYmd = format(previousPeriodRange.end, "yyyy-MM-dd");

  const { data: previousSalesData } = useQuery({
    queryKey: ["previous-sales-analytics", currentOrganization?.id, prevRangeStartYmd, prevRangeEndYmd],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, gross_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .gte("sale_date", prevRangeStartYmd)
        .lte("sale_date", `${prevRangeEndYmd}T23:59:59`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Fetch unique customers for the period
  const { data: customersData } = useQuery({
    queryKey: ["customers-analytics", currentOrganization?.id, rangeStartYmd, rangeEndYmd],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("customer_id, customer_name")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .gte("sale_date", rangeStartYmd)
        .lte("sale_date", `${rangeEndYmd}T23:59:59`)
        .not("customer_id", "is", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const sales = salesData || [];
    const prevSales = previousSalesData || [];
    
    const totalRevenue = sales.reduce((sum, s) => sum + (s.net_amount || 0), 0);
    const prevRevenue = prevSales.reduce((sum, s) => sum + (s.net_amount || 0), 0);
    const revenueGrowth = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;

    const totalOrders = sales.length;
    const prevOrders = prevSales.length;
    const ordersGrowth = prevOrders > 0 ? ((totalOrders - prevOrders) / prevOrders) * 100 : 0;

    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const prevAvgOrderValue = prevOrders > 0 ? prevRevenue / prevOrders : 0;
    const aovGrowth = prevAvgOrderValue > 0 ? ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100 : 0;

    const uniqueCustomers = new Set(customersData?.map(c => c.customer_id)).size;

    const totalDiscount = sales.reduce((sum, s) => sum + (s.discount_amount || 0) + (s.flat_discount_amount || 0), 0);

    return {
      totalRevenue,
      revenueGrowth,
      totalOrders,
      ordersGrowth,
      avgOrderValue,
      aovGrowth,
      uniqueCustomers,
      totalDiscount,
    };
  }, [salesData, previousSalesData, customersData]);

  // Daily sales trend data
  const dailySalesTrend = useMemo(() => {
    const sales = salesData || [];
    const dailyMap = new Map<string, { revenue: number; orders: number }>();

    sales.forEach(sale => {
      const date = format(parseISO(sale.sale_date), "MMM dd");
      const existing = dailyMap.get(date) || { revenue: 0, orders: 0 };
      dailyMap.set(date, {
        revenue: existing.revenue + (sale.net_amount || 0),
        orders: existing.orders + 1,
      });
    });

    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      orders: data.orders,
    }));
  }, [salesData]);

  // Payment method distribution
  const paymentMethodData = useMemo(() => {
    const sales = salesData || [];
    const methodMap = new Map<string, number>();

    sales.forEach(sale => {
      const method = sale.payment_method || "Unknown";
      methodMap.set(method, (methodMap.get(method) || 0) + (sale.net_amount || 0));
    });

    return Array.from(methodMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [salesData]);

  // Top products by quantity
  const topProducts = useMemo(() => {
    const items = saleItemsData || [];
    const productMap = new Map<string, { quantity: number; revenue: number }>();

    items.forEach(item => {
      const name = item.product_name || "Unknown";
      const existing = productMap.get(name) || { quantity: 0, revenue: 0 };
      productMap.set(name, {
        quantity: existing.quantity + item.quantity,
        revenue: existing.revenue + (item.line_total || 0),
      });
    });

    return Array.from(productMap.entries())
      .map(([name, data]) => ({ name: name.substring(0, 20), quantity: data.quantity, revenue: data.revenue }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);
  }, [saleItemsData]);

  // Hourly sales distribution
  const hourlySalesData = useMemo(() => {
    const sales = salesData || [];
    const hourlyMap = new Map<number, { revenue: number; orders: number }>();

    sales.forEach(sale => {
      const hour = parseISO(sale.sale_date).getHours();
      const existing = hourlyMap.get(hour) || { revenue: 0, orders: 0 };
      hourlyMap.set(hour, {
        revenue: existing.revenue + (sale.net_amount || 0),
        orders: existing.orders + 1,
      });
    });

    return Array.from({ length: 24 }, (_, hour) => ({
      hour: `${hour.toString().padStart(2, "0")}:00`,
      revenue: hourlyMap.get(hour)?.revenue || 0,
      orders: hourlyMap.get(hour)?.orders || 0,
    }));
  }, [salesData]);

  // Payment status distribution
  const paymentStatusData = useMemo(() => {
    const sales = salesData || [];
    const statusMap = new Map<string, number>();

    sales.forEach(sale => {
      const status = sale.payment_status || "unknown";
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });

    return Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));
  }, [salesData]);

  // Customer segmentation analysis
  const customerSegmentation = useMemo(() => {
    const sales = salesData || [];
    const customerMap = new Map<string, { 
      name: string; 
      revenue: number; 
      orders: number; 
      customerId: string | null;
    }>();

    sales.forEach(sale => {
      const key = sale.customer_id || sale.customer_name || "Walk-in";
      const existing = customerMap.get(key) || { 
        name: sale.customer_name || "Walk-in", 
        revenue: 0, 
        orders: 0,
        customerId: sale.customer_id,
      };
      customerMap.set(key, {
        ...existing,
        revenue: existing.revenue + (sale.net_amount || 0),
        orders: existing.orders + 1,
      });
    });

    const customers = Array.from(customerMap.values()).map(c => ({
      ...c,
      avgOrderValue: c.orders > 0 ? c.revenue / c.orders : 0,
    }));

    // Top by revenue
    const topByRevenue = [...customers]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Top by frequency
    const topByFrequency = [...customers]
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 10);

    // Top by AOV (minimum 2 orders to qualify)
    const topByAOV = [...customers]
      .filter(c => c.orders >= 2)
      .sort((a, b) => b.avgOrderValue - a.avgOrderValue)
      .slice(0, 10);

    return { topByRevenue, topByFrequency, topByAOV };
  }, [salesData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const GrowthIndicator = ({ value }: { value: number }) => {
    if (value === 0) return null;
    const isPositive = value > 0;
    return (
      <div className={cn("flex items-center text-xs font-medium", isPositive ? "text-green-500" : "text-red-500")}>
        {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(value).toFixed(1)}%
      </div>
    );
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
          <p className="font-medium text-foreground">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name.toLowerCase().includes("revenue") ? formatCurrency(entry.value) : entry.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  if (salesLoading) {
    return (
      <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden">
        <ReportPageSkeleton kpiCount={4} chartBlocks={2} tableRows={6} className="flex-1 min-h-0" />
      </div>
    );
  }

  return (
    <div className="business-insights-workspace flex flex-col bg-slate-50 px-2 sm:px-3 py-2 min-h-0 h-full overflow-hidden">
      <div className="w-full min-w-0 flex flex-col flex-1 min-h-0 gap-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-teal-700 tracking-tight leading-none flex items-center gap-2">
              <TrendingUp className="h-5 w-5 shrink-0" />
              Sales Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Comprehensive sales performance insights</p>
          </div>

          {/* Period Filter */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
              <SelectTrigger className="w-[160px] h-9 text-sm border-slate-200 bg-white">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this-week">This Week</SelectItem>
                <SelectItem value="last-week">Last Week</SelectItem>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-month">Last Month</SelectItem>
                <SelectItem value="this-year">This Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {periodType === "custom" && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(startDate, "MMM dd")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} />
                  </PopoverContent>
                </Popover>
                <span className="text-muted-foreground text-sm">to</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9">
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(endDate, "MMM dd")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={endDate} onSelect={(d) => d && setEndDate(d)} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 w-full shrink-0">
          <InsightsKpiCard
            label="Total Revenue"
            value={summaryStats.totalRevenue}
            valueFormat="inr"
            sub={<GrowthIndicator value={summaryStats.revenueGrowth} />}
          />
          <InsightsKpiCard
            label="Total Orders"
            value={summaryStats.totalOrders}
            valueFormat="int"
            sub={<GrowthIndicator value={summaryStats.ordersGrowth} />}
          />
          <InsightsKpiCard
            label="Avg Order Value"
            value={summaryStats.avgOrderValue}
            valueFormat="inr"
            sub={<GrowthIndicator value={summaryStats.aovGrowth} />}
          />
          <InsightsKpiCard
            label="Unique Customers"
            value={summaryStats.uniqueCustomers}
            valueFormat="int"
            sub="Active buyers"
          />
        </div>

        {/* Charts Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 gap-2">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0 shrink-0">
            {(
              [
                { value: "overview", label: "Overview" },
                { value: "products", label: "Products" },
                { value: "customers", label: "Customers" },
                { value: "payments", label: "Payments" },
                { value: "trends", label: "Trends" },
              ] as const
            ).map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className={cn(
                  "h-9 px-4 text-sm font-semibold rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm",
                  "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:border-slate-700",
                )}
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto mt-0 space-y-2 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <InsightsPanel title="Revenue Trend" subtitle="Daily net revenue">
                <div className="h-[300px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailySalesTrend}>
                      <defs>
                        <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke="hsl(var(--primary))"
                        fill="url(#revenueGradient)"
                        strokeWidth={2}
                        {...chartAnim}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </InsightsPanel>

              <InsightsPanel title="Orders Trend" subtitle="Daily order count">
                <div className="h-[300px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailySalesTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="orders"
                        name="Orders"
                        fill="hsl(var(--chart-2))"
                        radius={[4, 4, 0, 0]}
                        {...chartAnim}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </InsightsPanel>
            </div>
          </TabsContent>

          <TabsContent value="products" className="flex-1 min-h-0 overflow-y-auto mt-0 space-y-2 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <InsightsPanel title="Top Products by Quantity" subtitle="Top 10 by units sold">
                <div className="h-[350px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" className="text-xs" width={120} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="quantity"
                        name="Quantity"
                        fill="hsl(var(--chart-3))"
                        radius={[0, 4, 4, 0]}
                        {...chartAnim}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </InsightsPanel>

              <InsightsPanel title="Top Products by Revenue" subtitle="Top 10 by line revenue">
                <div className="h-[350px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" className="text-xs" width={120} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar
                        dataKey="revenue"
                        name="Revenue"
                        fill="hsl(var(--chart-4))"
                        radius={[0, 4, 4, 0]}
                        {...chartAnim}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </InsightsPanel>
            </div>
          </TabsContent>

          <TabsContent value="customers" className="flex-1 min-h-0 overflow-y-auto mt-0 space-y-2 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
            {/* Top Customers by Revenue */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-primary" />
                  Top by Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {customerSegmentation.topByRevenue.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No customer data</p>
                  ) : (
                    customerSegmentation.topByRevenue.map((customer, index) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium text-primary">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground truncate max-w-[120px]">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.orders} orders</p>
                          </div>
                        </div>
                        <p className="font-semibold text-sm text-foreground">{formatCurrency(customer.revenue)}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Customers by Frequency */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-chart-2" />
                  Top by Frequency
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {customerSegmentation.topByFrequency.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No customer data</p>
                  ) : (
                    customerSegmentation.topByFrequency.map((customer, index) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-chart-2/10 flex items-center justify-center text-sm font-medium text-chart-2">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground truncate max-w-[120px]">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{formatCurrency(customer.revenue)}</p>
                          </div>
                        </div>
                        <p className="font-semibold text-sm text-foreground">{customer.orders} orders</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Customers by AOV */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-chart-3" />
                  Top by Avg Order Value
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {customerSegmentation.topByAOV.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Min 2 orders required</p>
                  ) : (
                    customerSegmentation.topByAOV.map((customer, index) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-chart-3/10 flex items-center justify-center text-sm font-medium text-chart-3">
                            {index + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm text-foreground truncate max-w-[120px]">{customer.name}</p>
                            <p className="text-xs text-muted-foreground">{customer.orders} orders</p>
                          </div>
                        </div>
                        <p className="font-semibold text-sm text-foreground">{formatCurrency(customer.avgOrderValue)}</p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            </div>

            <InsightsPanel title="Customer Revenue Distribution" subtitle="Top 8 customers by revenue">
              <div className="h-[300px] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={customerSegmentation.topByRevenue.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis
                      dataKey="name"
                      className="text-xs"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => v.substring(0, 10) + (v.length > 10 ? "..." : "")}
                    />
                    <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="revenue"
                      name="Revenue"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      {...chartAnim}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </InsightsPanel>
          </TabsContent>

          <TabsContent value="payments" className="flex-1 min-h-0 overflow-y-auto mt-0 space-y-2 data-[state=inactive]:hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <InsightsPanel title="Payment Method Distribution" subtitle="Revenue by payment method">
                <div className="h-[300px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentMethodData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        {...chartAnim}
                      >
                        {paymentMethodData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </InsightsPanel>

              <InsightsPanel title="Payment Status" subtitle="Order count by status">
                <div className="h-[300px] p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={paymentStatusData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                        {...chartAnim}
                      >
                        {paymentStatusData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              entry.name === "completed" ? "#10b981" :
                              entry.name === "partial" ? "#f59e0b" :
                              entry.name === "pending" ? "#ef4444" :
                              CHART_COLORS[index % CHART_COLORS.length]
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </InsightsPanel>
            </div>
          </TabsContent>

          <TabsContent value="trends" className="flex-1 min-h-0 overflow-y-auto mt-0 space-y-2 data-[state=inactive]:hidden">
            <InsightsPanel title="Hourly Sales Distribution" subtitle="Revenue and orders by hour of day">
              <div className="h-[300px] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlySalesData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                      {...chartAnim}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="orders"
                      name="Orders"
                      stroke="hsl(var(--chart-2))"
                      strokeWidth={2}
                      dot={false}
                      {...chartAnim}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </InsightsPanel>

            <InsightsKpiCard
              label="Total Discounts Given"
              value={summaryStats.totalDiscount}
              valueFormat="inr"
              sub={
                summaryStats.totalRevenue > 0
                  ? `${((summaryStats.totalDiscount / (summaryStats.totalRevenue + summaryStats.totalDiscount)) * 100).toFixed(1)}% of gross`
                  : "0% of gross"
              }
              tone="attention"
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
