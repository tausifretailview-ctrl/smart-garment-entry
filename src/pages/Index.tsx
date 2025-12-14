import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgNavigation } from "@/hooks/useOrgNavigation";
import { useFieldSalesAccess } from "@/hooks/useFieldSalesAccess";
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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import { StatsChartsSection } from "@/components/dashboard/StatsChartsSection";
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

const MetricCard = ({
  title,
  value,
  icon: Icon,
  bgColor,
  onClick,
  tooltip,
}: {
  title: string;
  value: string | number;
  icon: any;
  bgColor: string;
  onClick?: () => void;
  tooltip?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <div className="group relative animate-fade-in" onClick={onClick}>
        <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-secondary to-accent rounded-2xl opacity-0 group-hover:opacity-100 blur-sm transition-all duration-500 group-hover:duration-300 animate-gradient-shift" />
        
        <Card className={`${bgColor} relative overflow-hidden border-2 border-transparent group-hover:border-primary/20 transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-elevated cursor-pointer`}>
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-display font-semibold tracking-wide group-hover:text-primary transition-colors duration-300">
              {title}
            </CardTitle>
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 group-hover:from-primary/20 group-hover:to-secondary/20 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3">
              <div className="absolute inset-0 rounded-xl bg-primary/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <Icon className="h-5 w-5 text-primary relative z-10 transition-all duration-300 group-hover:scale-110 group-hover:drop-shadow-glow" />
            </div>
          </CardHeader>
          
          <CardContent>
            <div className="text-3xl font-display font-bold bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent group-hover:from-primary group-hover:to-secondary transition-all duration-500">
              {value}
            </div>
            
            <div className="mt-3 h-1 w-0 group-hover:w-full bg-gradient-to-r from-primary via-secondary to-accent rounded-full transition-all duration-500 shadow-glow" />
          </CardContent>
          
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-[100px] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </Card>
      </div>
    </TooltipTrigger>
    {tooltip && (
      <TooltipContent side="bottom" className="max-w-[200px]">
        <p className="text-sm">{tooltip}</p>
      </TooltipContent>
    )}
  </Tooltip>
);

type DateRangeType = "monthly" | "quarterly" | "yearly";

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
  }
};

