import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { MobileDashboardCard } from "./MobileDashboardCard";
import { MobileDashboardSummary } from "./MobileDashboardSummary";
import { MobileQuickActions } from "./MobileQuickActions";
import { TrendingUp, BarChart3, Package, AlertCircle } from "lucide-react";
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns";

export const MobileDashboard = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  
  const todayStart = format(startOfDay(new Date()), "yyyy-MM-dd");
  const todayEnd = format(endOfDay(new Date()), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
  
  // Greeting based on time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Fetch today's sales
  const { data: todaysSales, isLoading: todaySalesLoading } = useQuery({
    queryKey: ["mobile-today-sales", currentOrganization?.id, todayStart],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", todayStart)
        .lte("sale_date", todayEnd);
      
      return data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: 60000, // 1 minute
  });

  // Fetch this month's sales
  const { data: monthSales, isLoading: monthSalesLoading } = useQuery({
    queryKey: ["mobile-month-sales", currentOrganization?.id, monthStart],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", monthStart)
        .lte("sale_date", monthEnd);
      
      return data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: 120000, // 2 minutes
  });

  // Fetch stock value
  const { data: stockValue, isLoading: stockValueLoading } = useQuery({
    queryKey: ["mobile-stock-value", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data } = await supabase
        .from("product_variants")
        .select("stock_qty, pur_price")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      
      return data?.reduce(
        (sum, item) => sum + (item.stock_qty || 0) * (Number(item.pur_price) || 0),
        0
      ) || 0;
    },
    enabled: !!currentOrganization,
    staleTime: 120000, // 2 minutes
  });

  // Fetch receivables
  const { data: receivables, isLoading: receivablesLoading } = useQuery({
    queryKey: ["mobile-receivables", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .in("payment_status", ["pending", "partial"]);
      
      return data?.reduce((sum, item) => {
        const balance = (Number(item.net_amount) || 0) - (Number(item.paid_amount) || 0);
        return sum + Math.max(0, balance);
      }, 0) || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: 120000, // 2 minutes
  });

  return (
    <div className="min-h-screen bg-background pb-24">
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
        <div className="grid grid-cols-2 gap-3">
          <MobileDashboardCard
            title="Today's Sales"
            value={todaysSales || 0}
            icon={TrendingUp}
            color="text-success"
            bgColor="bg-success/10"
            onClick={() => orgNavigate("/sales-invoice-dashboard")}
            isCurrency
            isLoading={todaySalesLoading}
          />
          <MobileDashboardCard
            title="This Month"
            value={monthSales || 0}
            icon={BarChart3}
            color="text-primary"
            bgColor="bg-primary/10"
            onClick={() => orgNavigate("/daily-cashier-report")}
            isCurrency
            isLoading={monthSalesLoading}
          />
          <MobileDashboardCard
            title="Stock Value"
            value={stockValue || 0}
            icon={Package}
            color="text-warning"
            bgColor="bg-warning/10"
            onClick={() => orgNavigate("/stock-report")}
            isCurrency
            isLoading={stockValueLoading}
          />
          <MobileDashboardCard
            title="Receivables"
            value={receivables || 0}
            icon={AlertCircle}
            color="text-destructive"
            bgColor="bg-destructive/10"
            onClick={() => orgNavigate("/payments-dashboard")}
            isCurrency
            isLoading={receivablesLoading}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="px-4 py-3">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h2>
        <MobileQuickActions />
      </div>

      {/* Today's Summary */}
      <div className="px-4 py-3">
        <MobileDashboardSummary />
      </div>
    </div>
  );
};
