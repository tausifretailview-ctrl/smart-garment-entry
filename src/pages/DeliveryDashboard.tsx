import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { AnimatedChart } from "@/components/dashboard/AnimatedChart";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Layout } from "@/components/Layout";

const DeliveryDashboard = () => {
  const { currentOrganization } = useOrganization();

  // Fetch delivery statistics
  const { data: deliveryStats } = useQuery({
    queryKey: ["delivery-stats", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("sales")
        .select("delivery_status, net_amount")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      const total = data.length;
      const delivered = data.filter(s => s.delivery_status === "delivered").length;
      const pending = data.filter(s => s.delivery_status === "undelivered").length;
      const inProcess = data.filter(s => s.delivery_status === "in_process").length;

      const deliveredValue = data
        .filter(s => s.delivery_status === "delivered")
        .reduce((sum, s) => sum + Number(s.net_amount), 0);
      
      const pendingValue = data
        .filter(s => s.delivery_status === "undelivered")
        .reduce((sum, s) => sum + Number(s.net_amount), 0);

      return {
        total,
        delivered,
        pending,
        inProcess,
        deliveredValue,
        pendingValue,
      };
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch delivery trend data (last 7 days)
  const { data: trendData } = useQuery({
    queryKey: ["delivery-trend", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const days = 7;
      const chartData = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = subDays(new Date(), i);
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);

        const { data, error } = await supabase
          .from("sales")
          .select("delivery_status")
          .eq("organization_id", currentOrganization.id)
          .gte("sale_date", dayStart.toISOString())
          .lte("sale_date", dayEnd.toISOString());

        if (error) throw error;

        const delivered = data.filter(s => s.delivery_status === "delivered").length;
        const pending = data.filter(s => s.delivery_status === "undelivered").length;
        const inProcess = data.filter(s => s.delivery_status === "in_process").length;

        chartData.push({
          name: format(date, "MMM dd"),
          delivered,
          pending,
          inProcess,
        });
      }

      return chartData;
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch status distribution
  const { data: statusData } = useQuery({
    queryKey: ["delivery-status-distribution", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      const { data, error } = await supabase
        .from("sales")
        .select("delivery_status")
        .eq("organization_id", currentOrganization.id);

      if (error) throw error;

      const delivered = data.filter(s => s.delivery_status === "delivered").length;
      const pending = data.filter(s => s.delivery_status === "undelivered").length;
      const inProcess = data.filter(s => s.delivery_status === "in_process").length;

      return [
        { name: "Delivered", value: delivered },
        { name: "Pending", value: pending },
        { name: "In Process", value: inProcess },
      ];
    },
    enabled: !!currentOrganization?.id,
  });

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Delivery Dashboard</h1>
            <p className="text-muted-foreground">Track and manage delivery status</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deliveryStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">All time deliveries</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Delivered</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{deliveryStats?.delivered || 0}</div>
              <p className="text-xs text-muted-foreground">
                ₹{deliveryStats?.deliveredValue?.toLocaleString("en-IN") || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{deliveryStats?.pending || 0}</div>
              <p className="text-xs text-muted-foreground">
                ₹{deliveryStats?.pendingValue?.toLocaleString("en-IN") || 0}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Process</CardTitle>
              <TrendingUp className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{deliveryStats?.inProcess || 0}</div>
              <p className="text-xs text-muted-foreground">Currently processing</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          <AnimatedChart
            title="Delivery Trend (Last 7 Days)"
            data={trendData || []}
            type="bar"
            dataKeys={[
              { key: "delivered", color: "#10b981", name: "Delivered" },
              { key: "pending", color: "#ef4444", name: "Pending" },
              { key: "inProcess", color: "#f59e0b", name: "In Process" }
            ]}
            height={300}
          />

          <AnimatedChart
            title="Status Distribution"
            data={statusData || []}
            type="area"
            dataKeys={[{ key: "value", color: "#3b82f6", name: "Count" }]}
            height={300}
          />
        </div>
      </div>
    </Layout>
  );
};

export default DeliveryDashboard;
