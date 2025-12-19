import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { AnimatedChart } from "./AnimatedChart";
import { format, subDays, startOfDay } from "date-fns";

export const StatsChartsSection = () => {
  const { currentOrganization } = useOrganization();

  // Fetch last 7 days sales data
  const { data: salesData } = useQuery({
    queryKey: ["sales-trend", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return {
          date: startOfDay(date),
          name: format(date, "MMM dd"),
        };
      });

      const { data, error } = await supabase
        .from("sales")
        .select("net_amount, sale_date")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("sale_date", format(last7Days[0].date, "yyyy-MM-dd"))
        .order("sale_date", { ascending: true });

      if (error) throw error;

      const salesByDay = last7Days.map(day => {
        const daySales = data?.filter(
          sale => format(new Date(sale.sale_date), "MMM dd") === day.name
        ) || [];
        
        return {
          name: day.name,
          sales: daySales.reduce((sum, sale) => sum + (sale.net_amount || 0), 0),
        };
      });

      return salesByDay;
    },
    enabled: !!currentOrganization,
  });

  // Fetch last 7 days purchase data
  const { data: purchaseData } = useQuery({
    queryKey: ["purchase-trend", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return {
          date: startOfDay(date),
          name: format(date, "MMM dd"),
        };
      });

      const { data, error } = await supabase
        .from("purchase_bills")
        .select("net_amount, bill_date")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .gte("bill_date", format(last7Days[0].date, "yyyy-MM-dd"))
        .order("bill_date", { ascending: true });

      if (error) throw error;

      const purchaseByDay = last7Days.map(day => {
        const dayPurchases = data?.filter(
          purchase => format(new Date(purchase.bill_date), "MMM dd") === day.name
        ) || [];
        
        return {
          name: day.name,
          purchases: dayPurchases.reduce((sum, purchase) => sum + (purchase.net_amount || 0), 0),
        };
      });

      return purchaseByDay;
    },
    enabled: !!currentOrganization,
  });

  // Fetch top 5 products by stock value
  const { data: topProductsData } = useQuery({
    queryKey: ["top-products", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, sale_price, products!inner(product_name, organization_id)")
        .eq("products.organization_id", currentOrganization.id)
        .order("stock_qty", { ascending: false })
        .limit(5);

      if (error) throw error;

      return data?.map(item => ({
        name: item.products.product_name.length > 15 
          ? item.products.product_name.substring(0, 15) + "..." 
          : item.products.product_name,
        stock: item.stock_qty || 0,
        value: (item.stock_qty || 0) * (Number(item.sale_price) || 0),
      })) || [];
    },
    enabled: !!currentOrganization,
  });

  // Combine sales and purchases for comparison
  const combinedData = salesData?.map((sale, index) => ({
    name: sale.name,
    sales: sale.sales,
    purchases: purchaseData?.[index]?.purchases || 0,
  })) || [];

  return (
    <div className="space-y-8 animate-fade-in" style={{ animationDelay: "0.5s" }}>
      <h2 className="text-2xl font-display font-bold mb-6 text-foreground flex items-center gap-3">
        <div className="h-1 w-12 bg-gradient-to-r from-warning to-transparent rounded-full" />
        Analytics & Trends
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Sales vs Purchase Comparison */}
        <AnimatedChart
          title="Sales vs Purchases (Last 7 Days)"
          data={combinedData}
          type="bar"
          dataKeys={[
            { key: "sales", color: "hsl(var(--primary))", name: "Sales" },
            { key: "purchases", color: "hsl(var(--secondary))", name: "Purchases" },
          ]}
          height={320}
        />

        {/* Sales Trend */}
        <AnimatedChart
          title="Sales Trend (Last 7 Days)"
          data={salesData || []}
          type="area"
          dataKeys={[
            { key: "sales", color: "hsl(var(--success))", name: "Sales Amount" },
          ]}
          height={320}
        />

        {/* Top Products by Stock */}
        <AnimatedChart
          title="Top 5 Products by Stock Quantity"
          data={topProductsData || []}
          type="bar"
          dataKeys={[
            { key: "stock", color: "hsl(var(--accent))", name: "Stock Qty" },
          ]}
          height={320}
        />

        {/* Top Products by Value */}
        <AnimatedChart
          title="Top 5 Products by Stock Value"
          data={topProductsData || []}
          type="line"
          dataKeys={[
            { key: "value", color: "hsl(var(--warning))", name: "Stock Value (₹)" },
          ]}
          height={320}
        />
      </div>
    </div>
  );
};