const DashboardContent = () => {
  const { currentOrganization } = useOrganization();
  const { orgNavigate: navigate } = useOrgNavigation();
  const { hasAccess: hasFieldSalesAccess, employeeName } = useFieldSalesAccess();
  const [dateRange, setDateRange] = useState<DateRangeType>("monthly");
  
  const { start: startDate, end: endDate, label: dateLabel } = getDateRange(dateRange);

  // Fetch total sales for selected period
  const { data: salesData } = useQuery({
    queryKey: ["total-sales", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0, soldQty: 0 };
      
      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, id")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      if (error) throw error;
      
      const total = data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      const count = data?.length || 0;
      
      // Fetch sold quantity
      const saleIds = data?.map(s => s.id) || [];
      let soldQty = 0;
      if (saleIds.length > 0) {
        const { data: itemsData } = await supabase
          .from("sale_items")
          .select("quantity")
          .in("sale_id", saleIds);
        soldQty = itemsData?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
      }
      
      return { total, count, soldQty };
    },
    enabled: !!currentOrganization,
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
  });
  
  // Fetch total stock quantity
  const { data: stockData } = useQuery({
    queryKey: ["total-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty")
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return data?.reduce((sum, item) => sum + (item.stock_qty || 0), 0) || 0;
    },
    enabled: !!currentOrganization,
  });

  // Fetch total products
  const { data: productsCount } = useQuery({
    queryKey: ["products-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { count, error } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!currentOrganization,
  });

  // Fetch total purchase for selected period
  const { data: purchaseData } = useQuery({
    queryKey: ["purchase-total", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0, purchaseQty: 0 };
      
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount, id")
        .eq("organization_id", currentOrganization.id)
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
  });

  // Fetch stock value
  const { data: stockValue } = useQuery({
    queryKey: ["stock-value", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, sale_price")
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return (
        data?.reduce(
          (sum, item) =>
            sum + (item.stock_qty || 0) * (Number(item.sale_price) || 0),
          0
        ) || 0
      );
    },
    enabled: !!currentOrganization,
  });

  // Calculate profit (Sales - Purchase Cost)
  const { data: profitData } = useQuery({
    queryKey: ["profit-data", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      // Get sales amount
      const { data: salesData } = await supabase
        .from("sales")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      
      const totalSales = salesData?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      
      // Get purchase amount for same period
      const { data: purchaseData } = await supabase
        .from("purchase_bills")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .gte("bill_date", startDate)
        .lte("bill_date", endDate);
      
      const totalPurchase = purchaseData?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      
      return totalSales - totalPurchase;
    },
    enabled: !!currentOrganization,
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
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      
      return data?.reduce((sum, item) => sum + (item.cash_amount || item.paid_amount || 0), 0) || 0;
    },
    enabled: !!currentOrganization,
  });

  // Fetch S/R Adjusted (sale return adjustments used against new purchases)
  const { data: srAdjustedData } = useQuery({
    queryKey: ["sr-adjusted", currentOrganization?.id, startDate, endDate],
    queryFn: async () => {
      if (!currentOrganization) return { total: 0, count: 0 };
      
      const { data } = await supabase
        .from("sales")
        .select("sale_return_adjust")
        .eq("organization_id", currentOrganization.id)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate)
        .gt("sale_return_adjust", 0);
      
      const total = data?.reduce((sum, item) => sum + (Number(item.sale_return_adjust) || 0), 0) || 0;
      const count = data?.length || 0;
      
      return { total, count };
    },
    enabled: !!currentOrganization,
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
        .in("payment_status", ["pending", "partial"]);
      
      const total = data?.reduce((sum, item) => {
        const balance = (Number(item.net_amount) || 0) - (Number(item.paid_amount) || 0);
        return sum + Math.max(0, balance);
      }, 0) || 0;
      const count = data?.length || 0;
      
      return { total, count };
    },
    enabled: !!currentOrganization,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <TooltipProvider>
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
        <div>
          <h1 className="text-5xl font-display font-bold bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent animate-gradient-shift bg-[length:200%_auto]">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2 text-lg font-medium">
            Welcome to Smart Inventory Management System
          </p>
        </div>
        
        {/* Date Range Selector */}
        <div className="flex items-center gap-3 bg-card border rounded-lg p-2 shadow-sm">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <Select value={dateRange} onValueChange={(v: DateRangeType) => setDateRange(v)}>
            <SelectTrigger className="w-[140px] border-0 shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm font-medium text-primary">{dateLabel}</span>
        </div>
      </div>

      {/* Sales Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <h2 className="text-2xl font-display font-bold mb-6 text-foreground flex items-center gap-3">
          <div className="h-1 w-12 bg-gradient-to-r from-primary to-transparent rounded-full" />
          Sales Overview
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Sales"
            value={formatCurrency(salesData?.total || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900"
            onClick={() => navigate("/sales-invoice-dashboard")}
            tooltip="Total revenue from all sales invoices. Click to view Sales Dashboard."
          />
          <MetricCard
            title="Total Invoices"
            value={salesData?.count || 0}
            icon={FileText}
            bgColor="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900"
            onClick={() => navigate("/sales-invoice-dashboard")}
            tooltip="Number of sales invoices generated. Click to view all invoices."
          />
          <MetricCard
            title="Sold Qty"
            value={salesData?.soldQty || 0}
            icon={ShoppingCart}
            bgColor="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900"
            onClick={() => navigate("/stock-report")}
            tooltip="Total quantity of items sold. Click to view Stock Report."
          />
          <MetricCard
            title="Total Customers"
            value={customersCount || 0}
            icon={Users}
            bgColor="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900"
            onClick={() => navigate("/customers")}
            tooltip="Total registered customers. Click to manage customers."
          />
        </div>
      </div>

      {/* Purchase Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <h2 className="text-2xl font-display font-bold mb-6 text-foreground flex items-center gap-3">
          <div className="h-1 w-12 bg-gradient-to-r from-secondary to-transparent rounded-full" />
          Purchase Overview
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Purchase"
            value={formatCurrency(purchaseData?.total || 0)}
            icon={ShoppingCart}
            bgColor="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900"
            onClick={() => navigate("/purchase-bills")}
            tooltip="Total amount spent on purchases. Click to view Purchase Dashboard."
          />
          <MetricCard
            title="Total Bills"
            value={purchaseData?.count || 0}
            icon={FileText}
            bgColor="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900"
            onClick={() => navigate("/purchase-bills")}
            tooltip="Number of purchase bills recorded. Click to view all bills."
          />
          <MetricCard
            title="Purchase Qty"
            value={purchaseData?.purchaseQty || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900"
            onClick={() => navigate("/stock-report")}
            tooltip="Total quantity of items purchased. Click to view Stock Report."
          />
          <MetricCard
            title="Total Suppliers"
            value={suppliersCount || 0}
            icon={Store}
            bgColor="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900"
            onClick={() => navigate("/suppliers")}
            tooltip="Total registered suppliers. Click to manage suppliers."
          />
        </div>
      </div>

      {/* Inventory & Financial Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <h2 className="text-2xl font-display font-bold mb-6 text-foreground flex items-center gap-3">
          <div className="h-1 w-12 bg-gradient-to-r from-accent to-transparent rounded-full" />
          Inventory & Financial
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Total Products"
            value={productsCount || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900"
            onClick={() => navigate("/products")}
            tooltip="Total unique products in inventory. Click to view Product Dashboard."
          />
          <MetricCard
            title="Stock Qty"
            value={stockData || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900"
            onClick={() => navigate("/stock-report")}
            tooltip="Total items in stock across all variants. Click to view Stock Report."
          />
          <MetricCard
            title="Stock Value"
            value={formatCurrency(stockValue || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900"
            onClick={() => navigate("/stock-report")}
            tooltip="Total value of current inventory at sale price. Click to view details."
          />
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
        <h2 className="text-2xl font-display font-bold mb-6 text-foreground flex items-center gap-3">
          <div className="h-1 w-12 bg-gradient-to-r from-success to-transparent rounded-full" />
          Performance Metrics
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            title="Gross Profit"
            value={formatCurrency(profitData || 0)}
            icon={TrendingUp}
            bgColor="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900"
            onClick={() => navigate("/daily-cashier-report")}
            tooltip="Sales revenue minus purchase cost. Click to view Cashier Report."
          />
          <MetricCard
            title="Profit Margin"
            value={salesData?.total ? `${(((profitData || 0) / salesData.total) * 100).toFixed(1)}%` : "0%"}
            icon={TrendingUp}
            bgColor="bg-gradient-to-br from-lime-50 to-lime-100 dark:from-lime-950 dark:to-lime-900"
            onClick={() => navigate("/daily-cashier-report")}
            tooltip="Percentage of profit relative to total sales. Click to view details."
          />
          <MetricCard
            title="Cash Collection"
            value={formatCurrency(cashCollection || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950 dark:to-sky-900"
            onClick={() => navigate("/payments-dashboard")}
            tooltip="Total cash collected from sales. Click to view Payments Dashboard."
          />
          <MetricCard
            title="Receivables"
            value={formatCurrency(receivablesData?.total || 0)}
            icon={AlertCircle}
            bgColor="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900"
            onClick={() => navigate("/payments-dashboard")}
            tooltip={`Outstanding from ${receivablesData?.count || 0} pending invoices. Click to view Payments Dashboard.`}
          />
          <MetricCard
            title="S/R Adjusted"
            value={formatCurrency(srAdjustedData?.total || 0)}
            icon={RotateCcw}
            bgColor="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900"
            onClick={() => navigate("/sale-return-dashboard")}
            tooltip={`Sale return credit used against ${srAdjustedData?.count || 0} new purchases. Click to view Sale Returns.`}
          />
        </div>
      </div>

      {/* Field Sales App Section - Only visible for users with field sales access */}
      {hasFieldSalesAccess && (
        <div className="animate-fade-in" style={{ animationDelay: "0.5s" }}>
          <h2 className="text-2xl font-display font-bold mb-6 text-foreground flex items-center gap-3">
            <div className="h-1 w-12 bg-gradient-to-r from-orange-500 to-transparent rounded-full" />
            Field Sales App
          </h2>
          <Card className="bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 dark:from-orange-950 dark:via-amber-950 dark:to-yellow-950 border-orange-200 dark:border-orange-800">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg">
                  <Smartphone className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-xl">Field Sales Mobile App</CardTitle>
                  <CardDescription className="text-base">
                    Welcome, {employeeName || "Salesman"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Access your mobile sales tools to manage customers, create orders, and track outstanding payments on the go.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button 
                  onClick={() => navigate("/salesman")}
                  className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white"
                >
                  <Smartphone className="mr-2 h-4 w-4" />
                  Open Field Sales App
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/salesman/order/new")}
                  className="border-orange-300 hover:bg-orange-50 dark:border-orange-700 dark:hover:bg-orange-950"
                >
                  <ClipboardList className="mr-2 h-4 w-4" />
                  New Order
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/salesman/customers")}
                  className="border-orange-300 hover:bg-orange-50 dark:border-orange-700 dark:hover:bg-orange-950"
                >
                  <MapPin className="mr-2 h-4 w-4" />
                  Customers
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/salesman/outstanding")}
                  className="border-orange-300 hover:bg-orange-50 dark:border-orange-700 dark:hover:bg-orange-950"
                >
                  <IndianRupee className="mr-2 h-4 w-4" />
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
