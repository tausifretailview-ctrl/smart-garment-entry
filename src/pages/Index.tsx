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
      <div className="group relative" onClick={onClick}>
        <Card className={`${bgColor} relative overflow-hidden border-0 shadow-sm group-hover:shadow-md transition-all duration-300 group-hover:scale-[1.02] cursor-pointer`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-1">
            <CardTitle className="text-xs font-bold text-foreground">
              {title}
            </CardTitle>
            <div className="p-1.5 rounded-lg bg-white/20">
              <Icon className="h-3.5 w-3.5 text-white" />
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            <div className="text-lg font-extrabold text-foreground">
              {value}
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
        .is("deleted_at", null)
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
  });

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
        .is("deleted_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      
      const totalSales = salesData?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
      
      // Get purchase amount for same period
      const { data: purchaseData } = await supabase
        .from("purchase_bills")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
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
        .is("deleted_at", null)
        .gte("sale_date", startDate)
        .lte("sale_date", endDate);
      
      return data?.reduce((sum, item) => sum + (item.cash_amount || item.paid_amount || 0), 0) || 0;
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
    <div className="space-y-3">
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
              </SelectContent>
            </Select>
            <span className="text-xs font-medium text-primary">{dateLabel}</span>
          </div>
        </div>
      </div>

      {/* Sales Overview */}
      <div>
        <h2 className="text-sm font-bold mb-2 text-foreground flex items-center gap-2">
          <div className="h-0.5 w-6 bg-gradient-to-r from-primary to-transparent rounded-full" />
          Sales Overview
        </h2>
        <div className="grid gap-2 grid-cols-3 lg:grid-cols-6">
          <MetricCard
            title="Total Sales"
            value={formatCurrency(salesData?.total || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-blue-300 to-blue-400"
            onClick={() => navigate("/sales-invoice-dashboard")}
            tooltip="Total revenue from all sales invoices. Click to view Sales Dashboard."
          />
          <MetricCard
            title="Invoices"
            value={salesData?.count || 0}
            icon={FileText}
            bgColor="bg-gradient-to-br from-orange-300 to-orange-400"
            onClick={() => navigate("/sales-invoice-dashboard")}
            tooltip="Number of sales invoices generated. Click to view all invoices."
          />
          <MetricCard
            title="Sold Qty"
            value={salesData?.soldQty || 0}
            icon={ShoppingCart}
            bgColor="bg-gradient-to-br from-green-300 to-green-400"
            onClick={() => navigate("/stock-report")}
            tooltip="Total quantity of items sold. Click to view Stock Report."
          />
          <MetricCard
            title="S/R Amount"
            value={formatCurrency(saleReturnData?.total || 0)}
            icon={RotateCcw}
            bgColor="bg-gradient-to-br from-cyan-300 to-cyan-400"
            onClick={() => navigate("/sale-return-dashboard")}
            tooltip="Total sale return amount. Click to view Sale Returns."
          />
          <MetricCard
            title="S/R Qty"
            value={saleReturnData?.returnQty || 0}
            icon={RotateCcw}
            bgColor="bg-gradient-to-br from-slate-300 to-slate-400"
            onClick={() => navigate("/sale-return-dashboard")}
            tooltip="Total sale return quantity. Click to view Sale Returns."
          />
          <MetricCard
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
        <h2 className="text-sm font-bold mb-2 text-foreground flex items-center gap-2">
          <div className="h-0.5 w-6 bg-gradient-to-r from-secondary to-transparent rounded-full" />
          Purchase Overview
        </h2>
        <div className="grid gap-2 grid-cols-3 lg:grid-cols-6">
          <MetricCard
            title="Total Purchase"
            value={formatCurrency(purchaseData?.total || 0)}
            icon={ShoppingCart}
            bgColor="bg-gradient-to-br from-emerald-300 to-emerald-400"
            onClick={() => navigate("/purchase-bills")}
            tooltip="Total amount spent on purchases. Click to view Purchase Dashboard."
          />
          <MetricCard
            title="Bills"
            value={purchaseData?.count || 0}
            icon={FileText}
            bgColor="bg-gradient-to-br from-teal-300 to-teal-400"
            onClick={() => navigate("/purchase-bills")}
            tooltip="Number of purchase bills recorded. Click to view all bills."
          />
          <MetricCard
            title="Purchase Qty"
            value={purchaseData?.purchaseQty || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-orange-300 to-orange-400"
            onClick={() => navigate("/stock-report")}
            tooltip="Total quantity of items purchased. Click to view Stock Report."
          />
          <MetricCard
            title="P/R Amount"
            value={formatCurrency(purchaseReturnData?.total || 0)}
            icon={RotateCcw}
            bgColor="bg-gradient-to-br from-amber-300 to-amber-400"
            onClick={() => navigate("/purchase-return-dashboard")}
            tooltip="Total purchase return amount. Click to view Purchase Returns."
          />
          <MetricCard
            title="P/R Qty"
            value={purchaseReturnData?.returnQty || 0}
            icon={RotateCcw}
            bgColor="bg-gradient-to-br from-yellow-300 to-yellow-400"
            onClick={() => navigate("/purchase-return-dashboard")}
            tooltip="Total purchase return quantity. Click to view Purchase Returns."
          />
          <MetricCard
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
        <h2 className="text-sm font-bold mb-2 text-foreground flex items-center gap-2">
          <div className="h-0.5 w-6 bg-gradient-to-r from-accent to-transparent rounded-full" />
          Inventory & Financial
        </h2>
        <div className="grid gap-2 grid-cols-3 lg:grid-cols-6">
          <MetricCard
            title="Products"
            value={productsCount || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-violet-300 to-violet-400"
            onClick={() => navigate("/products")}
            tooltip="Total unique products in inventory. Click to view Product Dashboard."
          />
          <MetricCard
            title="Stock Qty"
            value={stockData || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-indigo-300 to-indigo-400"
            onClick={() => navigate("/stock-report")}
            tooltip="Total items in stock across all variants. Click to view Stock Report."
          />
          <MetricCard
            title="Stock Value"
            value={formatCurrency(stockValue || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-fuchsia-300 to-fuchsia-400"
            onClick={() => navigate("/stock-report")}
            tooltip="Total value of current inventory at sale price. Click to view details."
          />
          <MetricCard
            title="Gross Profit"
            value={formatCurrency(profitData || 0)}
            icon={TrendingUp}
            bgColor="bg-gradient-to-br from-green-400 to-green-500"
            onClick={() => navigate("/daily-cashier-report")}
            tooltip="Sales revenue minus purchase cost. Click to view Cashier Report."
          />
          <MetricCard
            title="Receivables"
            value={formatCurrency(receivablesData?.total || 0)}
            icon={AlertCircle}
            bgColor="bg-gradient-to-br from-red-300 to-red-400"
            onClick={() => navigate("/payments-dashboard")}
            tooltip={`Outstanding from ${receivablesData?.count || 0} pending invoices. Click to view Payments Dashboard.`}
          />
          <MetricCard
            title="Cash Collection"
            value={formatCurrency(cashCollection || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-sky-300 to-sky-400"
            onClick={() => navigate("/payments-dashboard")}
            tooltip="Total cash collected from sales. Click to view Payments Dashboard."
          />
        </div>
      </div>

      {/* Field Sales App Section - Only visible for users with field sales access */}
      {hasFieldSalesAccess && (
        <div>
          <h2 className="text-sm font-bold mb-2 text-foreground flex items-center gap-2">
            <div className="h-0.5 w-6 bg-gradient-to-r from-orange-500 to-transparent rounded-full" />
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
