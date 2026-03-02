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
import { format, startOfDay, endOfDay } from "date-fns";
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
  
  const { getRefreshInterval, isManualRefreshOnly } = useTierBasedRefresh();
  
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
  
  // Manual refresh handler
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
    setTimeout(() => setIsRefreshing(false), 500);
  };
  
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
      return data as {
        total_sales: number;
        invoice_count: number;
        sold_qty: number;
        total_stock_qty: number;
        total_stock_value: number;
        total_receivables: number;
        pending_count: number;
      };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
    refetchInterval: getRefreshInterval('fast'),
    retry: 2,
  });

  // Also fetch month stats with a separate RPC call (different date range)
  const monthStart = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), "yyyy-MM-dd");
  const monthEnd = format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), "yyyy-MM-dd");
  
  const { data: monthStats, isLoading: monthLoading, isError: monthError, refetch: refetchMonth } = useQuery({
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
    refetchInterval: getRefreshInterval('medium'),
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
            value={dashStats?.total_sales ?? 0}
            icon={TrendingUp}
            color="text-success"
            bgColor="bg-success/10"
            onClick={() => orgNavigate("/sales-invoice-dashboard")}
            isCurrency
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
          />
          <MobileDashboardCard
            title="This Month"
            value={monthStats?.total_sales ?? 0}
            icon={BarChart3}
            color="text-primary"
            bgColor="bg-primary/10"
            onClick={() => orgNavigate("/daily-cashier-report")}
            isCurrency
            isLoading={monthLoading}
            isError={monthError}
            onRetry={() => refetchMonth()}
          />
          <MobileDashboardCard
            title="Stock Value"
            value={dashStats?.total_stock_value ?? 0}
            icon={Package}
            color="text-warning"
            bgColor="bg-warning/10"
            onClick={() => orgNavigate("/stock-report")}
            isCurrency
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
          />
          <MobileDashboardCard
            title="Receivables"
            value={dashStats?.total_receivables ?? 0}
            icon={AlertCircle}
            color="text-destructive"
            bgColor="bg-destructive/10"
            onClick={() => orgNavigate("/payments-dashboard")}
            isCurrency
            isLoading={isLoading}
            isError={isError}
            onRetry={() => refetch()}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h2>
        <MobileQuickActions />
      </div>

      {/* Today's Summary - Lazy Loaded, passes RPC data */}
      <div ref={summaryRef} className="px-4 py-3">
        {summaryVisible ? (
          <MobileDashboardSummary 
            invoiceCount={dashStats?.invoice_count ?? 0}
            itemsSold={dashStats?.sold_qty ?? 0}
            pendingCount={dashStats?.pending_count ?? 0}
            isLoading={isLoading}
          />
        ) : <SummarySkeleton />}
      </div>
    </div>
  );
};
