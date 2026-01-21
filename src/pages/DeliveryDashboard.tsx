import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, CheckCircle2, TrendingUp, Search, Calendar as CalendarIcon, MessageCircle, Download } from "lucide-react";
import { AnimatedChart } from "@/components/dashboard/AnimatedChart";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { useState, useMemo, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";

const DeliveryDashboard = () => {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { formatMessage } = useWhatsAppTemplates();
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedInvoiceForStatus, setSelectedInvoiceForStatus] = useState<any>(null);
  const [newDeliveryStatus, setNewDeliveryStatus] = useState<string>("");
  const [statusDate, setStatusDate] = useState<Date>(new Date());
  const [statusNarration, setStatusNarration] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<string>>(new Set());

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

  // Fetch filtered invoices based on selected status, date range, search, and payment status
  const { data: filteredInvoices } = useQuery({
    queryKey: ["filtered-invoices", currentOrganization?.id, selectedStatus, searchQuery, dateFrom, dateTo, paymentStatusFilter],
    queryFn: async () => {
      if (!currentOrganization?.id || !selectedStatus) return [];

      let query = supabase
        .from("sales")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .eq("delivery_status", selectedStatus);

      // Apply payment status filter
      if (paymentStatusFilter !== "all") {
        query = query.eq("payment_status", paymentStatusFilter);
      }

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

  const sendWhatsAppMessage = (invoice: any) => {
    const phone = invoice.customer_phone?.replace(/\D/g, "");
    if (!phone) {
      toast.error("Customer phone number not available");
      return;
    }

    const deliveryStatusText = getDeliveryLabel(invoice.delivery_status);
    
    // Use template if available
    const templateType = `delivery_${invoice.delivery_status}`;
    const message = formatMessage(templateType, {
      sale_number: invoice.sale_number,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      sale_date: invoice.sale_date,
      net_amount: invoice.net_amount,
      payment_status: invoice.payment_status,
      delivery_status: invoice.delivery_status,
    });

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
    
    // Copy to clipboard as fallback with improved UX
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    
    navigator.clipboard.writeText(message).then(() => {
      toast.success(`✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill`, { duration: 5000 });
    }).catch(() => {
      toast.warning("Couldn't copy to clipboard automatically");
    });
    
    setTimeout(() => {
      window.location.href = whatsappUrl;
    }, 300);
  };

  // Selection handlers
  const isAllSelected = useMemo(() => {
    if (!filteredInvoices || filteredInvoices.length === 0) return false;
    return filteredInvoices.every((inv) => selectedInvoiceIds.has(inv.id));
  }, [filteredInvoices, selectedInvoiceIds]);

  const handleSelectAll = useCallback(() => {
    if (!filteredInvoices) return;
    if (isAllSelected) {
      setSelectedInvoiceIds(new Set());
    } else {
      setSelectedInvoiceIds(new Set(filteredInvoices.map((inv) => inv.id)));
    }
  }, [filteredInvoices, isAllSelected]);

  const handleSelectRow = useCallback((invoiceId: string) => {
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) {
        next.delete(invoiceId);
      } else {
        next.add(invoiceId);
      }
      return next;
    });
  }, []);

  const exportToExcel = () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      toast.error("No data to export");
      return;
    }

    // Determine which invoices to export
    const invoicesToExport = selectedInvoiceIds.size > 0
      ? filteredInvoices.filter((inv) => selectedInvoiceIds.has(inv.id))
      : filteredInvoices;

    if (invoicesToExport.length === 0) {
      toast.error("No invoices selected for export");
      return;
    }

    // Get organization settings for header info
    const settings = currentOrganization?.settings as any;
    const businessName = settings?.business_name || currentOrganization?.name || "";
    const businessPhone = settings?.business_phone || "";
    
    // Create header row with date and business info
    const headerDate = format(new Date(), "do MMMM yyyy");
    const headerText = `${headerDate} ${businessName}`;
    
    // Column headers
    const headers = ["Sr No", "Name", "Contact", "Address", "Order ID", "Amount", "Pending", "Sign", "Remarks"];
    
    // Prepare data rows
    const dataRows = invoicesToExport.map((invoice, index) => {
      const pendingAmount = invoice.payment_status === "completed" 
        ? 0 
        : Number(invoice.net_amount) - Number(invoice.paid_amount || 0);
      
      return [
        index + 1,
        invoice.customer_name || "",
        invoice.customer_phone || "",
        invoice.customer_address || "",
        invoice.sale_number || "",
        Number(invoice.net_amount) || 0,
        pendingAmount,
        "",
        ""
      ];
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Build worksheet data as array of arrays
    const wsData = [
      [headerText], // Header row (will be merged)
      headers,      // Column headers row
      ...dataRows   // Data rows
    ];
    
    // Create worksheet from array
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set column widths
    ws["!cols"] = [
      { wch: 6 },   // Sr No
      { wch: 20 },  // Name
      { wch: 15 },  // Contact
      { wch: 50 },  // Address
      { wch: 20 },  // Order ID
      { wch: 12 },  // Amount
      { wch: 12 },  // Pending
      { wch: 10 },  // Sign
      { wch: 15 }   // Remarks
    ];
    
    // Merge header cells (row 0, columns A to I)
    ws["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }
    ];

    // Set row heights (optional, for better readability)
    ws["!rows"] = [
      { hpt: 25 }, // Header row height
      { hpt: 20 }, // Column headers row height
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, "Delivery Report");
    
    // Generate filename with date
    const fileName = `Delivery_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
    
    // Export with bookType xlsx for proper table format
    XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
    toast.success(`Exported ${invoicesToExport.length} invoice(s) successfully!`);
  };

  return (
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

                  {/* Payment Status Filter */}
                  <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Payment Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payments</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Clear Filters */}
                  {(searchQuery || dateFrom || dateTo || paymentStatusFilter !== "all") && (
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSearchQuery("");
                      setDateFrom(undefined);
                      setDateTo(undefined);
                      setPaymentStatusFilter("all");
                    }}>
                      Clear
                    </Button>
                  )}

                  {/* Export to Excel */}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={exportToExcel}
                    disabled={!filteredInvoices || filteredInvoices.length === 0}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Export Excel {selectedInvoiceIds.size > 0 && `(${selectedInvoiceIds.size})`}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Delivery Status</TableHead>
                    <TableHead className="text-center">WhatsApp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices?.map((invoice) => (
                    <TableRow key={invoice.id} data-state={selectedInvoiceIds.has(invoice.id) ? "selected" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={selectedInvoiceIds.has(invoice.id)}
                          onCheckedChange={() => handleSelectRow(invoice.id)}
                          aria-label={`Select ${invoice.sale_number}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{invoice.sale_number}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{invoice.customer_name}</span>
                          {invoice.customer_phone && (
                            <span className="text-xs text-muted-foreground">{invoice.customer_phone}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{format(new Date(invoice.sale_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>₹{Number(invoice.net_amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant={invoice.payment_status === "completed" ? "default" : invoice.payment_status === "pending" ? "destructive" : "secondary"}>
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
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => sendWhatsAppMessage(invoice)}
                          disabled={!invoice.customer_phone}
                          className="h-8 w-8 p-0"
                        >
                          <MessageCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!filteredInvoices || filteredInvoices.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
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
  );
};

export default DeliveryDashboard;
