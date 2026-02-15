import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { AnimatedChart } from "./AnimatedChart";
import { format, subDays, startOfDay } from "date-fns";
import { useTierBasedRefresh } from "@/hooks/useTierBasedRefresh";

export const StatsChartsSection = () => {
  const { currentOrganization } = useOrganization();
  
  // Tier-based polling - reduces cloud usage based on subscription tier
  const { getRefreshInterval } = useTierBasedRefresh();

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
    staleTime: 60000, // 1 minute stale time
    refetchInterval: getRefreshInterval('medium'), // Tier-based polling
  });

  // Fetch last 7 days purchase data - using aggregation view
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
        .from("v_dashboard_purchase_summary")
        .select("total_purchase_amount, purchase_day")
        .eq("organization_id", currentOrganization.id)
        .gte("purchase_day", format(last7Days[0].date, "yyyy-MM-dd"));

      if (error) throw error;

      const purchaseByDay = last7Days.map(day => {
        const dayPurchases = data?.filter(
          row => format(new Date(row.purchase_day), "MMM dd") === day.name
        ) || [];
        
        return {
          name: day.name,
          purchases: dayPurchases.reduce((sum, row) => sum + (Number(row.total_purchase_amount) || 0), 0),
        };
      });

      return purchaseByDay;
    },
    enabled: !!currentOrganization,
    staleTime: 60000,
    refetchInterval: getRefreshInterval('medium'),
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
    staleTime: 120000, // 2 minutes stale time
    refetchInterval: false, // No auto-refresh - on-demand only (Phase 4)
  });

  // Combine sales and purchases for comparison
  const combinedData = salesData?.map((sale, index) => ({
    name: sale.name,
    sales: sale.sales,
    purchases: purchaseData?.[index]?.purchases || 0,
  })) || [];

  // Use semantic primary color for consistent theming
  const primaryColor = "hsl(var(--primary))";
  const successColor = "hsl(var(--success))";
  const accentColor = "hsl(var(--accent))";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sales vs Purchase Comparison */}
        <AnimatedChart
          title="Sales vs Purchases (Last 7 Days)"
          data={combinedData}
          type="bar"
          dataKeys={[
            { key: "sales", color: primaryColor, name: "Sales" },
            { key: "purchases", color: successColor, name: "Purchases" },
          ]}
          height={260}
        />

        {/* Sales Trend */}
        <AnimatedChart
          title="Sales Trend (Last 7 Days)"
          data={salesData || []}
          type="area"
          dataKeys={[
            { key: "sales", color: primaryColor, name: "Sales Amount" },
          ]}
          height={260}
        />

        {/* Top Products by Stock */}
        <AnimatedChart
          title="Top 5 Products by Stock Quantity"
          data={topProductsData || []}
          type="bar"
          dataKeys={[
            { key: "stock", color: accentColor, name: "Stock Qty" },
          ]}
          height={260}
        />

        {/* Top Products by Value */}
        <AnimatedChart
          title="Top 5 Products by Stock Value"
          data={topProductsData || []}
          type="line"
          dataKeys={[
            { key: "value", color: primaryColor, name: "Stock Value (₹)" },
          ]}
          height={260}
        />
      </div>
    </div>
  );
};