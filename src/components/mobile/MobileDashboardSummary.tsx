import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, RefreshCw, AlertCircle } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

export const MobileDashboardSummary = () => {
  const { currentOrganization } = useOrganization();
  const { isOnline } = useNetworkStatus();
  
  const todayStart = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayEnd = format(endOfDay(new Date()), "yyyy-MM-dd");

  // Fetch today's stats with optimized queries
  const { data: todayStats, isLoading, isError, refetch } = useQuery({
    queryKey: ["mobile-dashboard-summary", currentOrganization?.id, todayStart],
    queryFn: async () => {
      if (!currentOrganization) return { invoiceCount: 0, customersServed: 0, itemsSold: 0, pendingCount: 0 };
      
      // Get today's invoices - lightweight query
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("id, customer_id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", todayStart)
        .lte("sale_date", todayEnd);
      
      if (salesError) throw salesError;
      
      const invoiceCount = sales?.length || 0;
      
      // Count unique customers served today
      const uniqueCustomers = new Set(sales?.map(s => s.customer_id).filter(Boolean));
      const customersServed = uniqueCustomers.size;
      
      // Get items sold today - only if there are sales
      let itemsSold = 0;
      const saleIds = sales?.map(s => s.id) || [];
      if (saleIds.length > 0) {
        const { data: items, error: itemsError } = await supabase
          .from("sale_items")
          .select("quantity")
          .in("sale_id", saleIds);
        
        if (itemsError) throw itemsError;
        itemsSold = items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      }
      
      // Get pending payments count using COUNT for efficiency
      const { count: pendingCount, error: pendingError } = await supabase
        .from("sales")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .in("payment_status", ["pending", "partial"]);
      
      if (pendingError) throw pendingError;
      
      return {
        invoiceCount,
        customersServed,
        itemsSold,
        pendingCount: pendingCount || 0
      };
    },
    enabled: !!currentOrganization && isOnline,
    staleTime: 60000, // 1 minute
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
