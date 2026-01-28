import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllSaleItems } from "@/utils/fetchAllRows";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
import { useUserPermissions } from "@/hooks/useUserPermissions";
import { useAnimatedCounter } from "@/hooks/useAnimatedCounter";
import {
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  Users,
  Store,
  DollarSign,
  Calendar,
  RotateCcw,
  AlertCircle,
  Smartphone,
  MapPin,
  ClipboardList,
  IndianRupee,
  Loader2,
  RefreshCw,
  TrendingDown,
  Minus,
  Megaphone,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import { StatsChartsSection } from "@/components/dashboard/StatsChartsSection";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, startOfMonth, startOfQuarter, startOfYear, endOfMonth, endOfQuarter, endOfYear } from "date-fns";
import { cn } from "@/lib/utils";

// Currency formatter helper
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
};

// Animated Metric Card Component
const AnimatedMetricCard = ({
  title,
  value,
  icon: Icon,
  bgColor,
  onClick,
  tooltip,
  isCurrency = false,
}: {
  title: string;
  value: number;
  icon: any;
  bgColor: string;
  onClick?: () => void;
  tooltip?: string;
  isCurrency?: boolean;
}) => {
  const { displayValue } = useAnimatedCounter(value, {
    duration: 2000,
    formatter: isCurrency ? formatCurrency : (v) => v.toLocaleString("en-IN"),
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group relative" onClick={onClick}>
          <Card 
            className={cn(
              `${bgColor} relative overflow-hidden border-0 shadow-sm transition-all duration-300 cursor-pointer`,
              "group-hover:shadow-md group-hover:scale-[1.02]"
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
              <CardTitle className="text-sm font-bold text-foreground">
                {title}
              </CardTitle>
              <div className="p-2 rounded-lg bg-white/20">
                <Icon className="h-4 w-4 text-white" />
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-2xl font-bold text-foreground">
                {displayValue}
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipTrigger>
      {tooltip && (
        <TooltipContent side="bottom" className="max-w-[200px]">
          <p className="text-xs">{tooltip}</p>
        </TooltipContent>
      )}
    </Tooltip>
  );
};

type DateRangeType = "monthly" | "quarterly" | "yearly" | "all";

const getDateRange = (type: DateRangeType) => {
  const now = new Date();
  switch (type) {
    case "monthly":
      return {
        start: format(startOfMonth(now), "yyyy-MM-dd"),
        end: format(endOfMonth(now), "yyyy-MM-dd"),
        label: format(now, "MMMM yyyy"),
      };
    case "quarterly":
      return {
        start: format(startOfQuarter(now), "yyyy-MM-dd"),
        end: format(endOfQuarter(now), "yyyy-MM-dd"),
        label: `Q${Math.ceil((now.getMonth() + 1) / 3)} ${format(now, "yyyy")}`,
      };
    case "yearly":
      return {
        start: format(startOfYear(now), "yyyy-MM-dd"),
        end: format(endOfYear(now), "yyyy-MM-dd"),
        label: format(now, "yyyy"),
      };
    case "all":
      return {
        start: "2000-01-01",
        end: format(endOfYear(now), "yyyy-MM-dd"),
        label: "All Time",
      };
  }
};

// Refresh intervals in milliseconds
const REFRESH_INTERVALS = {
  FAST: 15000,    // 15 seconds - sales, purchase
  MEDIUM: 30000,  // 30 seconds - stock, profit, receivables
  SLOW: 60000,    // 60 seconds - counts
};

const DashboardContent = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { hasAccess: hasFieldSalesAccess, employeeName } = useFieldSalesAccess();
  const { isAdmin, hasSpecialPermission } = useUserPermissions();
  const [dateRange, setDateRange] = useState<DateRangeType>("monthly");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const queryClient = useQueryClient();
  
  const canViewGrossProfit = isAdmin || hasSpecialPermission("view_gross_profit");
  
  const { start: startDate, end: endDate, label: dateLabel } = getDateRange(dateRange);

  // Manual refresh all
  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["total-sales"] });
    await queryClient.invalidateQueries({ queryKey: ["purchase-total"] });
    await queryClient.invalidateQueries({ queryKey: ["total-stock"] });
    await queryClient.invalidateQueries({ queryKey: ["stock-value"] });
    await queryClient.invalidateQueries({ queryKey: ["receivables"] });
    await queryClient.invalidateQueries({ queryKey: ["profit-data-cogs"] });
    await queryClient.invalidateQueries({ queryKey: ["customers-count"] });
    await queryClient.invalidateQueries({ queryKey: ["suppliers-count"] });
    await queryClient.invalidateQueries({ queryKey: ["products-count"] });
    await queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
    await queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
    await queryClient.invalidateQueries({ queryKey: ["cash-collection"] });
    setLastUpdated(new Date());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Update lastUpdated on successful fetches
  const onSuccessUpdate = () => setLastUpdated(new Date());

  // Fetch total sales for selected period
  const { data: salesData, isFetching: salesFetching } = useQuery({
    queryKey: ["total-sales", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0, soldQty: 0 };
      
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      if (error) throw error;
      
      const total = data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      const count = data?.length || 0;
      
      // Fetch sold quantity - use paginated fetch to bypass 1000 row limit
      const saleIds = data?.map(s => s.id) || [];
      let soldQty = 0;
      if (saleIds.length > 0) {
        const itemsData = await fetchAllSaleItems(saleIds);
        soldQty = itemsData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      }
      
      return { total, count, soldQty };
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.FAST,
  });

  // Fetch total customers
  const { data: customersCount } = useQuery({
    queryKey: ["customers-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { count, error } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.SLOW,
  });
  
  // Fetch total stock quantity - also filter out variants whose parent products are soft-deleted
  const { data: stockData } = useQuery({
    queryKey: ["total-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      // Use pagination to bypass 1000 row limit
      const allVariants: { stock_qty: number }[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      
      while (hasMore) {
        const { data, error } = await supabase
          .from("product_variants")
          .select("stock_qty, products!inner(deleted_at)")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .is("products.deleted_at", null)
          .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        if (data && data.length > 0) {
          allVariants.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else {
          hasMore = false;
        }
      }
      
      return allVariants.reduce((sum, item) => sum + (item.stock_qty || 0), 0);
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.MEDIUM,
  });

  // Fetch total products
  const { data: productsCount } = useQuery({
    queryKey: ["products-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { count, error } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.SLOW,
  });

  // Fetch total purchase for selected period
  const { data: purchaseData, isFetching: purchaseFetching } = useQuery({
    queryKey: ["purchase-total", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0, purchaseQty: 0 };
      
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount, id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", startDate)
        .lte("bill_date", endDate);
      if (error) throw error;
      
      const total = data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      const count = data?.length || 0;
      
      // Fetch purchase quantity
      const billIds = data?.map(b => b.id) || [];
      let purchaseQty = 0;
      if (billIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("purchase_items")
          .select("qty")
          .in("bill_id", billIds);
        purchaseQty = itemsData?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;
      }
      
      return { total, count, purchaseQty };
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.FAST,
  });
  
  const isLoading = salesFetching || purchaseFetching;

  // Fetch sale returns for selected period
  const { data: saleReturnData } = useQuery({
    queryKey: ["sale-returns", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0, returnQty: 0 };
      
      const { data, error } = await supabase
        .from("sale_returns")
        .select("net_amount, id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("return_date", startDate)
        .lte("return_date", endDate);
      if (error) throw error;
      
      const total = data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      const count = data?.length || 0;
      
      // Fetch return quantity
      const returnIds = data?.map(r => r.id) || [];
      let returnQty = 0;
      if (returnIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("sale_return_items")
          .select("quantity")
          .in("return_id", returnIds);
        returnQty = itemsData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      }
      
      return { total, count, returnQty };
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.FAST,
  });

  // Fetch purchase returns for selected period
  const { data: purchaseReturnData } = useQuery({
    queryKey: ["purchase-returns", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0, returnQty: 0 };
      
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("net_amount, id")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("return_date", startDate)
        .lte("return_date", endDate);
      if (error) throw error;
      
      const total = data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      const count = data?.length || 0;
      
      // Fetch return quantity
      const returnIds = data?.map(r => r.id) || [];
      let returnQty = 0;
      if (returnIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("purchase_return_items")
          .select("qty")
          .in("return_id", returnIds);
        returnQty = itemsData?.reduce((sum, item) => sum + (item.qty || 0), 0) || 0;
      }
      
      return { total, count, returnQty };
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.FAST,
  });

  // Fetch total suppliers
  const { data: suppliersCount } = useQuery({
    queryKey: ["suppliers-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { count, error } = await supabase
        .from("suppliers")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.SLOW,
  });

  // Fetch stock value (using purchase price for accurate inventory valuation)
  const { data: stockValue } = useQuery({
    queryKey: ["stock-value", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, pur_price")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      if (error) throw error;
      return (
        data?.reduce(
          (sum, item) =>
            sum + (item.stock_qty || 0) * (Number(item.pur_price) || 0),
          0
        ) || 0
      );
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.MEDIUM,
  });

  // Calculate Gross Profit using actual COGS (Cost of Goods Sold)
  const { data: profitData } = useQuery({
    queryKey: ["profit-data-cogs", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      // Get all sales in the period
      const { data: salesList } = await supabase
        .from("sales")
        .select("id, net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      
      if (!salesList || salesList.length === 0) return 0;
      
      const totalSalesRevenue = salesList.reduce((sum, sale) => sum + (Number(sale.net_amount) || 0), 0);
      const saleIds = salesList.map(s => s.id);
      
      // Get all sale items - use paginated fetch to bypass 1000 row limit
      const saleItemsList = await fetchAllSaleItems(saleIds);
      
      if (!saleItemsList || saleItemsList.length === 0) return totalSalesRevenue;
      
      // Get unique variant IDs
      const variantIds = [...new Set(saleItemsList.map(item => item.variant_id))];
      
      // Fetch purchase prices for all variants - use batched fetch to bypass 1000 limit
      const { fetchVariantsByIds } = await import("@/utils/fetchAllRows");
      const variants = await fetchVariantsByIds(variantIds, "id, pur_price");
      
      // Create a map of variant_id to pur_price
      const variantPriceMap = new Map<string, number>();
      variants?.forEach((v: any) => {
        variantPriceMap.set(v.id, Number(v.pur_price) || 0);
      });
      
      // Calculate total COGS (Cost of Goods Sold)
      const totalCOGS = saleItemsList.reduce((sum, item) => {
        const purPrice = variantPriceMap.get(item.variant_id) || 0;
        return sum + (purPrice * (item.quantity || 0));
      }, 0);
      
      // Gross Profit = Sales Revenue - COGS
      return totalSalesRevenue - totalCOGS;
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.MEDIUM,
  });

  // Fetch cash collection
  const { data: cashCollection } = useQuery({
    queryKey: ["cash-collection", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data } = await supabase
        .from("sales")
        .select("paid_amount, cash_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      
      return data?.reduce((sum, item) => sum + (item.cash_amount || item.paid_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.MEDIUM,
  });

  // Fetch total receivables (outstanding balance from all pending/partial payments)
  const { data: receivablesData } = useQuery({
    queryKey: ["receivables", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0 };
      
      const { data } = await supabase
        .from("sales")
        .select("net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .in("payment_status", ["pending", "partial"]);
      
      const total = data?.reduce((sum, item) => {
        const balance = (Number(item.net_amount) || 0) - (Number(item.paid_amount) || 0);
        return sum + Math.max(0, balance);
      }, 0) || 0;
      const count = data?.length || 0;
      
      return { total, count };
    },
    enabled: !!currentOrganization,
    refetchInterval: REFRESH_INTERVALS.MEDIUM,
  });

  // New Updates Panel Component
  const NewUpdatesPanel = () => {
    const updates = [
      {
        version: "v1.2.5",
        date: "28/01/2026",
        changes: [
          "Stock validation improvements during invoice edit",
          "Fixed aggregation for same variant multiple entries"
        ]
      },
      {
        version: "v1.2.4",
        date: "27/01/2026",
        changes: [
          "Draft management moved to dashboard banners",
          "Improved draft resume functionality"
        ]
      },
      {
        version: "v1.2.3",
        date: "25/01/2026",
        changes: [
          "Dashboard resolution enhanced to match ERP style",
          "Larger metric cards with better readability"
        ]
      },
      {
        version: "v1.2.2",
        date: "22/01/2026",
        changes: [
          "Bold black font for draft notifications",
          "Enhanced visual hierarchy"
        ]
      },
      {
        version: "v1.2.1",
        date: "20/01/2026",
        changes: [
          "Fixed bugs for better user experience",
          "Performance optimizations"
        ]
      },
      {
        version: "v1.2.0",
        date: "18/01/2026",
        changes: [
          "New dark theme with VASY ERP styling",
          "Vibrant gradient card backgrounds"
        ]
      }
    ];

    return (
      <Card className="border-0 shadow-md sticky top-2">
        <CardHeader className="bg-gradient-to-r from-pink-500 to-rose-500 text-white p-3 rounded-t-lg">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            New Updates
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[400px]" showScrollbar>
            <div className="p-3 space-y-4">
              {updates.map((update, index) => (
                <div key={index} className="border-b border-border pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold text-foreground">{update.version}</span>
                    <span className="text-xs text-muted-foreground">{update.date}</span>
                  </div>
                  <ul className="space-y-1">
                    {update.changes.map((change, changeIndex) => (
                      <li key={changeIndex} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 mt-1.5 flex-shrink-0" />
                        {change}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-xs">
            Smart Inventory Management System
          </p>
        </div>
        
        {/* Date Range Selector & Theme Toggle */}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          
          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isRefreshing}
            className="h-7 text-xs"
          >
            <RefreshCw className={cn("h-3.5 w-3.5 mr-1", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
          
          <div className="flex items-center gap-2 bg-card border rounded-md px-2 py-1 shadow-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={dateRange} onValueChange={(v: DateRangeType) => setDateRange(v)}>
              <SelectTrigger className="w-[100px] h-7 border-0 shadow-none text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
      {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <span className="text-xs font-medium text-primary">{dateLabel}</span>
            )}
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate(`/net-profit-analysis?from=${startDate}&to=${endDate}`)}
            className="h-7 text-xs"
          >
            <TrendingUp className="h-3.5 w-3.5 mr-1" />
            Net Profit
          </Button>
        </div>
      </div>
      
      {/* Last Updated Indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        <span>Live • Last updated: {format(lastUpdated, "HH:mm:ss")}</span>
      </div>

      {/* Main Content Grid with New Updates Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">

        {/* Left side - Metric cards (3 columns on xl) */}
        <div className="xl:col-span-3 space-y-4">
          {/* Sales Overview */}
          <div>
            <h2 className="text-base font-bold mb-3 text-foreground flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-primary to-transparent rounded-full" />
              Sales Overview
            </h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <AnimatedMetricCard
                title="Total Sales"
                value={salesData?.total || 0}
                icon={DollarSign}
                bgColor="bg-gradient-to-br from-blue-300 to-blue-400"
                onClick={() => navigate("/sales-invoice-dashboard")}
                tooltip="Total revenue from all sales invoices. Click to view Sales Dashboard."
                isCurrency
              />
              <AnimatedMetricCard
                title="Invoices"
                value={salesData?.count || 0}
                icon={FileText}
                bgColor="bg-gradient-to-br from-orange-300 to-orange-400"
                onClick={() => navigate("/sales-invoice-dashboard")}
                tooltip="Number of sales invoices generated. Click to view all invoices."
              />
              <AnimatedMetricCard
                title="Sold Qty"
                value={salesData?.soldQty || 0}
                icon={ShoppingCart}
                bgColor="bg-gradient-to-br from-green-300 to-green-400"
                onClick={() => navigate("/stock-report")}
                tooltip="Total quantity of items sold. Click to view Stock Report."
              />
              <AnimatedMetricCard
                title="S/R Amount"
                value={saleReturnData?.total || 0}
                icon={RotateCcw}
                bgColor="bg-gradient-to-br from-cyan-300 to-cyan-400"
                onClick={() => navigate("/sale-return-dashboard")}
                tooltip="Total sale return amount. Click to view Sale Returns."
                isCurrency
              />
              <AnimatedMetricCard
                title="Customers"
                value={customersCount || 0}
                icon={Users}
                bgColor="bg-gradient-to-br from-pink-300 to-pink-400"
                onClick={() => navigate("/customers")}
                tooltip="Total registered customers. Click to manage customers."
              />
            </div>
          </div>

          {/* Purchase Overview */}
          <div>
            <h2 className="text-base font-bold mb-3 text-foreground flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-secondary to-transparent rounded-full" />
              Purchase Overview
            </h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <AnimatedMetricCard
                title="Total Purchase"
                value={purchaseData?.total || 0}
                icon={ShoppingCart}
                bgColor="bg-gradient-to-br from-emerald-300 to-emerald-400"
                onClick={() => navigate("/purchase-bills")}
                tooltip="Total amount spent on purchases. Click to view Purchase Dashboard."
                isCurrency
              />
              <AnimatedMetricCard
                title="Bills"
                value={purchaseData?.count || 0}
                icon={FileText}
                bgColor="bg-gradient-to-br from-teal-300 to-teal-400"
                onClick={() => navigate("/purchase-bills")}
                tooltip="Number of purchase bills recorded. Click to view all bills."
              />
              <AnimatedMetricCard
                title="Purchase Qty"
                value={purchaseData?.purchaseQty || 0}
                icon={Package}
                bgColor="bg-gradient-to-br from-orange-300 to-orange-400"
                onClick={() => navigate("/stock-report")}
                tooltip="Total quantity of items purchased. Click to view Stock Report."
              />
              <AnimatedMetricCard
                title="P/R Amount"
                value={purchaseReturnData?.total || 0}
                icon={RotateCcw}
                bgColor="bg-gradient-to-br from-amber-300 to-amber-400"
                onClick={() => navigate("/purchase-return-dashboard")}
                tooltip="Total purchase return amount. Click to view Purchase Returns."
                isCurrency
              />
              <AnimatedMetricCard
                title="Suppliers"
                value={suppliersCount || 0}
                icon={Store}
                bgColor="bg-gradient-to-br from-purple-300 to-purple-400"
                onClick={() => navigate("/suppliers")}
                tooltip="Total registered suppliers. Click to manage suppliers."
              />
            </div>
          </div>

          {/* Inventory & Financial Metrics */}
          <div>
            <h2 className="text-base font-bold mb-3 text-foreground flex items-center gap-2">
              <div className="h-1 w-8 bg-gradient-to-r from-accent to-transparent rounded-full" />
              Inventory & Financial
            </h2>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
              <AnimatedMetricCard
                title="Products"
                value={productsCount || 0}
                icon={Package}
                bgColor="bg-gradient-to-br from-violet-300 to-violet-400"
                onClick={() => navigate("/products")}
                tooltip="Total unique products in inventory. Click to view Product Dashboard."
              />
              <AnimatedMetricCard
                title="Stock Qty"
                value={stockData || 0}
                icon={Package}
                bgColor="bg-gradient-to-br from-indigo-300 to-indigo-400"
                onClick={() => navigate("/stock-report")}
                tooltip="Total items in stock across all variants. Click to view Stock Report."
              />
              <AnimatedMetricCard
                title="Stock Value"
                value={stockValue || 0}
                icon={DollarSign}
                bgColor="bg-gradient-to-br from-fuchsia-300 to-fuchsia-400"
                onClick={() => navigate("/stock-report")}
                tooltip="Total value of current inventory at sale price. Click to view details."
                isCurrency
              />
              {canViewGrossProfit && (
                <AnimatedMetricCard
                  title="Gross Profit"
                  value={profitData || 0}
                  icon={TrendingUp}
                  bgColor="bg-gradient-to-br from-green-400 to-green-500"
                  onClick={() => navigate("/daily-cashier-report")}
                  tooltip="Sales revenue minus purchase cost. Click to view Cashier Report."
                  isCurrency
                />
              )}
              <AnimatedMetricCard
                title="Receivables"
                value={receivablesData?.total || 0}
                icon={AlertCircle}
                bgColor="bg-gradient-to-br from-red-300 to-red-400"
                onClick={() => navigate("/payments-dashboard")}
                tooltip={`Outstanding from ${receivablesData?.count || 0} pending invoices. Click to view Payments Dashboard.`}
                isCurrency
              />
            </div>
          </div>

          {/* Field Sales App Section - Only visible for users with field sales access */}
          {hasFieldSalesAccess && (
            <div>
              <h2 className="text-base font-bold mb-3 text-foreground flex items-center gap-2">
                <div className="h-1 w-8 bg-gradient-to-r from-orange-500 to-transparent rounded-full" />
                Field Sales App
              </h2>
              <Card className="bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 border-0 shadow-md">
                <CardHeader className="p-2 pb-1">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-white/20">
                      <Smartphone className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-sm text-white">Field Sales Mobile App</CardTitle>
                      <CardDescription className="text-xs text-white/80">
                        Welcome, {employeeName || "Salesman"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-2 pt-1">
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      size="sm"
                      onClick={() => navigate("/salesman")}
                      className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
                    >
                      <Smartphone className="mr-1 h-3 w-3" />
                      Open App
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/order/new")}
                      className="h-7 text-xs bg-white/10 hover:bg-white/20 text-white border-white/30"
                    >
                      <ClipboardList className="mr-1 h-3 w-3" />
                      New Order
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/customers")}
                      className="h-7 text-xs bg-white/10 hover:bg-white/20 text-white border-white/30"
                    >
                      <MapPin className="mr-1 h-3 w-3" />
                      Customers
                    </Button>
                    <Button 
                      size="sm"
                      variant="outline" 
                      onClick={() => navigate("/salesman/outstanding")}
                      className="h-7 text-xs bg-white/10 hover:bg-white/20 text-white border-white/30"
                    >
                      <IndianRupee className="mr-1 h-3 w-3" />
                      Outstanding
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Charts Section */}
          <StatsChartsSection />
        </div>

        {/* Right side - New Updates panel (1 column on xl) */}
        <div className="xl:col-span-1">
          <NewUpdatesPanel />
        </div>
      </div>
    </div>
    </TooltipProvider>
  );
};

const Index = () => {
  const { currentOrganization, organizations, loading } = useOrganization();

  // Only redirect if user genuinely has no organizations
  // If organizations exist, we're just waiting for currentOrganization to be set by OrgLayout
  if (!loading && organizations.length === 0) {
    window.location.href = "/organization-setup";
    return null;
  }

  // Show loader while waiting for currentOrganization to be set
  if (!currentOrganization) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <DashboardContent />;
};

export default Index;
