import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { AnimatedChart } from "./AnimatedChart";
import { format, subDays, startOfDay } from "date-fns";
import { DASHBOARD_MANUAL_REFRESH_OPTIONS } from "@/lib/dashboardQueryOptions";

type StatsChartsSectionProps = {
  /** When false, chart queries do not hit Supabase until the user clicks Refresh. */
  loadEnabled?: boolean;
};

export const StatsChartsSection = ({ loadEnabled = false }: StatsChartsSectionProps) => {
  const { currentOrganization } = useOrganization();
  const chartsEnabled = loadEnabled && !!currentOrganization?.id;

  // Last 7 days sales — server-side daily summary (replaces unbounded sales row fetch)
  const { data: salesData } = useQuery({
    queryKey: ["sales-trend", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = subDays(new Date(), 6 - i);
        return {
          date: startOfDay(date),
          name: format(date, "MMM dd"),
          key: format(date, "yyyy-MM-dd"),
        };
      });

      const { data, error } = await supabase.rpc("get_sales_daily_summary", {
        p_org_id: currentOrganization.id,
        p_days: 7,
      });
      if (error) throw error;

      const amountByDay = new Map(
        (data ?? []).map((row: { sale_day: string; total_amount: number | null }) => [
          String(row.sale_day).slice(0, 10),
          Number(row.total_amount) || 0,
        ]),
      );

      return last7Days.map((day) => ({
        name: day.name,
        sales: amountByDay.get(day.key) ?? 0,
      }));
    },
    enabled: chartsEnabled,
    ...DASHBOARD_MANUAL_REFRESH_OPTIONS,
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
    enabled: chartsEnabled,
    ...DASHBOARD_MANUAL_REFRESH_OPTIONS,
  });

  // Fetch top 5 products by stock value
  const { data: topProductsData } = useQuery({
    queryKey: ["top-products", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization) return [];
      
      const { data, error } = await supabase
        .from("product_variants")
        .select("stock_qty, sale_price, products!inner(product_name, organization_id, product_type)")
        .eq("organization_id", currentOrganization.id)
        .eq("products.organization_id", currentOrganization.id)
        .eq("active", true)
        .neq("products.product_type", "service")
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
    enabled: chartsEnabled,
    ...DASHBOARD_MANUAL_REFRESH_OPTIONS,
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
    <div className="dashboard-charts-panel shrink-0 space-y-4">
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
