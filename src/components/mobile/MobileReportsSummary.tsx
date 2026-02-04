import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  BarChart3, 
  FileText, 
  Receipt,
  Package,
  ChevronRight,
  Calendar
} from "lucide-react";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { format, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns";
import { cn } from "@/lib/utils";

export const MobileReportsSummary = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate } = useOrgNavigation();
  
  const today = new Date();
  const todayStart = format(startOfDay(today), "yyyy-MM-dd'T'HH:mm:ss");
  const todayEnd = format(endOfDay(today), "yyyy-MM-dd'T'HH:mm:ss");
  const monthStart = format(startOfMonth(today), "yyyy-MM-dd'T'HH:mm:ss");
  const monthEnd = format(endOfMonth(today), "yyyy-MM-dd'T'HH:mm:ss");

  // Today's Sales
  const { data: todaysSales, isLoading: loadingToday } = useQuery({
    queryKey: ["todays-sales", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization?.id)
        .gte("sale_date", todayStart)
        .lte("sale_date", todayEnd)
        .is("deleted_at", null);
      
      if (error) throw error;
      return data?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000,
  });

  // This Month Sales
  const { data: monthSales, isLoading: loadingMonth } = useQuery({
    queryKey: ["month-sales", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization?.id)
        .gte("sale_date", monthStart)
        .lte("sale_date", monthEnd)
        .is("deleted_at", null);
      
      if (error) throw error;
      return data?.reduce((sum, s) => sum + (s.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 120000,
  });

  // This Month Purchases
  const { data: monthPurchases, isLoading: loadingPurchases } = useQuery({
    queryKey: ["month-purchases", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount")
        .eq("organization_id", currentOrganization?.id)
        .gte("bill_date", format(startOfMonth(today), "yyyy-MM-dd"))
        .lte("bill_date", format(endOfMonth(today), "yyyy-MM-dd"))
        .is("deleted_at", null);
      
      if (error) throw error;
      return data?.reduce((sum, b) => sum + (b.net_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 120000,
  });

  const formatCurrency = (amount: number) => {
    if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(1)}L`;
    }
    if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${Math.round(amount).toLocaleString("en-IN")}`;
  };

  const grossProfit = (monthSales || 0) - (monthPurchases || 0);
  const isLoading = loadingToday || loadingMonth || loadingPurchases;

  const reportLinks = [
    { icon: BarChart3, label: "Sales Report", path: "/sales-invoice-dashboard", color: "text-green-500" },
    { icon: FileText, label: "Purchase Report", path: "/purchase-bills", color: "text-amber-500" },
    { icon: Receipt, label: "GST Report", path: "/gst-reports", color: "text-indigo-500" },
    { icon: Package, label: "Item-wise Sales", path: "/item-wise-sales", color: "text-violet-500" },
    { icon: Calendar, label: "Daily Cashier", path: "/daily-cashier-report", color: "text-cyan-500" },
    { icon: TrendingUp, label: "Profit Analysis", path: "/net-profit-analysis", color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-4 pb-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Today's Sales */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-green-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Today's Sales</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(todaysSales || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* This Month Sales */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-blue-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">This Month</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-semibold text-blue-600">
                {formatCurrency(monthSales || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* This Month Purchases */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Package className="h-4 w-4 text-amber-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Purchases</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className="text-lg font-semibold text-amber-600">
                {formatCurrency(monthPurchases || 0)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Gross Profit */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Gross Profit</p>
            {isLoading ? (
              <Skeleton className="h-6 w-20 mt-1" />
            ) : (
              <p className={cn(
                "text-lg font-semibold",
                grossProfit >= 0 ? "text-emerald-600" : "text-red-600"
              )}>
                {formatCurrency(grossProfit)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Report Links */}
      <Card>
        <CardContent className="p-0">
          {reportLinks.map((link, index) => {
            const Icon = link.icon;
            return (
              <div key={link.path}>
                <Button
                  variant="ghost"
                  className="w-full justify-between h-14 px-4 rounded-none"
                  onClick={() => orgNavigate(link.path)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-muted/50 flex items-center justify-center">
                      <Icon className={cn("h-5 w-5", link.color)} />
                    </div>
                    <span className="text-sm font-medium">{link.label}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
                {index < reportLinks.length - 1 && (
                  <div className="h-px bg-border ml-16" />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};
