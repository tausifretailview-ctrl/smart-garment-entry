import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, CheckCircle2, TrendingUp, Search, Calendar as CalendarIcon } from "lucide-react";
import { AnimatedChart } from "@/components/dashboard/AnimatedChart";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { Layout } from "@/components/Layout";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DeliveryDashboard = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedInvoiceForStatus, setSelectedInvoiceForStatus] = useState<any>(null);
  const [newDeliveryStatus, setNewDeliveryStatus] = useState<string>("");
  const [statusDate, setStatusDate] = useState<Date>(new Date());
  const [statusNarration, setStatusNarration] = useState("");

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

  // Fetch filtered invoices based on selected status, date range, and search
  const { data: filteredInvoices } = useQuery({
    queryKey: ["filtered-invoices", currentOrganization?.id, selectedStatus, searchQuery, dateFrom, dateTo],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedStatus) return [];

      let query = supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("delivery_status", selectedStatus);

      // Apply date range filter
      if (dateFrom) {
        query = query.gte("sale_date", startOfDay(dateFrom).toISOString());
      }
      if (dateTo) {
        query = query.lte("sale_date", endOfDay(dateTo).toISOString());
      }

      // Apply search filter - search by invoice, customer name, phone, and address
      if (searchQuery) {
        query = query.or(`sale_number.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,customer_phone.ilike.%${searchQuery}%,customer_address.ilike.%${searchQuery}%`);
      }

      query = query.order("sale_date", { ascending: false });

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && !!selectedStatus,
  });

  // Mutation to update delivery status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ saleId, status, date, narration }: { saleId: string; status: string; date: Date; narration: string }) => {
      const { error: saleError } = await supabase
        .from("sales")
        .update({ delivery_status: status })
        .eq("id", saleId);

      if (saleError) throw saleError;

      const { error: trackingError } = await supabase
        .from("delivery_tracking")
        .insert({
          sale_id: saleId,
          organization_id: currentOrganization!.id,
          status,
          status_date: format(date, "yyyy-MM-dd"),
          narration: narration || null,
        });

      if (trackingError) throw trackingError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["filtered-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-stats"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-trend"] });
      queryClient.invalidateQueries({ queryKey: ["delivery-status-distribution"] });
      toast.success("Delivery status updated successfully");
      setShowStatusDialog(false);
      setSelectedInvoiceForStatus(null);
      setNewDeliveryStatus("");
      setStatusDate(new Date());
      setStatusNarration("");
    },
    onError: (error) => {
      console.error("Error updating delivery status:", error);
      toast.error("Failed to update delivery status");
    },
  });

  const openStatusDialog = (invoice: any) => {
    setSelectedInvoiceForStatus(invoice);
    setNewDeliveryStatus(invoice.delivery_status);
    setStatusDate(new Date());
    setStatusNarration("");
    setShowStatusDialog(true);
  };

  const handleUpdateDeliveryStatus = () => {
    if (!newDeliveryStatus) {
      toast.error("Please select a delivery status");
      return;
    }

    updateStatusMutation.mutate({
      saleId: selectedInvoiceForStatus.id,
      status: newDeliveryStatus,
      date: statusDate,
      narration: statusNarration,
    });
  };

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
              <div className="flex items-center justify-between">
                <CardTitle>
                  {getDeliveryLabel(selectedStatus)} Invoices ({filteredInvoices?.length || 0})
                </CardTitle>
                <div className="flex items-center gap-2">
                  {/* Search Input */}
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by invoice, customer, mobile, or area..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 w-80"
                    />
                  </div>
                  
                  {/* Date From */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-36 justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom ? format(dateFrom, "PP") : "From Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateFrom}
                        onSelect={setDateFrom}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Date To */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-36 justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTo ? format(dateTo, "PP") : "To Date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={dateTo}
                        onSelect={setDateTo}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* Clear Filters */}
                  {(searchQuery || dateFrom || dateTo) && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSearchQuery("");
                      setDateFrom(undefined);
                      setDateTo(undefined);
                    }}>
                      Clear
                    </Button>
                  )}
                </div>
              </div>
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
                        <Badge 
                          variant={getDeliveryBadgeVariant(invoice.delivery_status)}
                          className="cursor-pointer hover:opacity-80"
                          onClick={() => openStatusDialog(invoice)}
                        >
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

        {/* Status Update Dialog */}
        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Delivery Status</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Invoice Number</label>
                <p className="text-sm text-muted-foreground">{selectedInvoiceForStatus?.sale_number}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium">Delivery Status</label>
                <Select value={newDeliveryStatus} onValueChange={setNewDeliveryStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="in_process">In Process</SelectItem>
                    <SelectItem value="undelivered">Undelivered</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Status Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {statusDate ? format(statusDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={statusDate}
                      onSelect={(date) => date && setStatusDate(date)}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className="text-sm font-medium">Narration (Optional)</label>
                <Textarea
                  placeholder="Add notes about this status update..."
                  value={statusNarration}
                  onChange={(e) => setStatusNarration(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleUpdateDeliveryStatus} disabled={updateStatusMutation.isPending}>
                  {updateStatusMutation.isPending ? "Updating..." : "Update Status"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default DeliveryDashboard;
