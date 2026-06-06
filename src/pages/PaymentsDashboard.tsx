import { useState, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";
import { useSettings } from "@/hooks/useSettings";
import { useOrganization } from "@/contexts/OrganizationContext";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import {
  Search,
  MessageCircle,
  Settings2,
  IndianRupee,
  Clock,
  CheckCircle,
  AlertCircle,
  Calendar as CalendarIcon,
  Printer,
  Send,
  ChevronLeft,
  ChevronRight,
  Link2,
  Wallet,
  BookOpen,
  TrendingUp,
  Receipt,
  Building2,
  X,
  type LucideIcon,
} from "lucide-react";
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
import { useDashboardFilterPersistence } from "@/hooks/useDashboardFilterPersistence";
import { restoreDashboardFilters } from "@/lib/dashboardFilterPersistence";
import { useDashboardColumnSettings } from "@/hooks/useDashboardColumnSettings";
import { PaymentLinkDialog } from "@/components/PaymentLinkDialog";
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import { whatsappPaymentReceiptDiscountLines } from "@/utils/paymentReceiptWhatsApp";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileStatStrip } from "@/components/mobile/MobileStatStrip";
import { MobileListCard, MobileListCardSkeleton } from "@/components/mobile/MobileListCard";
import { useOrganizationCustomerAccountTotals } from "@/hooks/useOrganizationCustomerAccountTotals";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import {
  fetchCustomerFinancialSnapshot,
  formatSnapshotInr,
  invalidateCustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import {
  accountsHistoryFooterClass,
  accountsHistorySearchInputClass,
  accountsHistoryTableClass,
  accountsHistoryTableWrapClass,
  accountsHistoryThClass,
} from "@/components/accounts/accountsHistoryUi";

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

function MetricCard({
  label,
  value,
  sub,
  gradient,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  sub: string;
  gradient: string;
  icon: LucideIcon;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "border-0 shadow-md rounded-xl min-w-0",
        gradient,
        onClick && "cursor-pointer hover:shadow-lg transition-all",
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-2 px-2.5">
        <CardDescription className="text-xs font-medium text-white/80 leading-tight">{label}</CardDescription>
        <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center shrink-0">
          <Icon className="h-3.5 w-3.5 text-white" />
        </div>
      </CardHeader>
      <CardContent className="px-2.5 pb-2 pt-0">
        <div className="text-lg xl:text-xl font-black text-white tabular-nums leading-tight truncate">{value}</div>
        <p className="text-xs text-white/65 mt-0.5 line-clamp-2">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default function PaymentsDashboard() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const customerIdParam = searchParams.get("customerId");
  const queryClient = useQueryClient();
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

  const paymentsFilterSnapshot = useMemo(
    () => ({
      searchQuery,
      statusFilter,
      dateFrom,
      dateTo,
      currentPage,
      itemsPerPage,
    }),
    [searchQuery, statusFilter, dateFrom, dateTo, currentPage, itemsPerPage],
  );

  useDashboardFilterPersistence(
    "payments-dashboard",
    currentOrganization?.id,
    paymentsFilterSnapshot,
    (saved) => {
      restoreDashboardFilters(saved, {
        strings: [
          ["searchQuery", setSearchQuery],
          ["statusFilter", setStatusFilter],
        ],
        optionalDates: [
          ["dateFrom", setDateFrom],
          ["dateTo", setDateTo],
        ],
        numbers: [
          ["currentPage", setCurrentPage],
          ["itemsPerPage", setItemsPerPage],
        ],
      });
    },
  );
  
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

  const { data: settings } = useSettings();

  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const { totals: accountTotals, isLoading: accountTotalsLoading } = useOrganizationCustomerAccountTotals(
    currentOrganization?.id,
  );

  const { snapshot: filteredCustomerSnapshot } = useCustomerFinancialSnapshot(
    customerIdParam,
    currentOrganization?.id,
  );

  const { data: accountsMetrics } = useQuery({
    queryKey: ["accounts-dashboard-metrics", currentOrganization?.id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_accounts_dashboard_metrics", {
        p_org_id: currentOrganization!.id,
        p_month_start: monthStart,
        p_month_end: monthEnd,
      });
      if (error) throw error;
      return data as { totalPayables?: number; totalReceivables?: number };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

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

  const summaryStats = useMemo(() => {
    const rows = invoices || [];
    const totalRevenue = rows.reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0);
    const pendingAmount = rows
      .filter((inv) => inv.payment_status !== "completed")
      .reduce((sum, inv) => sum + Math.max(0, Number(inv.net_amount || 0) - Number(inv.paid_amount || 0)), 0);
    const completedAmount = rows
      .filter((inv) => inv.payment_status === "completed")
      .reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0);
    return {
      total: rows.length,
      totalRevenue,
      pendingAmount,
      completedAmount,
      collectionRate: totalRevenue > 0 ? (completedAmount / totalRevenue) * 100 : 0,
    };
  }, [invoices]);

  const periodLabel =
    dateFrom || dateTo
      ? `${dateFrom ? format(dateFrom, "dd MMM yyyy") : "…"} – ${dateTo ? format(dateTo, "dd MMM yyyy") : "…"}`
      : "All dates in list";

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

  const filteredInvoices = useMemo(() => {
    const searchLower = searchQuery.toLowerCase();
    return (invoices || []).filter((invoice) => {
      if (customerIdParam && invoice.customer_id !== customerIdParam) return false;
      if (!searchLower) return true;
      return (
        invoice.sale_number?.toLowerCase().includes(searchLower) ||
        invoice.customer_name?.toLowerCase().includes(searchLower) ||
        invoice.customer_phone?.toLowerCase().includes(searchLower) ||
        invoice.customer_email?.toLowerCase().includes(searchLower)
      );
    });
  }, [invoices, searchQuery, customerIdParam]);

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

    let customerBalance = Math.max(0, Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0));
    if (invoice.customer_id && currentOrganization?.id) {
      try {
        const snap = await fetchCustomerFinancialSnapshot(
          supabase,
          currentOrganization.id,
          invoice.customer_id,
        );
        customerBalance = snap.outstandingDr;
      } catch {
        /* keep invoice pending as fallback */
      }
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

      if (currentOrganization?.id) {
        invalidateCustomerFinancialSnapshot(queryClient, currentOrganization.id, selectedInvoice.customer_id);
        queryClient.invalidateQueries({ queryKey: ["payment-invoices"] });
        queryClient.invalidateQueries({ queryKey: ["accounts-dashboard-metrics", currentOrganization.id] });
      }
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

    const fmtPaid = (n: number) => n.toLocaleString("en-IN");
    const disc = whatsappPaymentReceiptDiscountLines(receiptData.discountAmount, receiptData.discountReason, fmtPaid);
    const message = `Dear ${receiptData.customerName},

Thank you for your payment!

Receipt No: ${receiptData.voucherNumber}
Date: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd MMM yyyy') : '-'}
Amount Paid: ₹${fmtPaid(receiptData.paidAmount)}${disc}
Payment Method: ${receiptData.paymentMethod.toUpperCase()}

Invoice: ${receiptData.invoiceNumber}
Current Balance: ₹${fmtPaid(receiptData.currentBalance)}

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

  const fmtShort = (n: number) =>
    n >= 100000 ? `₹${(n / 100000).toFixed(1)}L` : `₹${Math.round(n).toLocaleString("en-IN")}`;

  const dashboardDialogs = (
    <>
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
    </>
  );

  if (isMobile) {
    const statusChip = (v: string, label: string) => (
      <button
        key={v}
        type="button"
        onClick={() => { setStatusFilter(v); setCurrentPage(1); }}
        className={cn(
          "flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all touch-manipulation",
          statusFilter === v ? "bg-foreground text-background border-transparent" : "bg-card text-muted-foreground border-border"
        )}
      >
        {label}
      </button>
    );

    return (
      <>
        <div className="flex flex-col min-h-screen bg-muted/30 pb-8">
          <MobilePageHeader
            title="Payments"
            subtitle={`${filteredInvoices.length} invoices`}
          />

          <div className="px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search invoice, customer, phone..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-9 h-10 bg-card border-border/60 rounded-xl text-sm"
              />
            </div>
          </div>

          <MobileStatStrip
            stats={[
              { label: "Revenue", value: fmtShort(summaryStats.totalRevenue), color: "text-blue-600", bg: "bg-blue-50" },
              { label: "Collected", value: fmtShort(summaryStats.completedAmount), color: "text-emerald-600", bg: "bg-emerald-50" },
              { label: "Inv. Due", value: fmtShort(summaryStats.pendingAmount), color: "text-rose-600", bg: "bg-rose-50" },
              {
                label: "Cust. Due",
                value: accountTotalsLoading ? "…" : fmtShort(accountTotals.totalOutstandingDr),
                color: "text-orange-600",
                bg: "bg-orange-50",
              },
              {
                label: "Advance",
                value: accountTotalsLoading ? "…" : fmtShort(accountTotals.totalAdvanceAvailable),
                color: "text-teal-600",
                bg: "bg-teal-50",
              },
              {
                label: "CN",
                value: accountTotalsLoading ? "…" : fmtShort(accountTotals.totalCnAvailable),
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
            ]}
          />

          <div className="flex gap-2 px-4 py-2 overflow-x-auto no-scrollbar">
            {statusChip("all", "All")}
            {statusChip("pending", "Pending")}
            {statusChip("partial", "Partial")}
            {statusChip("completed", "Paid")}
          </div>

          <div className="flex-1 px-4 space-y-2.5 pb-4">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <MobileListCardSkeleton key={i} />)
            ) : paginatedInvoices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <IndianRupee className="h-12 w-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">No invoices found</p>
              </div>
            ) : (
              paginatedInvoices.map((invoice) => {
                const pendingAmount = Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0);
                return (
                  <MobileListCard
                    key={invoice.id}
                    title={invoice.sale_number}
                    subtitle={
                      <>
                        <button
                          type="button"
                          className="text-primary font-medium"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomerForHistory({ id: invoice.customer_id, name: invoice.customer_name });
                            setShowCustomerHistory(true);
                          }}
                        >
                          {invoice.customer_name}
                        </button>
                        {invoice.customer_phone ? ` · ${invoice.customer_phone}` : null}
                      </>
                    }
                    badge={getStatusBadge(invoice.payment_status)}
                    amount={
                      <div>
                        <div className="text-sm font-bold tabular-nums">₹{Number(invoice.net_amount).toLocaleString("en-IN")}</div>
                        {pendingAmount > 0 ? (
                          <div className="text-xs text-red-600 font-medium tabular-nums">
                            Due ₹{pendingAmount.toLocaleString("en-IN")}
                          </div>
                        ) : null}
                      </div>
                    }
                    meta={
                      invoice.sale_date ? (
                        <span>Sale {format(new Date(invoice.sale_date), "dd MMM yyyy")}</span>
                      ) : null
                    }
                    footer={
                      <>
                        {columnSettings.whatsapp && invoice.payment_status !== "completed" && (
                          <button
                            type="button"
                            disabled={!invoice.customer_phone}
                            onClick={() => handleSendPaymentReminder(invoice)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-orange-600 active:bg-orange-50 disabled:opacity-40 touch-manipulation"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Remind
                          </button>
                        )}
                        {invoice.payment_status !== "completed" && (
                          <button
                            type="button"
                            disabled={!invoice.customer_phone}
                            onClick={() => {
                              setPaymentLinkInvoice(invoice);
                              setShowPaymentLinkDialog(true);
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-blue-600 active:bg-blue-50 disabled:opacity-40 touch-manipulation"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                            Link
                          </button>
                        )}
                        {columnSettings.recordPayment && invoice.payment_status !== "completed" && (
                          <button
                            type="button"
                            onClick={() => openPaymentDialog(invoice)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary active:bg-primary/5 touch-manipulation"
                          >
                            <IndianRupee className="h-3.5 w-3.5" />
                            Record
                          </button>
                        )}
                      </>
                    }
                  />
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-card border-t border-border mx-4 rounded-xl mb-4">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                Prev
              </Button>
              <span className="text-xs text-muted-foreground">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                Next
              </Button>
            </div>
          )}
        </div>
        {dashboardDialogs}
      </>
    );
  }

  const fmtInr = (n: number) => `₹${formatSnapshotInr(n, n >= 100000 ? 0 : 2)}`;

  const datePresetActive = (from: Date, to: Date) =>
    dateFrom &&
    dateTo &&
    format(dateFrom, "yyyy-MM-dd") === format(from, "yyyy-MM-dd") &&
    format(dateTo, "yyyy-MM-dd") === format(to, "yyyy-MM-dd");

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col bg-slate-50 px-2 sm:px-3 md:px-4 lg:px-5 py-4 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 shrink-0 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-600 tracking-tight leading-tight">Payments Dashboard</h1>
          <p className="text-slate-400 text-base mt-0.5">Invoice collections · customer & supplier account totals</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => navigate("/accounts")}>
            Accounts Management
          </Button>
        </div>
      </div>

      {customerIdParam && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/80 px-3 py-2 mb-2 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium text-blue-900">Customer filter active</span>
          <span className="text-blue-800 tabular-nums">
            Outstanding ₹{formatSnapshotInr(filteredCustomerSnapshot.outstandingDr)} · Advance ₹
            {formatSnapshotInr(filteredCustomerSnapshot.advanceAvailable)} · CN ₹
            {formatSnapshotInr(filteredCustomerSnapshot.cnAvailableTotal)}
            {filteredCustomerSnapshot.cnPendingCount > 0
              ? ` (${filteredCustomerSnapshot.cnPendingCount} pending)`
              : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 ml-auto"
            onClick={() => {
              searchParams.delete("customerId");
              setSearchParams(searchParams);
            }}
          >
            <X className="h-4 w-4 mr-1" />
            Clear customer
          </Button>
        </div>
      )}

      <p className="text-xs text-slate-500 mb-2 shrink-0">
        Invoice cards reflect filters ({periodLabel}). Account cards use ledger snapshot (same as Customer Ledger).
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 shrink-0 mb-2">
        <MetricCard
          label="Invoices"
          value={String(summaryStats.total)}
          sub={`Revenue ${fmtInr(summaryStats.totalRevenue)}`}
          gradient="bg-gradient-to-br from-blue-500 to-blue-600"
          icon={Receipt}
        />
        <MetricCard
          label="Collected"
          value={fmtInr(summaryStats.completedAmount)}
          sub="Paid invoices in period"
          gradient="bg-gradient-to-br from-emerald-500 to-emerald-600"
          icon={CheckCircle}
        />
        <MetricCard
          label="Invoice Due"
          value={fmtInr(summaryStats.pendingAmount)}
          sub="Unpaid on listed invoices"
          gradient="bg-gradient-to-br from-red-500 to-red-600"
          icon={AlertCircle}
        />
        <MetricCard
          label="Collection %"
          value={`${summaryStats.collectionRate.toFixed(1)}%`}
          sub="Completed ÷ revenue"
          gradient="bg-gradient-to-br from-violet-500 to-violet-600"
          icon={Clock}
        />
        <MetricCard
          label="Customer Due"
          value={accountTotalsLoading ? "…" : fmtInr(accountTotals.totalOutstandingDr)}
          sub={`${accountTotals.customersWithOutstanding} with balance · ledger`}
          gradient="bg-gradient-to-br from-rose-500 to-rose-600"
          icon={TrendingUp}
          onClick={() => navigate("/accounts")}
        />
        <MetricCard
          label="Advance"
          value={accountTotalsLoading ? "…" : fmtInr(accountTotals.totalAdvanceAvailable)}
          sub={`${accountTotals.customersWithAdvance} customers`}
          gradient="bg-gradient-to-br from-teal-500 to-teal-600"
          icon={Wallet}
          onClick={() => navigate("/accounts?tab=customer-payment")}
        />
        <MetricCard
          label="CN Available"
          value={accountTotalsLoading ? "…" : fmtInr(accountTotals.totalCnAvailable)}
          sub={`${accountTotals.totalCnPendingCount} pending returns`}
          gradient="bg-gradient-to-br from-amber-500 to-amber-600"
          icon={BookOpen}
          onClick={() => navigate("/accounts?tab=customer-ledger")}
        />
        <MetricCard
          label="Supplier Payable"
          value={fmtInr(Number(accountsMetrics?.totalPayables || 0))}
          sub="Matches Accounts dashboard"
          gradient="bg-gradient-to-br from-orange-500 to-orange-600"
          icon={Building2}
          onClick={() => navigate("/accounts?tab=supplier-ledger")}
        />
      </div>

      <Card className="rounded-xl border border-slate-200 shadow-sm overflow-hidden p-0 flex-1 min-h-0 flex flex-col">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 bg-white shrink-0">
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <Button
              variant={datePresetActive(new Date(), new Date()) ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={setTodayFilter}
            >
              Today
            </Button>
            <Button
              variant={datePresetActive(startOfMonth(new Date()), endOfMonth(new Date())) ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={setMonthlyFilter}
            >
              Monthly
            </Button>
            <Button
              variant={datePresetActive(startOfQuarter(new Date()), endOfQuarter(new Date())) ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={setQuarterlyFilter}
            >
              Quarterly
            </Button>
            <Button
              variant={datePresetActive(startOfYear(new Date()), endOfYear(new Date())) ? "default" : "outline"}
              size="sm"
              className="h-9"
              onClick={setYearlyFilter}
            >
              Year
            </Button>
            {(dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" className="h-9" onClick={clearDateFilter}>
                Clear dates
              </Button>
            )}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by invoice, customer, phone..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className={accountsHistorySearchInputClass}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
              <SelectValue placeholder="Status" />
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
              <Button variant="outline" className="h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white justify-start min-w-[130px]">
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                {dateFrom ? format(dateFrom, "dd MMM yyyy") : "From"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white justify-start min-w-[130px]">
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                {dateTo ? format(dateTo, "dd MMM yyyy") : "To"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 border-slate-200 shrink-0">
                <Settings2 className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium text-sm">Column visibility</h4>
                {Object.entries(columnSettings).map(([key, value]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={key}
                      checked={value}
                      onCheckedChange={(checked) => updateColumnSetting(key, checked === true)}
                    />
                    <Label htmlFor={key} className="cursor-pointer capitalize text-sm">
                      {key.replace(/([A-Z])/g, " $1").trim()}
                    </Label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="px-3 py-1.5 border-b border-slate-100 bg-slate-50/50 text-xs text-slate-600 shrink-0">
          Invoice payments ({filteredInvoices.length}) · showing {paginatedInvoices.length} on this page
        </div>

        <div className={cn(accountsHistoryTableWrapClass, "flex-1")}>
              <Table className={accountsHistoryTableClass}>
                <TableHeader className="!static">
                  <TableRow>
                    {columnSettings.saleNumber && <TableHead className={accountsHistoryThClass}>Invoice No.</TableHead>}
                    {columnSettings.customer && <TableHead className={accountsHistoryThClass}>Customer</TableHead>}
                    {columnSettings.saleDate && <TableHead className={accountsHistoryThClass}>Sale Date</TableHead>}
                    {columnSettings.dueDate && <TableHead className={accountsHistoryThClass}>Due Date</TableHead>}
                    {columnSettings.netAmount && <TableHead className={cn(accountsHistoryThClass, "text-right")}>Total</TableHead>}
                    {columnSettings.paidAmount && <TableHead className={cn(accountsHistoryThClass, "text-right")}>Paid</TableHead>}
                    {columnSettings.pendingAmount && <TableHead className={cn(accountsHistoryThClass, "text-right")}>Pending</TableHead>}
                    {columnSettings.status && <TableHead className={accountsHistoryThClass}>Status</TableHead>}
                    <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>
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
                        <TableRow key={invoice.id} className="hover:bg-accent/50">
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

        {(totalPages > 1 || filteredInvoices.length > 0) && (
          <div className={accountsHistoryFooterClass}>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Per page:</span>
              <Select
                value={itemsPerPage.toString()}
                onValueChange={(value) => {
                  setItemsPerPage(parseInt(value, 10));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20 h-8">
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
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <span className="font-medium">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            ) : (
              <span className="text-muted-foreground">{filteredInvoices.length} invoices</span>
            )}
          </div>
        )}
      </Card>
      {dashboardDialogs}
    </div>
  );
}
