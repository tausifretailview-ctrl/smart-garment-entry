import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, RefreshCw, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";

export const MobileDashboardSummary = () => {
  const { currentOrganization } = useOrganization();
  const { isOnline } = useNetworkStatus();
  const { getRefreshInterval } = useTierBasedRefresh();
  
  const today = format(new Date(), "yyyy-MM-dd");

  // Fetch today's stats using aggregation views
  const { data: todayStats, isLoading, isError, refetch } = useQuery({
    queryKey: ["mobile-dashboard-summary", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization) return { invoiceCount: 0, customersServed: 0, itemsSold: 0, pendingCount: 0 };
      
      // Get today's sales summary from view (1 query instead of fetching all rows)
      const { data: salesSummary, error: salesError } = await supabase
        .from("v_dashboard_sales_summary")
        .select("invoice_count, total_sales")
        .eq("organization_id", currentOrganization.id)
        .eq("sale_day", today)
        .single();
      
      // PGRST116 = no rows (no sales today), not an error
      if (salesError && salesError.code !== 'PGRST116') throw salesError;
      
      const invoiceCount = Number(salesSummary?.invoice_count) || 0;
      
      // For customers served and items sold, we still need detail queries
      // but only if there are sales today
      let customersServed = 0;
      let itemsSold = 0;
      
      if (invoiceCount > 0) {
        const { data: sales } = await supabase
          .from("sales")
          .select("id, customer_id")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .gte("sale_date", today)
          .lte("sale_date", today + "T23:59:59");
        
        const uniqueCustomers = new Set(sales?.map(s => s.customer_id).filter(Boolean));
        customersServed = uniqueCustomers.size;
        
        const saleIds = sales?.map(s => s.id) || [];
        if (saleIds.length > 0) {
          const { data: items } = await supabase
            .from("sale_items")
            .select("quantity")
            .in("sale_id", saleIds);
          itemsSold = items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
        }
      }
      
      // Get pending payments from receivables view (1 query)
      const { data: receivables } = await supabase
        .from("v_dashboard_receivables")
        .select("pending_count")
        .eq("organization_id", currentOrganization.id)
        .single();
      
      return {
        invoiceCount,
        customersServed,
        itemsSold,
        pendingCount: Number(receivables?.pending_count) || 0
      };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000,
    refetchInterval: getRefreshInterval('fast'),
    retry: 2,
  });

  const stats = [
    { label: "Invoices Created", value: todayStats?.invoiceCount || 0 },
    { label: "Customers Served", value: todayStats?.customersServed || 0 },
    { label: "Items Sold", value: todayStats?.itemsSold || 0 },
    { label: "Pending Payments", value: todayStats?.pendingCount || 0, highlight: true },
  ];

  // Error state
  if (isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            Failed to load summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            className="w-full h-10 touch-manipulation"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Today's Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0">
        {stats.map((stat, index) => (
          <div 
            key={stat.label}
            className={`flex justify-between items-center py-2.5 ${index < stats.length - 1 ? 'border-b border-border' : ''}`}
          >
            <span className="text-sm text-muted-foreground">{stat.label}</span>
            {isLoading ? (
              <Skeleton className="h-5 w-12" />
            ) : (
              <span className={`text-sm font-semibold ${stat.highlight ? 'text-warning' : ''}`}>
                {stat.value.toLocaleString("en-IN")}
              </span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
