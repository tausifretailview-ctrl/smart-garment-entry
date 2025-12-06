import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, subMonths, parseISO, startOfWeek, endOfWeek } from "date-fns";
import { CalendarIcon, TrendingUp, TrendingDown, IndianRupee, ShoppingCart, Users, Package, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

export default function SalesAnalyticsDashboard() {
  const { currentOrganization } = useOrganization();
  const [periodType, setPeriodType] = useState<PeriodType>("this-month");
  const [startDate, setStartDate] = useState<Date>(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState<Date>(new Date());

  // Calculate date range based on period type
  const dateRange = useMemo(() => {
    const today = new Date();
    switch (periodType) {
      case "today":
        return { start: today, end: today };
      case "yesterday":
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: yesterday };
      case "this-week":
        return { start: startOfWeek(today, { weekStartsOn: 1 }), end: endOfWeek(today, { weekStartsOn: 1 }) };
      case "last-week":
        const lastWeekStart = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        return { start: lastWeekStart, end: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) };
      case "this-month":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "last-month":
        const lastMonth = subMonths(today, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "this-year":
        return { start: startOfYear(today), end: today };
      case "custom":
        return { start: startDate, end: endDate };
      default:
        return { start: startOfMonth(today), end: today };
    }
  }, [periodType, startDate, endDate]);

  // Fetch sales data
  const { data: salesData, isLoading: salesLoading } = useQuery({
    queryKey: ["sales-analytics", currentOrganization?.id, dateRange],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("sale_date", format(dateRange.end, "yyyy-MM-dd'T'23:59:59"))
        .order("sale_date", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch sale items for top products
  const { data: saleItemsData } = useQuery({
    queryKey: ["sale-items-analytics", currentOrganization?.id, dateRange],
    queryFn: async () => {
      if (!currentOrganization?.id || !salesData?.length) return [];
      const saleIds = salesData.map(s => s.id);
      const { data, error } = await supabase
        .from("sale_items")
        .select("*")
        .in("sale_id", saleIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id && !!salesData?.length,
  });

  // Fetch previous period data for comparison
  const previousPeriodRange = useMemo(() => {
    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    return {
      start: subDays(dateRange.start, daysDiff + 1),
      end: subDays(dateRange.start, 1),
    };
  }, [dateRange]);

  const { data: previousSalesData } = useQuery({
    queryKey: ["previous-sales-analytics", currentOrganization?.id, previousPeriodRange],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, gross_amount")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", format(previousPeriodRange.start, "yyyy-MM-dd"))
        .lte("sale_date", format(previousPeriodRange.end, "yyyy-MM-dd'T'23:59:59"));
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch unique customers for the period
  const { data: customersData } = useQuery({
    queryKey: ["customers-analytics", currentOrganization?.id, dateRange],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from("sales")
        .select("customer_id, customer_name")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("sale_date", format(dateRange.end, "yyyy-MM-dd'T'23:59:59"))
        .not("customer_id", "is", null);
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <BackToDashboard />
          <h1 className="text-2xl font-bold text-foreground mt-2">Sales Analytics</h1>
          <p className="text-muted-foreground">Comprehensive sales performance insights</p>
        </div>

        {/* Period Filter */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
            <SelectTrigger className="w-[160px]">
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
                  <Button variant="outline" size="sm">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {format(startDate, "MMM dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={(d) => d && setStartDate(d)} />
                </PopoverContent>
              </Popover>
              <span className="text-muted-foreground">to</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(summaryStats.totalRevenue)}</p>
                <GrowthIndicator value={summaryStats.revenueGrowth} />
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                <IndianRupee className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-2/10 to-chart-2/5 border-chart-2/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold text-foreground">{summaryStats.totalOrders}</p>
                <GrowthIndicator value={summaryStats.ordersGrowth} />
              </div>
              <div className="h-12 w-12 rounded-full bg-chart-2/20 flex items-center justify-center">
                <ShoppingCart className="h-6 w-6 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-3/10 to-chart-3/5 border-chart-3/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Order Value</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(summaryStats.avgOrderValue)}</p>
                <GrowthIndicator value={summaryStats.aovGrowth} />
              </div>
              <div className="h-12 w-12 rounded-full bg-chart-3/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-chart-4/10 to-chart-4/5 border-chart-4/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Unique Customers</p>
                <p className="text-2xl font-bold text-foreground">{summaryStats.uniqueCustomers}</p>
                <p className="text-xs text-muted-foreground mt-1">Active buyers</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-chart-4/20 flex items-center justify-center">
                <Users className="h-6 w-6 text-chart-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5 lg:w-[500px]">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Revenue Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
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
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" fill="url(#revenueGradient)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Orders Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5 text-chart-2" />
                  Orders Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailySalesTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="orders" name="Orders" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top Products by Quantity */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-chart-3" />
                  Top Products by Quantity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis type="category" dataKey="name" className="text-xs" width={120} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="quantity" name="Quantity" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Top Products by Revenue */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <IndianRupee className="h-5 w-5 text-chart-4" />
                  Top Products by Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProducts} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" className="text-xs" width={120} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--chart-4))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

          {/* Customer Revenue Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-chart-4" />
                Customer Revenue Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
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
                    <Bar dataKey="revenue" name="Revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Payment Method Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Method Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
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
                      >
                        {paymentMethodData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Payment Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          {/* Hourly Sales Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hourly Sales Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlySalesData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis yAxisId="left" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="revenue" name="Revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line yAxisId="right" type="monotone" dataKey="orders" name="Orders" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Discount Summary */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Discounts Given</p>
                  <p className="text-2xl font-bold text-foreground">{formatCurrency(summaryStats.totalDiscount)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summaryStats.totalRevenue > 0 
                      ? `${((summaryStats.totalDiscount / (summaryStats.totalRevenue + summaryStats.totalDiscount)) * 100).toFixed(1)}% of gross`
                      : "0% of gross"
                    }
                  </p>
                </div>
                <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
                  <TrendingDown className="h-6 w-6 text-destructive" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
