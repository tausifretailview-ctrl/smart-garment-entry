import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface MobileDashboardSummaryProps {
  invoiceCount: number;
  itemsSold: number;
  pendingCount: number;
  isLoading: boolean;
}

export const MobileDashboardSummary = ({ 
  invoiceCount, 
  itemsSold, 
  pendingCount, 
  isLoading 
}: MobileDashboardSummaryProps) => {
  const { currentOrganization } = useOrganization();
  const { isOnline } = useNetworkStatus();
  
  const today = format(new Date(), "yyyy-MM-dd");

  // Only fetch customers served (unique customer_ids) - the rest comes from parent RPC
  const { data: customersServed, isLoading: customersLoading } = useQuery({
    queryKey: ["mobile-customers-served", currentOrganization?.id, today],
    queryFn: async () => {
      if (!currentOrganization || invoiceCount === 0) return 0;
      
      const { data: sales } = await supabase
        .from("sales")
        .select("customer_id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", today)
        .lte("sale_date", today + "T23:59:59");
      
      const uniqueCustomers = new Set(sales?.map(s => s.customer_id).filter(Boolean));
      return uniqueCustomers.size;
    },
    enabled: !!currentOrganization && isOnline && invoiceCount > 0,
    staleTime: 60000,
  });

  const stats = [
    { label: "Invoices Created", value: invoiceCount },
    { label: "Customers Served", value: customersServed || 0 },
    { label: "Items Sold", value: itemsSold },
    { label: "Pending Payments", value: pendingCount, highlight: true },
  ];

  const loading = isLoading || customersLoading;

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
            {loading ? (
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
