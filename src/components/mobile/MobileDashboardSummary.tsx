import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "lucide-react";
import { format, startOfDay, endOfDay } from "date-fns";

export const MobileDashboardSummary = () => {
  const { currentOrganization } = useOrganization();
  
  const todayStart = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayEnd = format(endOfDay(new Date()), "yyyy-MM-dd");

  // Fetch today's stats
  const { data: todayStats, isLoading } = useQuery({
    queryKey: ["mobile-dashboard-summary", currentOrganization?.id, todayStart],
    queryFn: async () => {
      if (!currentOrganization) return { invoiceCount: 0, customersServed: 0, itemsSold: 0, pendingCount: 0 };
      
      // Get today's invoices
      const { data: sales } = await supabase
        .from("sales")
        .select("id, customer_id, payment_status")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", todayStart)
        .lte("sale_date", todayEnd);
      
      const invoiceCount = sales?.length || 0;
      
      // Count unique customers served today
      const uniqueCustomers = new Set(sales?.map(s => s.customer_id).filter(Boolean));
      const customersServed = uniqueCustomers.size;
      
      // Get items sold today
      const saleIds = sales?.map(s => s.id) || [];
      let itemsSold = 0;
      if (saleIds.length > 0) {
        const { data: items } = await supabase
          .from("sale_items")
          .select("quantity")
          .in("sale_id", saleIds);
        itemsSold = items?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      }
      
      // Get pending payments count
      const { count: pendingCount } = await supabase
        .from("sales")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .in("payment_status", ["pending", "partial"]);
      
      return {
        invoiceCount,
        customersServed,
        itemsSold,
        pendingCount: pendingCount || 0
      };
    },
    enabled: !!currentOrganization,
    staleTime: 60000, // 1 minute
  });

  const stats = [
    { label: "Invoices Created", value: todayStats?.invoiceCount || 0 },
    { label: "Customers Served", value: todayStats?.customersServed || 0 },
    { label: "Items Sold", value: todayStats?.itemsSold || 0 },
    { label: "Pending Payments", value: todayStats?.pendingCount || 0, highlight: true },
  ];

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
