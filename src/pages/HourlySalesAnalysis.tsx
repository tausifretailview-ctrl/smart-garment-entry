import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BackToDashboard } from "@/components/BackToDashboard";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area
} from "recharts";
import { 
  CalendarIcon, 
  Clock, 
  TrendingUp, 
  Zap, 
  BarChart3,
  Sun,
  Moon,
  Sunrise,
  Sunset
} from "lucide-react";
import { format, startOfDay, endOfDay, subDays, parseISO, getHours } from "date-fns";
import { cn } from "@/lib/utils";

interface HourlySale {
  hour: number;
  sales: number;
  count: number;
  label: string;
}

const getHourLabel = (hour: number): string => {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

const getTimeOfDayIcon = (hour: number) => {
  if (hour >= 5 && hour < 12) return <Sunrise className="h-4 w-4 text-amber-500" />;
  if (hour >= 12 && hour < 17) return <Sun className="h-4 w-4 text-yellow-500" />;
  if (hour >= 17 && hour < 21) return <Sunset className="h-4 w-4 text-orange-500" />;
  return <Moon className="h-4 w-4 text-indigo-400" />;
};

const getTimeOfDayLabel = (hour: number): string => {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
};

export default function HourlySalesAnalysis() {
  const { currentOrganization } = useOrganization();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date()
  });

  const { data: hourlyData, isLoading } = useQuery({
    queryKey: ["hourly-sales", currentOrganization?.id, dateRange.from, dateRange.to],
    queryFn: async () => {
      if (!currentOrganization) return [];

      const fromDate = startOfDay(dateRange.from).toISOString();
      const toDate = endOfDay(dateRange.to).toISOString();

      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, sale_date")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", fromDate)
        .lte("sale_date", toDate)
        .is("deleted_at", null);

      if (error) throw error;

      // Group by hour
      const hourlyMap = new Map<number, { sales: number; count: number }>();
      
      // Initialize all hours
      for (let h = 0; h < 24; h++) {
        hourlyMap.set(h, { sales: 0, count: 0 });
      }

      data?.forEach(sale => {
        const saleDate = parseISO(sale.sale_date);
        const hour = getHours(saleDate);
        const current = hourlyMap.get(hour) || { sales: 0, count: 0 };
        hourlyMap.set(hour, {
          sales: current.sales + (sale.net_amount || 0),
          count: current.count + 1
        });
      });

      const result: HourlySale[] = [];
      hourlyMap.forEach((value, hour) => {
        result.push({
          hour,
          sales: value.sales,
          count: value.count,
          label: getHourLabel(hour)
        });
      });

      return result.sort((a, b) => a.hour - b.hour);
    },
    enabled: !!currentOrganization
  });

  // Calculate insights
  const totalSales = hourlyData?.reduce((sum, h) => sum + h.sales, 0) || 0;
  const totalTransactions = hourlyData?.reduce((sum, h) => sum + h.count, 0) || 0;
  const avgPerHour = totalSales / 24;
  
  const peakHour = hourlyData?.reduce((max, h) => h.sales > max.sales ? h : max, { hour: 0, sales: 0, count: 0, label: "" });
  const busiestHour = hourlyData?.reduce((max, h) => h.count > max.count ? h : max, { hour: 0, sales: 0, count: 0, label: "" });
  
  // Time of day breakdown
  const timeOfDayData = hourlyData ? [
    { 
      period: "Morning", 
      range: "5 AM - 12 PM",
      sales: hourlyData.filter(h => h.hour >= 5 && h.hour < 12).reduce((s, h) => s + h.sales, 0),
      count: hourlyData.filter(h => h.hour >= 5 && h.hour < 12).reduce((s, h) => s + h.count, 0),
      icon: Sunrise,
      color: "text-amber-500",
      bgColor: "bg-amber-500/10"
    },
    { 
      period: "Afternoon", 
      range: "12 PM - 5 PM",
      sales: hourlyData.filter(h => h.hour >= 12 && h.hour < 17).reduce((s, h) => s + h.sales, 0),
      count: hourlyData.filter(h => h.hour >= 12 && h.hour < 17).reduce((s, h) => s + h.count, 0),
      icon: Sun,
      color: "text-yellow-500",
      bgColor: "bg-yellow-500/10"
    },
    { 
      period: "Evening", 
      range: "5 PM - 9 PM",
      sales: hourlyData.filter(h => h.hour >= 17 && h.hour < 21).reduce((s, h) => s + h.sales, 0),
      count: hourlyData.filter(h => h.hour >= 17 && h.hour < 21).reduce((s, h) => s + h.count, 0),
      icon: Sunset,
      color: "text-orange-500",
      bgColor: "bg-orange-500/10"
    },
    { 
      period: "Night", 
      range: "9 PM - 5 AM",
      sales: hourlyData.filter(h => h.hour >= 21 || h.hour < 5).reduce((s, h) => s + h.sales, 0),
      count: hourlyData.filter(h => h.hour >= 21 || h.hour < 5).reduce((s, h) => s + h.count, 0),
      icon: Moon,
      color: "text-indigo-400",
      bgColor: "bg-indigo-500/10"
    }
  ] : [];

  const peakTimeOfDay = timeOfDayData.reduce((max, t) => t.sales > max.sales ? t : max, timeOfDayData[0]);

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as HourlySale;
      return (
        <div className="bg-popover/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            {getTimeOfDayIcon(data.hour)}
            <span className="font-semibold">{data.label}</span>
            <Badge variant="outline" className="text-xs">
              {getTimeOfDayLabel(data.hour)}
            </Badge>
          </div>
          <p className="text-sm">
            Sales: <span className="font-bold text-primary">{formatCurrency(data.sales)}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {data.count} transaction{data.count !== 1 ? 's' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  // Get bar colors - highlight peak hours
  const getBarColor = (hour: number, sales: number) => {
    if (peakHour && hour === peakHour.hour && sales > 0) return "hsl(var(--primary))";
    if (sales === 0) return "hsl(var(--muted))";
    if (sales > avgPerHour * 1.5) return "hsl(142, 76%, 36%)"; // Green for above average
    if (sales > avgPerHour) return "hsl(var(--primary) / 0.8)";
    return "hsl(var(--primary) / 0.4)";
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BackToDashboard />
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                Hourly Sales Analysis
              </h1>
              <p className="text-muted-foreground text-sm">
                Peak hours and sales trends by time of day
              </p>
            </div>
          </div>

          {/* Date Range Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to });
                  }
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Total Sales</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className="text-lg font-semibold">{formatCurrency(totalSales)}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-green-500" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Peak Hour</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className="text-lg font-semibold">{peakHour?.label || "-"}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Transactions</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className="text-lg font-semibold">{totalTransactions}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", peakTimeOfDay?.bgColor)}>
                  {peakTimeOfDay?.icon && <peakTimeOfDay.icon className={cn("h-4 w-4", peakTimeOfDay.color)} />}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Best Period</p>
              {isLoading ? (
                <Skeleton className="h-6 w-20 mt-1" />
              ) : (
                <p className="text-lg font-semibold">{peakTimeOfDay?.period || "-"}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Hourly Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Sales by Hour
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis 
                    dataKey="label" 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={1}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => formatCurrency(value)}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="sales" radius={[4, 4, 0, 0]}>
                    {hourlyData?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getBarColor(entry.hour, entry.sales)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Time of Day Breakdown */}
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Time of Day Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                Array(4).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))
              ) : (
                timeOfDayData.map((period) => {
                  const Icon = period.icon;
                  const percentage = totalSales > 0 ? (period.sales / totalSales) * 100 : 0;
                  const isPeak = period.period === peakTimeOfDay?.period;
                  
                  return (
                    <div 
                      key={period.period}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        isPeak && "border-primary bg-primary/5"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", period.bgColor)}>
                          <Icon className={cn("h-5 w-5", period.color)} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{period.period}</span>
                            {isPeak && (
                              <Badge variant="default" className="text-xs">Peak</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{period.range}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(period.sales)}</p>
                        <p className="text-xs text-muted-foreground">
                          {period.count} bills • {percentage.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Trend Chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Hourly Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis 
                      dataKey="label" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      interval={3}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => formatCurrency(value)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      dataKey="sales" 
                      stroke="hsl(var(--primary))" 
                      fill="url(#salesGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Peak Hours Summary */}
        {!isLoading && peakHour && peakHour.sales > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">Peak Performance Insight</h3>
                  <p className="text-muted-foreground mt-1">
                    Your highest sales hour is <strong>{peakHour.label}</strong> with{" "}
                    <strong>{formatCurrency(peakHour.sales)}</strong> from{" "}
                    <strong>{peakHour.count} transactions</strong>. 
                    {busiestHour && busiestHour.hour !== peakHour.hour && (
                      <> Most transactions occur at <strong>{busiestHour.label}</strong> ({busiestHour.count} bills).</>
                    )}
                    {" "}Consider staffing and inventory accordingly during {getTimeOfDayLabel(peakHour.hour).toLowerCase()} hours.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
