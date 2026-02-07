import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";
import { MobileDashboardCard } from "./MobileDashboardCard";
import { MobileDashboardSummary } from "./MobileDashboardSummary";
import { MobileQuickActions } from "./MobileQuickActions";
import { TrendingUp, BarChart3, Package, AlertCircle, WifiOff, RefreshCw, Info } from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";
import { useRef, useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";

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
  const { isOnline, isSlowConnection } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Tier-based polling - reduces cloud usage based on subscription tier
  const { getRefreshInterval, isManualRefreshOnly } = useTierBasedRefresh();
  
  // Lazy loading for summary section
  const [summaryVisible, setSummaryVisible] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  
  // Use ISO timestamps for proper UTC comparison
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();
  const monthStart = startOfMonth(new Date()).toISOString();
  const monthEnd = endOfMonth(new Date()).toISOString();
  
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
  
  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["mobile-today-sales"] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-month-sales"] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-stock-value"] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-receivables"] });
    await queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-summary"] });
    setTimeout(() => setIsRefreshing(false), 500);
  };
  
  // Greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Optimized: Today's sales using SUM aggregate
  const { 
    data: todaysSales, 
    isLoading: todaySalesLoading,
    isError: todaySalesError,
    refetch: refetchTodaySales
  } = useQuery({
    queryKey: ["mobile-today-sales", currentOrganization?.id, format(new Date(), "yyyy-MM-dd")],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", todayStart)
        .lte("sale_date", todayEnd);
      
      if (error) throw error;
      return data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000, // 1 minute
    refetchInterval: getRefreshInterval('fast'), // Tier-based polling
    retry: 2,
  });

  // Optimized: Month's sales
  const { 
    data: monthSales, 
    isLoading: monthSalesLoading,
    isError: monthSalesError,
    refetch: refetchMonthSales
  } = useQuery({
    queryKey: ["mobile-month-sales", currentOrganization?.id, format(new Date(), "yyyy-MM")],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", monthStart)
        .lte("sale_date", monthEnd);
      
      if (error) throw error;
      return data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 120000, // 2 minutes
    refetchInterval: getRefreshInterval('medium'), // Tier-based polling
    retry: 2,
  });

  // Optimized: Stock value - limited query for performance
  const { 
    data: stockValue, 
    isLoading: stockValueLoading,
    isError: stockValueError,
    refetch: refetchStockValue
  } = useQuery({
    queryKey: ["mobile-stock-value", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      // Limit to top items for performance on mobile
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, pur_price")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gt("stock_qty", 0)
        .limit(1000); // Limit for mobile performance
      
      if (error) throw error;
      return data?.reduce(
        (sum, item) => sum + (item.stock_qty || 0) * (Number(item.pur_price) || 0),
        0
      ) || 0;
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 300000, // 5 minutes - stock doesn't change often
    retry: 2,
  });

  // Optimized: Receivables using COUNT where possible
  const { 
    data: receivables, 
    isLoading: receivablesLoading,
    isError: receivablesError,
    refetch: refetchReceivables
  } = useQuery({
    queryKey: ["mobile-receivables", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .in("payment_status", ["pending", "partial"]);
      
      if (error) throw error;
      return data?.reduce((sum, item) => {
        const balance = (Number(item.net_amount) || 0) - (Number(item.paid_amount) || 0);
        return sum + Math.max(0, balance);
      }, 0) || 0;
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 120000, // 2 minutes
    refetchInterval: getRefreshInterval('medium'), // Tier-based polling
    retry: 2,
  });

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-warning/20 border-b border-warning/30 px-4 py-2 flex items-center gap-2">
          <WifiOff className="h-4 w-4 text-warning" />
          <span className="text-xs text-warning font-medium">You're offline - showing cached data</span>
        </div>
      )}
      
      {/* Manual Refresh Banner for Free Tier */}
      {isManualRefreshOnly && isOnline && (
        <div className="bg-muted/50 border-b border-border px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Manual refresh mode</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="h-7 px-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      )}
      
      {/* Compact Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{getGreeting()}!</h1>
            <p className="text-xs text-muted-foreground">{currentOrganization?.name}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{format(new Date(), "MMM yyyy")}</p>
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE")}</p>
          </div>
        </div>
      </div>

      {/* Key Metrics Grid - 2x2 */}
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <MobileDashboardCard
            title="Today's Sales"
            value={todaysSales ?? 0}
            icon={TrendingUp}
            color="text-success"
            bgColor="bg-success/10"
            onClick={() => orgNavigate("/sales-invoice-dashboard")}
            isCurrency
            isLoading={todaySalesLoading}
            isError={todaySalesError}
            onRetry={() => refetchTodaySales()}
          />
          <MobileDashboardCard
            title="This Month"
            value={monthSales ?? 0}
            icon={BarChart3}
            color="text-primary"
            bgColor="bg-primary/10"
            onClick={() => orgNavigate("/daily-cashier-report")}
            isCurrency
            isLoading={monthSalesLoading}
            isError={monthSalesError}
            onRetry={() => refetchMonthSales()}
          />
          <MobileDashboardCard
            title="Stock Value"
            value={stockValue ?? 0}
            icon={Package}
            color="text-warning"
            bgColor="bg-warning/10"
            onClick={() => orgNavigate("/stock-report")}
            isCurrency
            isLoading={stockValueLoading}
            isError={stockValueError}
            onRetry={() => refetchStockValue()}
          />
          <MobileDashboardCard
            title="Receivables"
            value={receivables ?? 0}
            icon={AlertCircle}
            color="text-destructive"
            bgColor="bg-destructive/10"
            onClick={() => orgNavigate("/payments-dashboard")}
            isCurrency
            isLoading={receivablesLoading}
            isError={receivablesError}
            onRetry={() => refetchReceivables()}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h2>
        <MobileQuickActions />
      </div>

      {/* Today's Summary - Lazy Loaded */}
      <div ref={summaryRef} className="px-4 py-3">
        {summaryVisible ? <MobileDashboardSummary /> : <SummarySkeleton />}
      </div>
    </div>
  );
};
