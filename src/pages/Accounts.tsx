import { useMemo, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileBottomNav } from "@/components/mobile/MobileBottomNav";
import { ArrowDownLeft, ArrowUpRight, BookOpen, AlertCircle, Receipt, FileText as FileTextIcon2 } from "lucide-react";
import { BackToDashboard } from "@/components/BackToDashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Printer, Send, Coins, LayoutDashboard } from "lucide-react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { CustomerLedger } from "@/components/CustomerLedger";
import { SupplierLedger } from "@/components/SupplierLedger";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaymentReceipt } from "@/components/PaymentReceipt";
import { useReactToPrint } from "react-to-print";
import { useUserRoles } from "@/hooks/useUserRoles";
import { AddAdvanceBookingDialog } from "@/components/AddAdvanceBookingDialog";
import { CustomerBalanceAdjustmentDialog } from "@/components/CustomerBalanceAdjustmentDialog";
import { RecentBalanceAdjustments } from "@/components/RecentBalanceAdjustments";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAllCustomers, fetchAllSalesSummary, fetchAllSuppliers } from "@/utils/fetchAllRows";

// Extracted tab components
import { AccountsDashboardCards } from "@/components/accounts/AccountsDashboardCards";
import { CustomerPaymentTab } from "@/components/accounts/CustomerPaymentTab";
import { SupplierPaymentTab } from "@/components/accounts/SupplierPaymentTab";
import { EmployeeSalaryTab } from "@/components/accounts/EmployeeSalaryTab";
import { ExpensesTab } from "@/components/accounts/ExpensesTab";
import { VoucherEntryTab } from "@/components/accounts/VoucherEntryTab";
import { ReconciliationTab } from "@/components/accounts/ReconciliationTab";
import { OutstandingDashboardTab } from "@/components/accounts/OutstandingDashboardTab";

