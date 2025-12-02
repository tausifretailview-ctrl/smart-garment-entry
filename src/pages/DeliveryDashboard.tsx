import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, CheckCircle2, TrendingUp } from "lucide-react";
import { AnimatedChart } from "@/components/dashboard/AnimatedChart";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Layout } from "@/components/Layout";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const DeliveryDashboard = () => {
  const { currentOrganization } = useOrganization();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

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

  // Fetch filtered invoices based on selected status
  const { data: filteredInvoices } = useQuery({
    queryKey: ["filtered-invoices", currentOrganization?.id, selectedStatus],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedStatus) return [];

      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("delivery_status", selectedStatus)
        .order("sale_date", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && !!selectedStatus,
  });

  const getDeliveryBadgeVariant = (status: string) => {
    switch (status) {
      case "delivered": return "default";
      case "in_process": return "secondary";
      case "undelivered": return "destructive";
      default: return "outline";
    }
  };

  const getDeliveryLabel = (status: string) => {
    switch (status) {
      case "delivered": return "Delivered";
      case "in_process": return "In Process";
      case "undelivered": return "Undelivered";
      default: return status;
    }
  };

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
          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedStatus(null)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{deliveryStats?.total || 0}</div>
              <p className="text-xs text-muted-foreground">All time deliveries</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedStatus("delivered")}
          >
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

          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedStatus("undelivered")}
          >
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

          <Card 
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setSelectedStatus("in_process")}
          >
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

        {/* Filtered Invoices Table */}
        {selectedStatus && (
          <Card>
            <CardHeader>
              <CardTitle>
                {getDeliveryLabel(selectedStatus)} Invoices ({filteredInvoices?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices?.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.sale_number}</TableCell>
                      <TableCell>{invoice.customer_name}</TableCell>
                      <TableCell>{format(new Date(invoice.sale_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>₹{Number(invoice.net_amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant={invoice.payment_status === "completed" ? "default" : "secondary"}>
                          {invoice.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getDeliveryBadgeVariant(invoice.delivery_status)}>
                          {getDeliveryLabel(invoice.delivery_status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!filteredInvoices || filteredInvoices.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No invoices found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

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
