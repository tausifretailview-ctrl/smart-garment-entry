import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Package,
  ShoppingCart,
  FileText,
  TrendingUp,
  Users,
  Store,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOrganization } from "@/contexts/OrganizationContext";

const MetricCard = ({
  title,
  value,
  icon: Icon,
  bgColor,
}: {
  title: string;
  value: string | number;
  icon: any;
  bgColor: string;
}) => (
  <Card className={`${bgColor} hover:shadow-lg transition-shadow duration-300 animate-fade-in`}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <div className="p-2 rounded-lg bg-white/50 dark:bg-black/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
    </CardContent>
  </Card>
);

const DashboardContent = () => {
  const { currentOrganization } = useOrganization();
  const navigate = useNavigate();
  
  // Fetch total stock quantity
  const { data: stockData } = useQuery({
    queryKey: ["total-stock", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, products!inner(organization_id)")
        .eq("products.organization_id", currentOrganization.id);
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

  // Fetch total purchase
  const { data: purchaseTotal } = useQuery({
    queryKey: ["purchase-total", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount")
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return data?.reduce((sum, item) => sum + (item.net_amount || 0), 0) || 0;
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
        .select("stock_qty, sale_price, products!inner(organization_id)")
        .eq("products.organization_id", currentOrganization.id);
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

  // Fetch total purchase bills count
  const { data: billsCount } = useQuery({
    queryKey: ["bills-count", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return 0;
      
      const { count, error } = await supabase
        .from("purchase_bills")
        .select("*", { count: "exact", head: true })
        .eq("organization_id", currentOrganization.id);
      if (error) throw error;
      return count || 0;
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
    <div className="space-y-8">
      <div className="flex items-center justify-between animate-fade-in">
        <div>
          <h1 className="text-4xl font-display font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome to Smart Inventory Management System
          </p>
        </div>
      </div>

      {/* Sales Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Sales Overview</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Sales"
            value="₹0"
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-950 dark:to-cyan-900"
          />
          <MetricCard
            title="Total Invoice"
            value="0"
            icon={FileText}
            bgColor="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900"
          />
          <MetricCard
            title="Sold Qty"
            value="0"
            icon={ShoppingCart}
            bgColor="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900"
          />
          <MetricCard
            title="Total Customers"
            value="0"
            icon={Users}
            bgColor="bg-gradient-to-br from-pink-50 to-pink-100 dark:from-pink-950 dark:to-pink-900"
          />
        </div>
      </div>

      {/* Purchase Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.2s" }}>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Purchase Overview</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Purchase"
            value={formatCurrency(purchaseTotal || 0)}
            icon={ShoppingCart}
            bgColor="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900"
          />
          <MetricCard
            title="Total Bills"
            value={billsCount || 0}
            icon={FileText}
            bgColor="bg-gradient-to-br from-teal-50 to-teal-100 dark:from-teal-950 dark:to-teal-900"
          />
          <MetricCard
            title="Purchase Qty"
            value="0"
            icon={Package}
            bgColor="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900"
          />
          <MetricCard
            title="Total Suppliers"
            value="0"
            icon={Store}
            bgColor="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950 dark:to-violet-900"
          />
        </div>
      </div>

      {/* Inventory & Financial Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.3s" }}>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Inventory & Financial</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Total Products"
            value={productsCount || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900"
          />
          <MetricCard
            title="Stock Qty"
            value={stockData || 0}
            icon={Package}
            bgColor="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900"
          />
          <MetricCard
            title="Stock Value"
            value={formatCurrency(stockValue || 0)}
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-rose-50 to-rose-100 dark:from-rose-950 dark:to-rose-900"
          />
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="animate-fade-in" style={{ animationDelay: "0.4s" }}>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Performance Metrics</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Total Profit"
            value="₹0"
            icon={TrendingUp}
            bgColor="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950 dark:to-green-900"
          />
          <MetricCard
            title="Avg. Profit Margin"
            value="₹0"
            icon={TrendingUp}
            bgColor="bg-gradient-to-br from-lime-50 to-lime-100 dark:from-lime-950 dark:to-lime-900"
          />
          <MetricCard
            title="Cash in Hand"
            value="₹0"
            icon={DollarSign}
            bgColor="bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-950 dark:to-sky-900"
          />
        </div>
      </div>
    </div>
  );
};

const Index = () => {
  const { currentOrganization, loading } = useOrganization();
  const navigate = useNavigate();

  // Redirect to organization setup if user has no organization
  if (!loading && !currentOrganization) {
    navigate("/organization-setup", { replace: true });
    return null;
  }

  return <DashboardContent />;
};

export default Index;
