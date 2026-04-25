import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { Search, MessageCircle, Settings2, IndianRupee, Clock, CheckCircle, AlertCircle, Calendar as CalendarIcon, Printer, Send, ChevronLeft, ChevronRight, Filter, Link2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useWhatsAppTemplates } from "@/hooks/useWhatsAppTemplates";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useReactToPrint } from "react-to-print";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";

interface Invoice {
  id: string;
  sale_number: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  sale_date: string;
  due_date: string | null;
  net_amount: number;
  payment_status: string;
  payment_date: string | null;
  payment_method: string;
  paid_amount?: number;
  [key: string]: any;
}

interface ColumnSettings {
  [key: string]: boolean;
  saleNumber: boolean;
  customer: boolean;
  saleDate: boolean;
  dueDate: boolean;
  netAmount: boolean;
  paidAmount: boolean;
  pendingAmount: boolean;
  status: boolean;
  whatsapp: boolean;
  recordPayment: boolean;
}

const defaultColumnSettings: ColumnSettings = {
  saleNumber: true,
  customer: true,
  saleDate: true,
  dueDate: true,
  netAmount: true,
  paidAmount: true,
  pendingAmount: true,
  status: true,
  whatsapp: true,
  recordPayment: true,
};

export default function PaymentsDashboard() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const { formatMessage } = useWhatsAppTemplates();
  const { sendWhatsApp } = useWhatsAppSend();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  
  // Payment recording dialog state
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<Date>(new Date());
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<Date | undefined>(undefined);
  const [transactionId, setTransactionId] = useState("");
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  
  // Payment link dialog state
  const [showPaymentLinkDialog, setShowPaymentLinkDialog] = useState(false);
  const [paymentLinkInvoice, setPaymentLinkInvoice] = useState<Invoice | null>(null);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<{id: string | null; name: string} | null>(null);

  const receiptRef = useRef<HTMLDivElement>(null);

  const { columnSettings, updateColumnSetting } = useDashboardColumnSettings(
    "payments_dashboard",
    defaultColumnSettings
  );

  // Fetch company settings for receipt branding (centralized, cached 5min)
  const { data: settings } = useSettings();

  const { data: invoices, isLoading, refetch } = useQuery<Invoice[]>({
    queryKey: ['payment-invoices', currentOrganization?.id, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];

      let query = supabase
        .from('sales')
        .select('id, sale_number, sale_date, customer_name, customer_id, customer_phone, customer_email, net_amount, paid_amount, cash_amount, payment_method, payment_status, payment_date, due_date, flat_discount_amount, flat_discount_percent, discount_amount, gross_amount, round_off, salesman, notes')
        .eq('organization_id', currentOrganization.id)
        .is('deleted_at', null)
        .order('sale_date', { ascending: false });

      // Apply status filter
      if (statusFilter === 'pending') {
        query = query.eq('payment_status', 'pending');
      } else if (statusFilter === 'partial') {
        query = query.eq('payment_status', 'partial');
      } else if (statusFilter === 'completed') {
        query = query.eq('payment_status', 'completed');
      }

      // Apply date filters - normalize to yyyy-MM-dd format for accurate comparison
      if (dateFrom) {
        const startDateStr = format(dateFrom, 'yyyy-MM-dd');
        query = query.gte('sale_date', startDateStr);
      }
      if (dateTo) {
        const endDateStr = format(dateTo, 'yyyy-MM-dd');
        query = query.lte('sale_date', endDateStr);
      }

      const { data: salesData, error } = await query;
      if (error) throw error;

      // Return sales with paid_amount already in the table
      // paid_amount includes cash_amount + card_amount + upi_amount from mixed payments
      return salesData || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Calculate summary statistics
  const summaryStats = {
    total: invoices?.length || 0,
    totalRevenue: invoices?.reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0) || 0,
    pendingAmount: invoices?.filter(inv => inv.payment_status !== 'completed')
      .reduce((sum, inv) => sum + (Number(inv.net_amount || 0) - Number(inv.paid_amount || 0)), 0) || 0,
    completedAmount: invoices?.filter(inv => inv.payment_status === 'completed')
      .reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0) || 0,
  };

  // Quick date filter handlers
  const setTodayFilter = () => {
    const today = new Date();
    setDateFrom(today);
    setDateTo(today);
  };

  const setMonthlyFilter = () => {
    const today = new Date();
    setDateFrom(startOfMonth(today));
    setDateTo(endOfMonth(today));
  };

  const setQuarterlyFilter = () => {
    const today = new Date();
    setDateFrom(startOfQuarter(today));
    setDateTo(endOfQuarter(today));
  };

  const setYearlyFilter = () => {
    const today = new Date();
    setDateFrom(startOfYear(today));
    setDateTo(endOfYear(today));
  };

  const clearDateFilter = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
  };

  // Filter invoices based on search
  const filteredInvoices = invoices?.filter(invoice => {
    const searchLower = searchQuery.toLowerCase();
    return (
      invoice.sale_number?.toLowerCase().includes(searchLower) ||
      invoice.customer_name?.toLowerCase().includes(searchLower) ||
      invoice.customer_phone?.toLowerCase().includes(searchLower) ||
      invoice.customer_email?.toLowerCase().includes(searchLower)
    );
  }) || [];

  // Pagination
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedInvoices = filteredInvoices.slice(startIndex, endIndex);

  const handleSendPaymentReminder = async (invoice: Invoice) => {
    if (!invoice.customer_phone) {
      toast({
        title: "No Phone Number",
        description: "Customer phone number is required to send payment reminder",
        variant: "destructive",
      });
      return;
    }

    const orgSlug = currentOrganization?.slug || localStorage.getItem("selectedOrgSlug") || '';
    const invoiceUrl = `${window.location.origin}/${orgSlug}/invoice/view/${invoice.id}`;
    const organizationName = currentOrganization?.name || '';

    let customerBalance = 0;
    if (invoice.customer_id) {
      try {
        const { data: customer } = await supabase
          .from('customers')
          .select('opening_balance')
          .eq('id', invoice.customer_id)
          .single();
        const openingBalance = customer?.opening_balance || 0;
        const { data: sales } = await supabase
          .from('sales')
          .select('net_amount, paid_amount')
          .eq('customer_id', invoice.customer_id)
          .eq('organization_id', currentOrganization?.id);
        const totalSales = sales?.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0) || 0;
        const totalPaid = sales?.reduce((sum: number, s: any) => sum + (s.paid_amount || 0), 0) || 0;
        customerBalance = openingBalance + totalSales - totalPaid;
      } catch (e) {
        customerBalance = Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0);
      }
    } else {
      customerBalance = Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0);
    }

    const reminderMessage = formatMessage('payment_reminder', {
      sale_number: invoice.sale_number,
      customer_name: invoice.customer_name,
      customer_phone: invoice.customer_phone,
      sale_date: invoice.sale_date,
      net_amount: invoice.net_amount,
      payment_status: invoice.payment_status,
      paid_amount: invoice.paid_amount || 0,
      due_date: invoice.due_date,
    }, undefined, customerBalance, { invoiceLink: invoiceUrl, organizationName });

    sendWhatsApp(invoice.customer_phone, reminderMessage);
  };

  const openPaymentDialog = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const pendingAmount = Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0);
    setPaymentAmount(pendingAmount.toFixed(2));
    setPaymentDate(new Date());
    setPaymentMethod("cash");
    setChequeNumber("");
    setChequeDate(undefined);
    setTransactionId("");
    setShowPaymentDialog(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedInvoice || !paymentAmount) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid payment amount",
        variant: "destructive",
      });
      return;
    }

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Payment amount must be greater than 0",
        variant: "destructive",
      });
      return;
    }

    const currentPaid = Number(selectedInvoice.paid_amount || 0);
    const netAmount = Number(selectedInvoice.net_amount || 0);
    const newPaidAmount = currentPaid + amount;

    if (newPaidAmount > netAmount) {
      toast({
        title: "Amount Exceeds Total",
        description: "Payment amount exceeds the invoice total",
        variant: "destructive",
      });
      return;
    }

    setIsRecordingPayment(true);

    try {
      // Determine new payment status
      let newStatus = 'partial';
      if (newPaidAmount >= netAmount) {
        newStatus = 'completed';
      }

      // Update sales record with new paid_amount and status
      const updateData: any = {
        payment_status: newStatus,
        paid_amount: newPaidAmount, // CRITICAL: Update paid_amount so balance calculations work correctly
      };
      
      if (newStatus === 'completed') {
        updateData.payment_date = format(paymentDate, 'yyyy-MM-dd');
        updateData.payment_method = paymentMethod;
      }

      const { error: updateError } = await supabase
        .from('sales')
        .update(updateData)
        .eq('id', selectedInvoice.id);

      if (updateError) throw updateError;

      // Generate voucher number
      const { data: voucherNumber, error: voucherError } = await supabase
        .rpc('generate_voucher_number', {
          p_type: 'receipt',
          p_date: format(paymentDate, 'yyyy-MM-dd')
        });

      if (voucherError) throw voucherError;

      // Build payment details for description
      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) {
        paymentDetails = ` | Cheque No: ${chequeNumber}`;
        if (chequeDate) {
          paymentDetails += `, Date: ${format(chequeDate, 'dd/MM/yyyy')}`;
        }
      } else if (paymentMethod === 'other' && transactionId) {
        paymentDetails = ` | Transaction ID: ${transactionId}`;
      }

      // Create voucher entry
      const { error: voucherEntryError } = await supabase
        .from('voucher_entries')
        .insert({
          organization_id: currentOrganization?.id,
          voucher_type: 'receipt',
          voucher_number: voucherNumber,
          voucher_date: format(paymentDate, 'yyyy-MM-dd'),
          reference_type: 'customer',
          reference_id: selectedInvoice.id,
          total_amount: amount,
          description: `Payment received from ${selectedInvoice.customer_name} for invoice ${selectedInvoice.sale_number}${paymentDetails}`,
        });

      if (voucherEntryError) throw voucherEntryError;

      // Customer Account Statement — credit ledger entry
      if (currentOrganization?.id && selectedInvoice.customer_id) {
        insertLedgerCredit({
          organizationId: currentOrganization.id,
          customerId: selectedInvoice.customer_id,
          voucherType: 'RECEIPT',
          voucherNo: voucherNumber,
          particulars: `Receipt for ${selectedInvoice.sale_number}`,
          transactionDate: format(paymentDate, 'yyyy-MM-dd'),
          amount: amount,
        });
      }

      toast({
        title: "Payment Recorded",
        description: `Payment of ₹${amount.toFixed(2)} recorded successfully`,
      });

      setShowPaymentDialog(false);
      
      // Show receipt options
      setShowReceiptDialog(true);
      setReceiptData({
        voucherNumber,
        voucherDate: format(paymentDate, 'yyyy-MM-dd'),
        customerName: selectedInvoice.customer_name,
        customerPhone: selectedInvoice.customer_phone,
        customerAddress: selectedInvoice.customer_address,
        invoiceNumber: selectedInvoice.sale_number,
        invoiceDate: selectedInvoice.sale_date,
        invoiceAmount: netAmount,
        paidAmount: amount,
        paymentMethod: paymentMethod,
        previousBalance: netAmount - currentPaid,
        currentBalance: netAmount - newPaidAmount,
      });

      refetch();
    } catch (error: any) {
      console.error('Error recording payment:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${receiptData?.voucherNumber}`,
    onAfterPrint: () => {
      toast({
        title: "Receipt Printed",
        description: "Payment receipt has been sent to the printer",
      });
    },
  });

  const handleSendReceiptWhatsApp = () => {
    if (!receiptData || !receiptData.customerPhone) return;

    const message = `Dear ${receiptData.customerName},

Thank you for your payment!

Receipt No: ${receiptData.voucherNumber}
Date: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd MMM yyyy') : '-'}
Amount Paid: ₹${receiptData.paidAmount.toLocaleString('en-IN')}
Payment Method: ${receiptData.paymentMethod.toUpperCase()}

Invoice: ${receiptData.invoiceNumber}
Current Balance: ₹${receiptData.currentBalance.toLocaleString('en-IN')}

Thank you for your business!`;

    const phoneNumber = receiptData.customerPhone.replace(/\D/g, '');
    let formattedPhone = phoneNumber;
    if (phoneNumber.length === 10) {
      formattedPhone = `91${phoneNumber}`;
    } else if (!phoneNumber.startsWith('91')) {
      formattedPhone = `91${phoneNumber}`;
    }

    const encodedMessage = encodeURIComponent(message).replace(/%20/g, '+');
    const whatsappUrl = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;

    navigator.clipboard.writeText(message);
    window.location.href = whatsappUrl;

    toast({
      title: "Receipt Sent",
      description: "Message copied to clipboard! Paste with Ctrl+V if it doesn't auto-fill",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="min-w-[70px] justify-center bg-green-500 hover:bg-green-600 text-white">Paid</Badge>;
      case 'partial':
        return <Badge className="min-w-[70px] justify-center bg-orange-400 hover:bg-orange-500 text-white">Partial</Badge>;
      case 'pending':
        return <Badge className="min-w-[70px] justify-center bg-red-500 hover:bg-red-600 text-white">Not Paid</Badge>;
      default:
        return <Badge variant="outline" className="min-w-[70px] justify-center">{status}</Badge>;
    }
  };

  return (
    <div className="w-full px-6 py-6 space-y-6">
      
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Payments Dashboard</h1>
            <p className="text-muted-foreground">Track and manage invoice payments</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
              <IndianRupee className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summaryStats.total}</div>
              <p className="text-xs text-muted-foreground">
                Total Revenue: ₹{summaryStats.totalRevenue.toFixed(2)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ₹{summaryStats.completedAmount.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Received payments</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                ₹{summaryStats.pendingAmount.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Outstanding amount</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Collection Rate</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {summaryStats.totalRevenue > 0 
                  ? ((summaryStats.completedAmount / summaryStats.totalRevenue) * 100).toFixed(1)
                  : 0}%
              </div>
              <p className="text-xs text-muted-foreground">Payment collection rate</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Quick Date Filters */}
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant={dateFrom && dateTo && format(dateFrom, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') && format(dateTo, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd') ? "default" : "outline"} 
                  size="sm"
                  onClick={setTodayFilter}
                >
                  Today
                </Button>
                <Button 
                  variant={dateFrom && dateTo && format(dateFrom, 'yyyy-MM-dd') === format(startOfMonth(new Date()), 'yyyy-MM-dd') && format(dateTo, 'yyyy-MM-dd') === format(endOfMonth(new Date()), 'yyyy-MM-dd') ? "default" : "outline"}
                  size="sm"
                  onClick={setMonthlyFilter}
                >
                  Monthly
                </Button>
                <Button 
                  variant={dateFrom && dateTo && format(dateFrom, 'yyyy-MM-dd') === format(startOfQuarter(new Date()), 'yyyy-MM-dd') && format(dateTo, 'yyyy-MM-dd') === format(endOfQuarter(new Date()), 'yyyy-MM-dd') ? "default" : "outline"}
                  size="sm"
                  onClick={setQuarterlyFilter}
                >
                  Quarterly
                </Button>
                <Button 
                  variant={dateFrom && dateTo && format(dateFrom, 'yyyy-MM-dd') === format(startOfYear(new Date()), 'yyyy-MM-dd') && format(dateTo, 'yyyy-MM-dd') === format(endOfYear(new Date()), 'yyyy-MM-dd') ? "default" : "outline"}
                  size="sm"
                  onClick={setYearlyFilter}
                >
                  Year
                </Button>
                {(dateFrom || dateTo) && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={clearDateFilter}
                  >
                    Clear Dates
                  </Button>
                )}
              </div>

              {/* Search and Filters */}
              <div className="grid gap-4 md:grid-cols-5">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by invoice, customer, phone..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="Payment Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "dd MMM yyyy") : "From Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar 
                      mode="single" 
                      selected={dateFrom} 
                      onSelect={setDateFrom}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "dd MMM yyyy") : "To Date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar 
                      mode="single" 
                      selected={dateTo} 
                      onSelect={setDateTo}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Settings2 className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80">
                    <div className="space-y-4">
                      <h4 className="font-medium">Column Visibility</h4>
                      {Object.entries(columnSettings).map(([key, value]) => (
                        <div key={key} className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id={key}
                            checked={value}
                            onChange={(e) => updateColumnSetting(key, e.target.checked)}
                            className="h-4 w-4"
                          />
                          <Label htmlFor={key} className="cursor-pointer capitalize">
                            {key.replace(/([A-Z])/g, ' $1').trim()}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payments Table */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Payments ({filteredInvoices.length})</CardTitle>
            <CardDescription>Showing {paginatedInvoices.length} of {filteredInvoices.length} invoices</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columnSettings.saleNumber && <TableHead>Invoice No.</TableHead>}
                    {columnSettings.customer && <TableHead>Customer</TableHead>}
                    {columnSettings.saleDate && <TableHead>Sale Date</TableHead>}
                    {columnSettings.dueDate && <TableHead>Due Date</TableHead>}
                    {columnSettings.netAmount && <TableHead>Total Amount</TableHead>}
                    {columnSettings.paidAmount && <TableHead>Paid Amount</TableHead>}
                    {columnSettings.pendingAmount && <TableHead>Pending</TableHead>}
                    {columnSettings.status && <TableHead>Status</TableHead>}
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        Loading payments...
                      </TableCell>
                    </TableRow>
                  ) : paginatedInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        No invoices found
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedInvoices.map((invoice) => {
                      const pendingAmount = Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0);
                      
                      return (
                        <TableRow key={invoice.id}>
                          {columnSettings.saleNumber && (
                            <TableCell className="font-medium">{invoice.sale_number}</TableCell>
                          )}
                          {columnSettings.customer && (
                            <TableCell>
                              <div>
                                <button
                                  className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-medium text-left"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedCustomerForHistory({ id: invoice.customer_id, name: invoice.customer_name });
                                    setShowCustomerHistory(true);
                                  }}
                                >
                                  {invoice.customer_name}
                                </button>
                                {invoice.customer_phone && (
                                  <div className="text-sm text-muted-foreground">{invoice.customer_phone}</div>
                                )}
                              </div>
                            </TableCell>
                          )}
                          {columnSettings.saleDate && (
                            <TableCell>{invoice.sale_date ? format(new Date(invoice.sale_date), 'dd MMM yyyy') : '-'}</TableCell>
                          )}
                          {columnSettings.dueDate && (
                            <TableCell>
                              {invoice.due_date ? format(new Date(invoice.due_date), 'dd MMM yyyy') : '-'}
                            </TableCell>
                          )}
                          {columnSettings.netAmount && (
                            <TableCell className="font-medium">₹{Number(invoice.net_amount).toFixed(2)}</TableCell>
                          )}
                          {columnSettings.paidAmount && (
                            <TableCell className="text-green-600">
                              ₹{Number(invoice.paid_amount || 0).toFixed(2)}
                            </TableCell>
                          )}
                          {columnSettings.pendingAmount && (
                            <TableCell className={pendingAmount > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}>
                              ₹{pendingAmount.toFixed(2)}
                            </TableCell>
                          )}
                          {columnSettings.status && (
                            <TableCell>{getStatusBadge(invoice.payment_status)}</TableCell>
                          )}
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {columnSettings.whatsapp && invoice.payment_status !== 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleSendPaymentReminder(invoice)}
                                  title="Send Payment Reminder"
                                  disabled={!invoice.customer_phone}
                                >
                                  <MessageCircle className="h-4 w-4 text-orange-600" />
                                </Button>
                              )}
                              {invoice.payment_status !== 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setPaymentLinkInvoice(invoice);
                                    setShowPaymentLinkDialog(true);
                                  }}
                                  title="Send Payment Link"
                                  disabled={!invoice.customer_phone}
                                >
                                  <Link2 className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                              {columnSettings.recordPayment && invoice.payment_status !== 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openPaymentDialog(invoice)}
                                  title="Record Payment"
                                >
                                  <IndianRupee className="h-4 w-4 mr-1" />
                                  Record
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Items per page:</span>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                    setItemsPerPage(parseInt(value));
                    setCurrentPage(1);
                  }}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Customer Payment</DialogTitle>
            <DialogDescription>
              Record payment for invoice {selectedInvoice?.sale_number}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <div className="text-sm font-medium">{selectedInvoice?.customer_name}</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Amount</Label>
                <div className="text-sm">₹{Number(selectedInvoice?.net_amount || 0).toFixed(2)}</div>
              </div>
              <div className="space-y-2">
                <Label>Already Paid</Label>
                <div className="text-sm text-green-600">₹{Number(selectedInvoice?.paid_amount || 0).toFixed(2)}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentAmount">Payment Amount *</Label>
              <Input
                id="paymentAmount"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="Enter payment amount"
              />
            </div>

            <div className="space-y-2">
              <Label>Payment Date *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(paymentDate, "dd MMM yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={paymentDate} onSelect={(date) => date && setPaymentDate(date)} />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method *</Label>
              <Select value={paymentMethod} onValueChange={(value) => {
                setPaymentMethod(value);
                setChequeNumber("");
                setChequeDate(undefined);
                setTransactionId("");
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Cheque fields */}
            {paymentMethod === 'cheque' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cheque Number</Label>
                  <Input
                    placeholder="Enter cheque number"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cheque Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {chequeDate ? format(chequeDate, "dd/MM/yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={chequeDate}
                        onSelect={setChequeDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Other payment - Transaction ID field */}
            {paymentMethod === 'other' && (
              <div className="space-y-2">
                <Label>Transaction ID</Label>
                <Input
                  placeholder="Enter transaction ID"
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentDialog(false)} disabled={isRecordingPayment}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={isRecordingPayment}>
              {isRecordingPayment ? "Recording..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Payment Receipt</DialogTitle>
            <DialogDescription>Print or send this receipt to the customer</DialogDescription>
          </DialogHeader>
          
          <div className="hidden">
            <PaymentReceipt
              ref={receiptRef}
              receiptData={receiptData}
              companyDetails={{
                businessName: settings?.business_name,
                address: settings?.address,
                mobileNumber: settings?.mobile_number,
                emailId: settings?.email_id,
                gstNumber: settings?.gst_number,
                logoUrl: (settings?.sale_settings as any)?.logoUrl,
                upiId: (settings?.sale_settings as any)?.upiId,
              }}
              receiptSettings={{
                showCompanyLogo: true,
                showQrCode: !!(settings?.sale_settings as any)?.upiId,
                showSignature: true,
                signatureLabel: "Authorized Signature"
              }}
            />
          </div>

          <div className="border rounded-lg p-4 bg-gray-50">
            <PaymentReceipt
              receiptData={receiptData}
              companyDetails={{
                businessName: settings?.business_name,
                address: settings?.address,
                mobileNumber: settings?.mobile_number,
                emailId: settings?.email_id,
                gstNumber: settings?.gst_number,
                logoUrl: (settings?.sale_settings as any)?.logoUrl,
                upiId: (settings?.sale_settings as any)?.upiId,
              }}
              receiptSettings={{
                showCompanyLogo: true,
                showQrCode: !!(settings?.sale_settings as any)?.upiId,
                showSignature: true,
                signatureLabel: "Authorized Signature"
              }}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowReceiptDialog(false)}>
              Close
            </Button>
            <Button onClick={handlePrintReceipt} className="gap-2">
              <Printer className="h-4 w-4" />
              Print Receipt
            </Button>
            {receiptData?.customerPhone && (
              <Button onClick={handleSendReceiptWhatsApp} className="gap-2 bg-green-600 hover:bg-green-700">
                <Send className="h-4 w-4" />
                Send via WhatsApp
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Link Dialog */}
      {paymentLinkInvoice && (
        <PaymentLinkDialog
          open={showPaymentLinkDialog}
          onOpenChange={setShowPaymentLinkDialog}
          customerName={paymentLinkInvoice.customer_name}
          customerPhone={paymentLinkInvoice.customer_phone}
          amount={Number(paymentLinkInvoice.net_amount || 0) - Number(paymentLinkInvoice.paid_amount || 0)}
          invoiceNumber={paymentLinkInvoice.sale_number}
        />
      )}

      <CustomerHistoryDialog
        open={showCustomerHistory}
        onOpenChange={setShowCustomerHistory}
        customerId={selectedCustomerForHistory?.id || null}
        customerName={selectedCustomerForHistory?.name || ''}
        organizationId={currentOrganization?.id || ''}
      />
    </div>
  );
}