export default function Accounts() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRoles();
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const urlCustomerId = searchParams.get("customer");
  const [selectedTab, setSelectedTab] = useState(urlTab || "customer-ledger");

  // Card filter state
  const [paymentCardFilter, setPaymentCardFilter] = useState<string | null>(null);

  // Receipt states
  const [showReceiptDialog, setShowReceiptDialog] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Advance booking & balance adjustment dialog state
  const [showAdvanceDialog, setShowAdvanceDialog] = useState(false);
  const [showBalanceAdjustmentDialog, setShowBalanceAdjustmentDialog] = useState(false);

  // Edit payment dialog state
  const [showEditPaymentDialog, setShowEditPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [editPaymentDate, setEditPaymentDate] = useState<Date>(new Date());
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editChequeDate, setEditChequeDate] = useState<Date | undefined>(undefined);
  const [editTransactionId, setEditTransactionId] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Fetch settings for receipt
  const { data: settings } = useQuery({
    queryKey: ["settings", currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("settings")
        .select("*")
        .eq("organization_id", currentOrganization?.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Old voucher fetch removed — now lazy-loaded per tab below

  // Fetch dashboard stats via single RPC (replaces 4+ separate queries)
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const { data: dashboardStats } = useQuery({
    queryKey: ["accounts-dashboard-metrics", currentOrganization?.id, monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_accounts_dashboard_metrics", {
        p_org_id: currentOrganization!.id,
        p_month_start: monthStart,
        p_month_end: monthEnd,
      });
      if (error) throw error;
      return data as any;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: failedJournalCount = 0 } = useQuery({
    queryKey: ["failed-journal-count", currentOrganization?.id],
    enabled: !!currentOrganization?.id,
    queryFn: async () => {
      const [{ count: failedSales, error: salesErr }, { count: failedPurchases, error: purchaseErr }] =
        await Promise.all([
          supabase
            .from("sales")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", currentOrganization!.id)
            .eq("journal_status", "failed")
            .is("deleted_at", null),
          supabase
            .from("purchase_bills")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", currentOrganization!.id)
            .eq("journal_status", "failed")
            .is("deleted_at", null),
        ]);

      if (salesErr) throw salesErr;
      if (purchaseErr) throw purchaseErr;

      return Number(failedSales || 0) + Number(failedPurchases || 0);
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // Fetch sales only when customer-payment or reconciliation tab is active
  const needsSales = selectedTab === "customer-payment" || selectedTab === "customer-ledger" || selectedTab === "outstanding";
  const { data: sales } = useQuery({
    queryKey: ["sales-summary-accounts", currentOrganization?.id],
    queryFn: async () => fetchAllSalesSummary(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsSales,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch customers only when tabs that need them are active
  const needsCustomers = selectedTab === "customer-payment" || selectedTab === "reconciliation" || selectedTab === "customer-ledger" || selectedTab === "outstanding";
  const { data: customers } = useQuery({
    queryKey: ["customers", currentOrganization?.id],
    queryFn: async () => fetchAllCustomers(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsCustomers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch suppliers only when supplier tab is active
  const needsSuppliers = selectedTab === "supplier-payment" || selectedTab === "supplier-ledger";
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", currentOrganization?.id],
    queryFn: async () => fetchAllSuppliers(currentOrganization!.id),
    enabled: !!currentOrganization?.id && needsSuppliers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Fetch vouchers only when tabs that need them are active
  const needsVouchers = selectedTab === "customer-payment" || selectedTab === "supplier-payment" || selectedTab === "employee-salary" || selectedTab === "expenses" || selectedTab === "voucher-entry";
  const { data: vouchers } = useQuery({
    queryKey: ["voucher-entries", currentOrganization?.id],
    queryFn: async () => {
      const allVouchers: any[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("id, voucher_number, voucher_date, voucher_type, total_amount, description, reference_type, reference_id, payment_method, discount_amount, discount_reason")
          .eq("organization_id", currentOrganization?.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          allVouchers.push(...data);
          offset += PAGE_SIZE;
          hasMore = data.length === PAGE_SIZE;
        } else { hasMore = false; }
      }
      return allVouchers;
    },
    enabled: !!currentOrganization?.id && needsVouchers,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Dashboard metrics from unified RPC
  const invoiceStats = dashboardStats?.invoiceStats || {};
  const monthlySales = dashboardStats?.monthlySales || 0;
  const monthlyPurchases = dashboardStats?.monthlyPurchases || 0;
  const monthlyExpenses = dashboardStats?.monthlyExpenses || 0;
  const { data: reconciledInvoiceStats } = useQuery({
    queryKey: ["accounts-reconciled-invoice-stats", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;

      const salesRows: Array<{ id: string; net_amount: number | null; paid_amount: number | null }> = [];
      const voucherRows: Array<{ reference_id: string | null; total_amount: number | null }> = [];
      const PAGE_SIZE = 1000;

      let salesOffset = 0;
      let hasMoreSales = true;
      while (hasMoreSales) {
        const { data, error } = await supabase
          .from("sales")
          .select("id, net_amount, paid_amount")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .eq("is_cancelled", false)
          .not("payment_status", "in", '("cancelled","hold")')
          .range(salesOffset, salesOffset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          salesRows.push(...(data as any));
          salesOffset += PAGE_SIZE;
          hasMoreSales = data.length === PAGE_SIZE;
        } else {
          hasMoreSales = false;
        }
      }

      let voucherOffset = 0;
      let hasMoreVouchers = true;
      while (hasMoreVouchers) {
        const { data, error } = await supabase
          .from("voucher_entries")
          .select("reference_id, total_amount")
          .eq("organization_id", currentOrganization.id)
          .eq("voucher_type", "receipt")
          .eq("reference_type", "sale")
          .is("deleted_at", null)
          .range(voucherOffset, voucherOffset + PAGE_SIZE - 1);
        if (error) throw error;
        if (data && data.length > 0) {
          voucherRows.push(...(data as any));
          voucherOffset += PAGE_SIZE;
          hasMoreVouchers = data.length === PAGE_SIZE;
        } else {
          hasMoreVouchers = false;
        }
      }

      const voucherPaidBySale = new Map<string, number>();
      voucherRows.forEach((v) => {
        if (!v.reference_id) return;
        voucherPaidBySale.set(v.reference_id, (voucherPaidBySale.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
      });

      let totalInvoices = 0;
      let totalAmount = 0;
      let paidAmount = 0;
      let pendingCount = 0;
      let pendingAmount = 0;
      let partialCount = 0;
      let partialAmount = 0;
      let completedCount = 0;
      let completedAmount = 0;
      let totalReceivables = 0;

      for (const sale of salesRows) {
        const net = Math.max(0, Number(sale.net_amount) || 0);
        if (net <= 0) continue;
        totalInvoices += 1;
        totalAmount += net;

        const paidFromRow = Number(sale.paid_amount) || 0;
        const paidFromVouchers = voucherPaidBySale.get(sale.id) || 0;
        const effectivePaid = Math.min(net, Math.max(paidFromRow, paidFromVouchers));
        const outstanding = Math.max(0, net - effectivePaid);

        paidAmount += effectivePaid;
        totalReceivables += outstanding;

        if (outstanding <= 0.009) {
          completedCount += 1;
          completedAmount += net;
        } else if (effectivePaid > 0.009) {
          partialCount += 1;
          partialAmount += outstanding;
        } else {
          pendingCount += 1;
          pendingAmount += outstanding;
        }
      }

      return {
        totalInvoices,
        totalAmount,
        paidAmount,
        pendingCount,
        pendingAmount,
        partialCount,
        partialAmount,
        completedCount,
        completedAmount,
        totalReceivables,
      };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const dashboardMetrics = useMemo(() => ({
    totalReceivables: reconciledInvoiceStats?.totalReceivables ?? dashboardStats?.totalReceivables ?? 0,
    totalPayables: dashboardStats?.totalPayables || 0,
    monthlyExpenses,
    currentMonthPL: monthlySales - monthlyPurchases - monthlyExpenses,
  }), [reconciledInvoiceStats, dashboardStats, monthlyExpenses, monthlySales, monthlyPurchases]);

  const paymentStats = useMemo(() => ({
    totalInvoices: reconciledInvoiceStats?.totalInvoices ?? (invoiceStats.total || 0),
    totalAmount: reconciledInvoiceStats?.totalAmount ?? (invoiceStats.totalAmount || 0),
    paidAmount: reconciledInvoiceStats?.paidAmount ?? (invoiceStats.paidAmount || 0),
    pendingCount: reconciledInvoiceStats?.pendingCount ?? (invoiceStats.pending || 0),
    pendingAmount: reconciledInvoiceStats?.pendingAmount ?? (invoiceStats.pendingAmount || 0),
    partialCount: reconciledInvoiceStats?.partialCount ?? (invoiceStats.partial || 0),
    partialAmount: reconciledInvoiceStats?.partialAmount ?? (invoiceStats.partialAmount || 0),
    completedCount: reconciledInvoiceStats?.completedCount ?? (invoiceStats.paid || 0),
    completedAmount: reconciledInvoiceStats?.completedAmount ?? (invoiceStats.paidAmount || 0),
  }), [reconciledInvoiceStats, invoiceStats]);

  const handleCardClick = (filter: string | null) => {
    setPaymentCardFilter(filter);
    setSelectedTab("customer-ledger");
  };

  const handleShowReceipt = (data: any) => {
    setReceiptData(data);
    setShowReceiptDialog(true);
  };

  const openEditPaymentDialog = (voucher: any) => {
    setEditingPayment(voucher);
    setEditPaymentDate(new Date(voucher.voucher_date));
    setEditPaymentAmount(voucher.total_amount?.toString() || "");
    const desc = voucher.description || "";
    if (desc.includes("Cheque No:")) {
      setEditPaymentMethod("cheque");
      const chequeMatch = desc.match(/Cheque No: (\d+)/);
      const dateMatch = desc.match(/Date: (\d{2}\/\d{2}\/\d{4})/);
      if (chequeMatch) setEditChequeNumber(chequeMatch[1]);
      if (dateMatch) {
        const [day, month, year] = dateMatch[1].split('/');
        setEditChequeDate(new Date(parseInt(year), parseInt(month) - 1, parseInt(day)));
      }
    } else if (desc.includes("Transaction ID:")) {
      const txMatch = desc.match(/Transaction ID: (\S+)/);
      if (txMatch) setEditTransactionId(txMatch[1]);
      setEditPaymentMethod("upi");
    } else {
      setEditPaymentMethod("cash");
      setEditChequeNumber("");
      setEditChequeDate(undefined);
      setEditTransactionId("");
    }
    setEditDescription(desc);
    setShowEditPaymentDialog(true);
  };

  // Edit payment mutation
  const updatePayment = useMutation({
    mutationFn: async () => {
      if (!editingPayment) throw new Error("No payment selected");
      const newAmount = parseFloat(editPaymentAmount);
      const oldAmount = editingPayment.total_amount || 0;
      const amountDiff = newAmount - oldAmount;
      let paymentDetails = '';
      if (editPaymentMethod === 'cheque' && editChequeNumber) {
        paymentDetails = ` | Cheque No: ${editChequeNumber}`;
        if (editChequeDate) paymentDetails += `, Date: ${format(editChequeDate, 'dd/MM/yyyy')}`;
      } else if ((editPaymentMethod === 'upi' || editPaymentMethod === 'bank_transfer' || editPaymentMethod === 'other') && editTransactionId) {
        paymentDetails = ` | Transaction ID: ${editTransactionId}`;
      }
      let baseDescription = editDescription.split(' | Cheque No:')[0].split(' | Transaction ID:')[0];
      const finalDescription = baseDescription + paymentDetails;
      const { error: voucherError } = await supabase.from("voucher_entries").update({ voucher_date: format(editPaymentDate, "yyyy-MM-dd"), total_amount: newAmount, description: finalDescription }).eq("id", editingPayment.id).eq("organization_id", currentOrganization!.id);
      if (voucherError) throw voucherError;
      if (editingPayment.reference_id && amountDiff !== 0) {
        const { data: invoice } = await supabase.from("sales").select("paid_amount, net_amount").eq("id", editingPayment.reference_id).maybeSingle();
        if (invoice) {
          const newPaidAmount = Math.max(0, (invoice.paid_amount || 0) + amountDiff);
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : newPaidAmount > 0 ? 'partial' : 'pending';
          await supabase.from("sales").update({ paid_amount: newPaidAmount, payment_status: newStatus }).eq("id", editingPayment.reference_id);
        }
      }
      return { oldAmount, newAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      toast.success(`Payment updated. Amount changed from ₹${Math.round(data.oldAmount).toLocaleString('en-IN')} to ₹${Math.round(data.newAmount).toLocaleString('en-IN')}`);
      setShowEditPaymentDialog(false);
      setEditingPayment(null);
    },
    onError: (error: Error) => { toast.error(`Failed to update payment: ${error.message}`); },
  });

  const handlePrintReceipt = useReactToPrint({
    contentRef: receiptRef,
    documentTitle: `Receipt_${receiptData?.voucherNumber}`,
  });

  const handleSendWhatsApp = () => {
    if (!receiptData || !receiptData.customerPhone) { toast.error("Customer phone number not available"); return; }
    const message = `*PAYMENT RECEIPT*\n\nReceipt No: ${receiptData.voucherNumber}\nDate: ${receiptData.voucherDate ? format(new Date(receiptData.voucherDate), 'dd/MM/yyyy') : '-'}\n\nCustomer: ${receiptData.customerName?.toUpperCase()}\nInvoice: ${receiptData.invoiceNumber}\n\nInvoice Amount: ₹${Math.round(receiptData.invoiceAmount).toLocaleString('en-IN')}\nPaid Amount: ₹${Math.round(receiptData.paidAmount).toLocaleString('en-IN')}\nBalance: ₹${Math.round(receiptData.currentBalance).toLocaleString('en-IN')}\n\nPayment Mode: ${receiptData.paymentMethod.toUpperCase()}\n\nThank you for your payment!`;
    const phoneNumber = receiptData.customerPhone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${phoneNumber.startsWith('91') ? phoneNumber : '91' + phoneNumber}?text=${encodeURIComponent(message)}`;
    const isMac = navigator.platform?.toUpperCase().indexOf("MAC") >= 0;
    const shortcut = isMac ? "Cmd+V" : "Ctrl+V";
    navigator.clipboard.writeText(message).then(() => { toast.success(`✓ Message copied! Paste with ${shortcut} if it doesn't auto-fill`, { duration: 5000 }); }).catch(() => { toast.warning("Couldn't copy to clipboard automatically"); });
    setTimeout(() => { window.open(waUrl, '_blank'); }, 300);
  };

  const isMobile = useIsMobile();

  if (isMobile) {
    const tabs = [
      { id: "customer-ledger", label: "Cust. Ledger", icon: BookOpen },
      { id: "supplier-ledger", label: "Supp. Ledger", icon: BookOpen },
      { id: "outstanding", label: "Outstanding", icon: AlertCircle },
      { id: "customer-payment", label: "Receive ₹", icon: ArrowDownLeft },
      { id: "supplier-payment", label: "Pay ₹", icon: ArrowUpRight },
      { id: "expenses", label: "Expenses", icon: Receipt },
      { id: "employee-salary", label: "Salaries", icon: Receipt },
      { id: "voucher-entry", label: "Vouchers", icon: FileTextIcon2 },
      { id: "reconciliation", label: "Reconcile", icon: Receipt },
    ];

    const fmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

    return (
      <div className="flex flex-col min-h-screen bg-muted/30 pb-24">
        <MobilePageHeader title="Accounts" backTo="/payments-dashboard" />

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-2 px-4 py-3">
          <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200">
            <p className="text-[10px] font-medium text-muted-foreground">Receivable</p>
            <p className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(dashboardMetrics.totalReceivables)}</p>
          </div>
          <div className="rounded-xl p-3 bg-rose-50 border border-rose-200">
            <p className="text-[10px] font-medium text-muted-foreground">Payable</p>
            <p className="text-sm font-bold text-rose-700 tabular-nums">{fmt(dashboardMetrics.totalPayables)}</p>
          </div>
          <div className="rounded-xl p-3 bg-amber-50 border border-amber-200">
            <p className="text-[10px] font-medium text-muted-foreground">Monthly Expenses</p>
            <p className="text-sm font-bold text-amber-700 tabular-nums">{fmt(dashboardMetrics.monthlyExpenses)}</p>
          </div>
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-200">
            <p className="text-[10px] font-medium text-muted-foreground">Net P/L</p>
            <p className={cn("text-sm font-bold tabular-nums", dashboardMetrics.currentMonthPL >= 0 ? "text-emerald-700" : "text-rose-700")}>
              {fmt(dashboardMetrics.currentMonthPL)}
            </p>
          </div>
        </div>

        {/* Tab chips */}
        <div className="flex gap-2 px-4 overflow-x-auto no-scrollbar pb-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTab(t.id)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all touch-manipulation",
                selectedTab === t.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {selectedTab === "customer-ledger" && currentOrganization?.id && (
            <CustomerLedger organizationId={currentOrganization.id} paymentFilter={paymentCardFilter} preSelectedCustomerId={urlCustomerId} />
          )}
          {selectedTab === "supplier-ledger" && currentOrganization?.id && (
            <SupplierLedger organizationId={currentOrganization.id} />
          )}
          {selectedTab === "outstanding" && currentOrganization?.id && (
            <OutstandingDashboardTab organizationId={currentOrganization.id} />
          )}
          {selectedTab === "customer-payment" && currentOrganization?.id && (
            <CustomerPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} sales={sales} customers={customers} settings={settings} onShowReceipt={handleShowReceipt} onShowAdvanceDialog={() => setShowAdvanceDialog(true)} onEditPayment={openEditPaymentDialog} />
          )}
          {selectedTab === "supplier-payment" && currentOrganization?.id && (
            <SupplierPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} suppliers={suppliers} onEditPayment={openEditPaymentDialog} />
          )}
          {selectedTab === "employee-salary" && currentOrganization?.id && (
            <EmployeeSalaryTab organizationId={currentOrganization.id} vouchers={vouchers} />
          )}
          {selectedTab === "expenses" && currentOrganization?.id && (
            <ExpensesTab organizationId={currentOrganization.id} vouchers={vouchers} />
          )}
          {selectedTab === "voucher-entry" && <VoucherEntryTab vouchers={vouchers} />}
          {selectedTab === "reconciliation" && currentOrganization?.id && (
            <ReconciliationTab organizationId={currentOrganization.id} customers={customers} />
          )}
        </div>

        <MobileBottomNav />

        {/* All dialogs */}
        <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            {receiptData ? (
              <>
                <DialogHeader><DialogTitle>Payment Receipt</DialogTitle></DialogHeader>
                <div className="hidden"><PaymentReceipt ref={receiptRef} receiptData={receiptData} companyDetails={{ businessName: settings?.business_name, address: settings?.address, mobileNumber: settings?.mobile_number, emailId: settings?.email_id, gstNumber: settings?.gst_number, upiId: (settings?.sale_settings as any)?.upiId }} receiptSettings={{ showCompanyLogo: false, showQrCode: !!(settings?.sale_settings as any)?.upiId, showSignature: true, signatureLabel: "Authorized Signature" }} /></div>
                <div className="border rounded-lg p-4"><PaymentReceipt receiptData={receiptData} companyDetails={{ businessName: settings?.business_name, address: settings?.address, mobileNumber: settings?.mobile_number, emailId: settings?.email_id, gstNumber: settings?.gst_number, upiId: (settings?.sale_settings as any)?.upiId }} receiptSettings={{ showCompanyLogo: false, showQrCode: !!(settings?.sale_settings as any)?.upiId, showSignature: true, signatureLabel: "Authorized Signature" }} /></div>
                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={handlePrintReceipt}><Printer className="mr-2 h-4 w-4" /> Print</Button>
                  {receiptData.customerPhone && <Button onClick={handleSendWhatsApp}><Send className="mr-2 h-4 w-4" /> WhatsApp</Button>}
                </DialogFooter>
              </>
            ) : <div className="p-4 text-center text-muted-foreground">Loading…</div>}
          </DialogContent>
        </Dialog>
        <Dialog open={showEditPaymentDialog} onOpenChange={setShowEditPaymentDialog}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit Payment</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Amount</Label><Input type="number" step="0.01" value={editPaymentAmount} onChange={(e) => setEditPaymentAmount(e.target.value)} /></div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={editPaymentMethod} onValueChange={setEditPaymentMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="cheque">Cheque</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setShowEditPaymentDialog(false)}>Cancel</Button><Button onClick={() => updatePayment.mutate()} disabled={updatePayment.isPending}>Save</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        {currentOrganization?.id && <AddAdvanceBookingDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog} organizationId={currentOrganization.id} />}
        {currentOrganization?.id && <CustomerBalanceAdjustmentDialog open={showBalanceAdjustmentDialog} onOpenChange={setShowBalanceAdjustmentDialog} organizationId={currentOrganization.id} />}
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-6 pb-24 lg:pb-6 space-y-6 min-h-screen bg-gradient-to-br from-background via-slate-50/30 to-background dark:via-slate-900/20">
      <BackToDashboard label="Back to Payments" to="/payments-dashboard" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-md">
            <LayoutDashboard className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Accounts Management
            </h1>
            <p className="text-sm text-muted-foreground">Payments · Expenses · Vouchers · Financial Reports</p>
          </div>
        </div>
      </div>

      <AccountsDashboardCards
        dashboardMetrics={dashboardMetrics}
        paymentStats={paymentStats}
        paymentCardFilter={paymentCardFilter}
        onCardClick={handleCardClick}
        failedJournalCount={failedJournalCount}
      />

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:grid-cols-10 h-10 bg-muted/60 p-1 rounded-xl">
          <TabsTrigger value="customer-ledger" className="rounded-lg text-xs font-medium">Customer Ledger</TabsTrigger>
          <TabsTrigger value="supplier-ledger" className="rounded-lg text-xs font-medium">Supplier Ledger</TabsTrigger>
          <TabsTrigger value="outstanding" className="rounded-lg text-xs font-medium">Outstanding</TabsTrigger>
          <TabsTrigger value="customer-payment" className="rounded-lg text-xs font-medium">Customer Payment</TabsTrigger>
          <TabsTrigger value="supplier-payment" className="rounded-lg text-xs font-medium">Supplier Payment</TabsTrigger>
          <TabsTrigger value="employee-salary" className="rounded-lg text-xs font-medium">Employee Salary</TabsTrigger>
          <TabsTrigger value="expenses" className="rounded-lg text-xs font-medium">Expenses</TabsTrigger>
          <TabsTrigger value="voucher-entry" className="rounded-lg text-xs font-medium">Voucher Entry</TabsTrigger>
          <TabsTrigger value="reconciliation" className="rounded-lg text-xs font-medium">Reconciliation</TabsTrigger>
          {isAdmin && <TabsTrigger value="balance-adjustment" className="rounded-lg text-xs font-medium">Balance Adj.</TabsTrigger>}
        </TabsList>

        <TabsContent value="customer-ledger" className="space-y-6">
          {currentOrganization?.id && (
            <CustomerLedger organizationId={currentOrganization.id} paymentFilter={paymentCardFilter} preSelectedCustomerId={urlCustomerId} />
          )}
        </TabsContent>

        <TabsContent value="supplier-ledger" className="space-y-6">
          {currentOrganization?.id && <SupplierLedger organizationId={currentOrganization.id} />}
        </TabsContent>

        <TabsContent value="outstanding" className="space-y-6">
          {currentOrganization?.id && <OutstandingDashboardTab organizationId={currentOrganization.id} />}
        </TabsContent>

        <TabsContent value="customer-payment" className="space-y-6">
          {currentOrganization?.id && (
            <CustomerPaymentTab
              organizationId={currentOrganization.id}
              vouchers={vouchers}
              sales={sales}
              customers={customers}
              settings={settings}
              onShowReceipt={handleShowReceipt}
              onShowAdvanceDialog={() => setShowAdvanceDialog(true)}
              onEditPayment={openEditPaymentDialog}
            />
          )}
        </TabsContent>

        <TabsContent value="supplier-payment" className="space-y-6">
          {currentOrganization?.id && (
            <SupplierPaymentTab organizationId={currentOrganization.id} vouchers={vouchers} suppliers={suppliers} onEditPayment={openEditPaymentDialog} />
          )}
        </TabsContent>

        <TabsContent value="employee-salary" className="space-y-6">
          {currentOrganization?.id && <EmployeeSalaryTab organizationId={currentOrganization.id} vouchers={vouchers} />}
        </TabsContent>

        <TabsContent value="expenses" className="space-y-6">
          {currentOrganization?.id && <ExpensesTab organizationId={currentOrganization.id} vouchers={vouchers} />}
        </TabsContent>

        <TabsContent value="voucher-entry" className="space-y-6">
          <VoucherEntryTab vouchers={vouchers} />
        </TabsContent>

        <TabsContent value="reconciliation" className="space-y-6">
          {currentOrganization?.id && <ReconciliationTab organizationId={currentOrganization.id} customers={customers} />}
        </TabsContent>

        {isAdmin && (
          <TabsContent value="balance-adjustment" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5" /> Customer Balance Adjustment</CardTitle>
                <CardDescription>Adjust customer outstanding or advance balances with full audit trail</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setShowBalanceAdjustmentDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" /> New Balance Adjustment
                </Button>
              </CardContent>
            </Card>
            <RecentBalanceAdjustments organizationId={currentOrganization?.id || ""} />
          </TabsContent>
        )}
      </Tabs>

      {/* Receipt Dialog */}
      <Dialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {receiptData ? (
            <>
              <DialogHeader>
                <DialogTitle>Payment Receipt</DialogTitle>
                <DialogDescription>Payment receipt for {receiptData.customerName}</DialogDescription>
              </DialogHeader>
              <div className="hidden">
                <PaymentReceipt ref={receiptRef} receiptData={receiptData} companyDetails={{ businessName: settings?.business_name, address: settings?.address, mobileNumber: settings?.mobile_number, emailId: settings?.email_id, gstNumber: settings?.gst_number, upiId: (settings?.sale_settings as any)?.upiId }} receiptSettings={{ showCompanyLogo: false, showQrCode: !!(settings?.sale_settings as any)?.upiId, showSignature: true, signatureLabel: "Authorized Signature" }} />
              </div>
              <div className="border rounded-lg p-4">
                <PaymentReceipt receiptData={receiptData} companyDetails={{ businessName: settings?.business_name, address: settings?.address, mobileNumber: settings?.mobile_number, emailId: settings?.email_id, gstNumber: settings?.gst_number, upiId: (settings?.sale_settings as any)?.upiId }} receiptSettings={{ showCompanyLogo: false, showQrCode: !!(settings?.sale_settings as any)?.upiId, showSignature: true, signatureLabel: "Authorized Signature" }} />
              </div>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={handlePrintReceipt}><Printer className="mr-2 h-4 w-4" /> Print Receipt</Button>
                {receiptData.customerPhone && <Button onClick={handleSendWhatsApp}><Send className="mr-2 h-4 w-4" /> Send via WhatsApp</Button>}
              </DialogFooter>
            </>
          ) : (
            <div className="p-4 text-center text-muted-foreground">Loading receipt data...</div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Payment Dialog */}
      <Dialog open={showEditPaymentDialog} onOpenChange={setShowEditPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment Receipt</DialogTitle>
            <DialogDescription>Update payment details for {editingPayment?.voucher_number}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editPaymentDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editPaymentDate ? format(editPaymentDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={editPaymentDate} onSelect={(date) => date && setEditPaymentDate(date)} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" placeholder="Enter amount" value={editPaymentAmount} onChange={(e) => setEditPaymentAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select value={editPaymentMethod} onValueChange={(value) => {
                setEditPaymentMethod(value);
                if (value !== 'cheque') { setEditChequeNumber(""); setEditChequeDate(undefined); }
                if (value !== 'upi' && value !== 'bank_transfer' && value !== 'other') setEditTransactionId("");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editPaymentMethod === 'cheque' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cheque Number</Label>
                  <Input placeholder="Enter cheque number" value={editChequeNumber} onChange={(e) => setEditChequeNumber(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Cheque Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {editChequeDate ? format(editChequeDate, "dd/MM/yyyy") : "Select date"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={editChequeDate} onSelect={setEditChequeDate} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}
            {(editPaymentMethod === 'upi' || editPaymentMethod === 'bank_transfer' || editPaymentMethod === 'other') && (
              <div className="space-y-2">
                <Label>Transaction ID</Label>
                <Input placeholder="Enter transaction ID" value={editTransactionId} onChange={(e) => setEditTransactionId(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea placeholder="Payment description" value={editDescription.split(' | Cheque No:')[0].split(' | Transaction ID:')[0]} onChange={(e) => setEditDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPaymentDialog(false)}>Cancel</Button>
            <Button onClick={() => updatePayment.mutate()} disabled={updatePayment.isPending || !editPaymentAmount || parseFloat(editPaymentAmount) <= 0}>
              {updatePayment.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {currentOrganization?.id && (
        <AddAdvanceBookingDialog open={showAdvanceDialog} onOpenChange={setShowAdvanceDialog} organizationId={currentOrganization.id} />
      )}
      {currentOrganization?.id && (
        <CustomerBalanceAdjustmentDialog open={showBalanceAdjustmentDialog} onOpenChange={setShowBalanceAdjustmentDialog} organizationId={currentOrganization.id} />
      )}
    </div>
  );
}
