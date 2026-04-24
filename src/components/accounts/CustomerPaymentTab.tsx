import { useState, useEffect, useRef } from "react";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, TrendingDown, Printer, Check, ChevronsUpDown, Pencil, Trash2, ChevronLeft, ChevronRight, Coins, Send, Link2, Zap, Wallet } from "lucide-react";
import { Filter } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import { calculateCustomerInvoiceBalances } from "@/utils/customerBalanceUtils";
import { useUserRoles } from "@/hooks/useUserRoles";
import { ReassignPaymentDialog } from "./ReassignPaymentDialog";
import { useCustomerAdvanceBalance } from "@/hooks/useCustomerAdvances";
interface CustomerPaymentTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
  sales: any[] | undefined;
  customers: any[] | undefined;
  settings: any;
  onShowReceipt: (receiptData: any) => void;
  onShowAdvanceDialog: () => void;
  onEditPayment: (voucher: any) => void;
}

export function CustomerPaymentTab({
  organizationId,
  vouchers,
  sales,
  customers,
  settings,
  onShowReceipt,
  onShowAdvanceDialog,
  onEditPayment,
}: CustomerPaymentTabProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRoles();

  // Form states
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [referenceId, setReferenceId] = useState("");
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<Date | undefined>(undefined);
  const [transactionId, setTransactionId] = useState("");
  const [upiPaymentDate, setUpiPaymentDate] = useState<Date | undefined>(undefined);
  const [upiCalendarOpen, setUpiCalendarOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // Customer search
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

  // Selection and pagination
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [customerPaymentsPage, setCustomerPaymentsPage] = useState(1);
  const [paymentSearchTerm, setPaymentSearchTerm] = useState("");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string[]>([]);
  const CUSTOMER_PAYMENTS_PER_PAGE = 10;

  // Reassign dialog state
  const [reassignPayment, setReassignPayment] = useState<any>(null);
  const [reassignCustomerId, setReassignCustomerId] = useState("");
  const [reassignCustomerName, setReassignCustomerName] = useState("");

  // Fetch next receipt number
  const { data: previewReceiptNumber } = useQuery({
    queryKey: ["next-receipt-number", organizationId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("generate_voucher_number", {
        p_type: "receipt",
        p_date: format(new Date(), "yyyy-MM-dd"),
      });
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
    staleTime: 5000,
  });

  // Fetch customers with balance
  const { data: customersWithBalance } = useQuery({
    queryKey: ["customers-with-balance", organizationId],
    queryFn: async () => {
      const allCustomers = await fetchAllCustomers(organizationId);
      const allSales = await fetchAllSalesSummary(organizationId);
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);
      if (voucherError) throw voucherError;

      const invoiceVoucherPayments = new Map<string, number>();
      const customerOpeningBalancePayments = new Map<string, number>();
      const saleIdSet = new Set(allSales.map((s: any) => s.id));
      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        if (saleIdSet.has(v.reference_id)) {
          invoiceVoucherPayments.set(v.reference_id, (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        } else if (v.reference_type === 'customer') {
          customerOpeningBalancePayments.set(v.reference_id, (customerOpeningBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        }
      });
      const customerBalances = calculateCustomerInvoiceBalances(allSales, invoiceVoucherPayments);
      return allCustomers
        .filter((c: any) => {
          const ob = c.opening_balance || 0;
          const obp = customerOpeningBalancePayments.get(c.id) || 0;
          const ib = customerBalances.get(c.id) || 0;
          return Math.max(0, ob - obp) + ib > 0;
        })
        .map((c: any) => ({
          ...c,
          outstandingBalance: Math.max(0, (c.opening_balance || 0) - (customerOpeningBalancePayments.get(c.id) || 0)) + (customerBalances.get(c.id) || 0),
        }));
    },
    enabled: !!organizationId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Customer invoices
  const { data: customerInvoices } = useQuery({
    queryKey: ["customer-invoices", referenceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("*")
        .eq("customer_id", referenceId)
        .in("payment_status", ["pending", "partial"])
        .is("deleted_at", null)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!referenceId,
  });

  // Customer balance — uses correct formula including balance adjustments
  const { balance: customerBalance } = useCustomerBalance(
    referenceId || null,
    organizationId
  );


  // Customer advance balance
  const { data: advanceBalance = 0 } = useCustomerAdvanceBalance(referenceId || null, organizationId);

  // Auto-fill amount
  useEffect(() => {
    if (selectedInvoiceIds.length > 0 && customerInvoices) {
      const total = customerInvoices
        .filter(inv => selectedInvoiceIds.includes(inv.id))
        .reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0);
      setAmount(total.toFixed(2));
    }
  }, [selectedInvoiceIds, customerInvoices]);

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceId("");
    setSelectedInvoiceIds([]);
    setDescription("");
    setAmount("");
    setPaymentMethod("cash");
    setChequeNumber("");
    setChequeDate(undefined);
    setTransactionId("");
    setUpiPaymentDate(undefined);
    setDiscountAmount("");
    setDiscountReason("");
    queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
  };

  // Apply advance to selected invoices
  const applyAdvanceMutation = useMutation({
    mutationFn: async () => {
      if (!referenceId || selectedInvoiceIds.length === 0) throw new Error("Select customer and invoices");
      const invoicesToProcess = customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)) || [];
      if (invoicesToProcess.length === 0) throw new Error("No invoices selected");
      const totalOutstanding = invoicesToProcess.reduce((sum, inv) => sum + Math.max(0, (inv.net_amount || 0) - (inv.paid_amount || 0)), 0);
      const amountToApply = Math.min(advanceBalance, totalOutstanding);
      if (amountToApply <= 0) throw new Error("No advance balance to apply");
      
      // FIFO advance consumption
      const { data: availableAdvances } = await supabase.from("customer_advances").select("*").eq("customer_id", referenceId).eq("organization_id", organizationId).in("status", ["active", "partially_used"]).order("advance_date", { ascending: true });
      let advRemaining = amountToApply;
      for (const adv of availableAdvances || []) {
        if (advRemaining <= 0) break;
        const available = adv.amount - adv.used_amount;
        const toUse = Math.min(available, advRemaining);
        const newUsed = adv.used_amount + toUse;
        await supabase.from("customer_advances").update({ used_amount: newUsed, status: newUsed >= adv.amount ? "fully_used" : "partially_used" }).eq("id", adv.id);
        advRemaining -= toUse;
      }
      
      // Apply to invoices + create voucher entries
      let remaining = amountToApply;
      const { data: voucherNumber } = await supabase.rpc("generate_voucher_number", { p_type: "receipt", p_date: format(new Date(), "yyyy-MM-dd") });
      let idx = 0;
      for (const invoice of invoicesToProcess) {
        if (remaining <= 0) break;
        const outstanding = Math.max(0, (invoice.net_amount || 0) - (invoice.paid_amount || 0));
        const applyAmt = Math.min(remaining, outstanding);
        if (applyAmt <= 0) continue;
        const newPaid = (invoice.paid_amount || 0) + applyAmt;
        const newStatus = newPaid >= invoice.net_amount ? 'completed' : newPaid > 0 ? 'partial' : 'pending';
        await supabase.from('sales').update({ paid_amount: newPaid, payment_status: newStatus }).eq('id', invoice.id);
        const vNum = invoicesToProcess.length > 1 ? `${voucherNumber}-${idx + 1}` : voucherNumber;
        await supabase.from("voucher_entries").insert({ organization_id: organizationId, voucher_number: vNum, voucher_type: "receipt", voucher_date: format(new Date(), "yyyy-MM-dd"), reference_type: 'sale', reference_id: invoice.id, description: `Adjusted from advance balance for ${invoice.sale_number}`, total_amount: applyAmt, payment_method: 'advance_adjustment' });
        remaining -= applyAmt;
        idx++;
      }
      return { applied: amountToApply - remaining };
    },
    onSuccess: (data) => {
      toast.success(`₹${Math.round(data.applied).toLocaleString('en-IN')} advance applied to selected invoice(s)`);
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advance-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      setSelectedInvoiceIds([]);
    },
    onError: (error: Error) => toast.error(`Failed to apply advance: ${error.message}`),
  });

  // Create voucher mutation
  const createVoucher = useMutation({
    mutationFn: async () => {
      const invoicesToProcess = selectedInvoiceIds;
      if (!referenceId) throw new Error("Please select a customer to record payment");
      const paymentAmount = parseFloat(amount);
      const discountValue = parseFloat(discountAmount) || 0;
      const totalSettlement = paymentAmount + discountValue;
      let remainingAmount = totalSettlement;
      const processedInvoices: any[] = [];
      const isOpeningBalancePayment = invoicesToProcess.length === 0;

      if (invoicesToProcess.length > 0) {
        for (const invoiceId of invoicesToProcess) {
          if (remainingAmount <= 0) break;
          const invoice = customerInvoices?.find(inv => inv.id === invoiceId);
          if (!invoice) continue;
          const currentPaid = invoice.paid_amount || 0;
          const outstanding = invoice.net_amount - currentPaid;
          const amountToApply = Math.min(remainingAmount, outstanding);
          if (amountToApply <= 0) continue;
          const newPaidAmount = currentPaid + amountToApply;
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : newPaidAmount > 0 ? 'partial' : 'pending';
          const { error: updateError } = await supabase.from('sales').update({ paid_amount: newPaidAmount, payment_status: newStatus, payment_date: format(voucherDate, 'yyyy-MM-dd') }).eq('id', invoiceId);
          if (updateError) throw updateError;
          processedInvoices.push({ invoice, amountApplied: amountToApply, newPaidAmount, previousBalance: outstanding, currentBalance: outstanding - amountToApply });
          remainingAmount -= amountToApply;
        }
      }

      const { data: voucherNumber, error: numberError } = await supabase.rpc("generate_voucher_number", { p_type: "receipt", p_date: format(voucherDate, "yyyy-MM-dd") });
      if (numberError) throw numberError;

      const invoiceNumbers = processedInvoices.map(p => p.invoice.sale_number).join(', ');
      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) {
        paymentDetails = ` | Cheque No: ${chequeNumber}`;
        if (chequeDate) paymentDetails += `, Date: ${format(chequeDate, 'dd/MM/yyyy')}`;
      } else if ((paymentMethod === 'other' || paymentMethod === 'bank_transfer' || paymentMethod === 'upi') && transactionId) {
        paymentDetails = ` | Transaction ID: ${transactionId}`;
        if (paymentMethod === 'upi' && upiPaymentDate) paymentDetails += `, UPI Date: ${format(upiPaymentDate, 'dd/MM/yyyy')}`;
      }

      let finalDescription: string;
      if (isOpeningBalancePayment) {
        const customerName = customersWithBalance?.find(c => c.id === referenceId)?.customer_name || 'Customer';
        finalDescription = description ? `${description}${paymentDetails}` : `Opening Balance Payment from ${customerName}${paymentDetails}`;
      } else {
        finalDescription = description ? `${description}${paymentDetails}` : `Payment for: ${invoiceNumbers}${paymentDetails}`;
      }

      const discountSuffix = discountValue > 0 ? ` | Discount: ₹${discountValue.toFixed(2)}${discountReason ? ` (${discountReason})` : ''}` : '';

      let createdVouchers: any[] = [];
      if (!isOpeningBalancePayment && processedInvoices.length > 0) {
        for (let i = 0; i < processedInvoices.length; i++) {
          const processed = processedInvoices[i];
          const invoiceVoucherNumber = processedInvoices.length > 1 ? `${voucherNumber}-${i + 1}` : voucherNumber;
          const invoiceDescription = `Payment for ${processed.invoice.sale_number}${paymentDetails}`;
          const invoiceDiscountSuffix = i === 0 && discountValue > 0 ? ` | Discount: ₹${discountValue.toFixed(2)}${discountReason ? ` (${discountReason})` : ''}` : '';
          const { data: voucher, error: voucherError } = await supabase.from("voucher_entries").insert({
            organization_id: organizationId,
            voucher_number: invoiceVoucherNumber,
            voucher_type: "receipt",
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: 'sale',
            reference_id: processed.invoice.id,
            description: invoiceDescription + invoiceDiscountSuffix,
            total_amount: processed.amountApplied,
            discount_amount: i === 0 ? discountValue : 0,
            discount_reason: i === 0 ? discountReason || null : null,
            payment_method: paymentMethod,
          }).select().single();
          if (voucherError) throw voucherError;
          createdVouchers.push(voucher);
        }
      } else {
        const { data: voucher, error: voucherError } = await supabase.from("voucher_entries").insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "receipt",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: isOpeningBalancePayment ? 'customer' : 'sale',
          reference_id: isOpeningBalancePayment ? referenceId : processedInvoices[0]?.invoice.id || referenceId,
          description: finalDescription + discountSuffix,
          total_amount: paymentAmount,
          discount_amount: discountValue,
          discount_reason: discountReason || null,
          payment_method: paymentMethod,
        }).select().single();
        if (voucherError) throw voucherError;
        createdVouchers.push(voucher);
      }

      return { voucherNumber, processedInvoices, isOpeningBalancePayment, paymentMethod, discountAmount: discountValue, discountReason };
    },
    onSuccess: (data) => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });

      const totalPaid = parseFloat(amount);
      const discountValue = data.discountAmount || 0;

      if (data.isOpeningBalancePayment) {
        const customer = customersWithBalance?.find(c => c.id === referenceId);
        const totalSettled = totalPaid + discountValue;
        onShowReceipt({
          voucherNumber: data.voucherNumber, voucherDate: format(voucherDate, 'yyyy-MM-dd'),
          customerName: customer?.customer_name || 'Customer', customerPhone: customer?.phone || '',
          customerAddress: customer?.address || '', invoiceNumber: 'Opening Balance',
          invoiceDate: format(voucherDate, 'yyyy-MM-dd'), invoiceAmount: customerBalance || 0,
          paidAmount: totalPaid, discountAmount: discountValue, discountReason: data.discountReason || '',
          previousBalance: customerBalance || 0, currentBalance: (customerBalance || 0) - totalSettled,
          paymentMethod, multipleInvoices: [],
        });
      } else if (data.processedInvoices.length > 0) {
        const first = data.processedInvoices[0].invoice;
        onShowReceipt({
          voucherNumber: data.voucherNumber, voucherDate: format(voucherDate, 'yyyy-MM-dd'),
          customerName: first.customer_name, customerPhone: first.customer_phone,
          customerAddress: first.customer_address,
          invoiceNumber: data.processedInvoices.map((p: any) => p.invoice.sale_number).join(', '),
          invoiceDate: first.sale_date,
          invoiceAmount: data.processedInvoices.reduce((sum: number, p: any) => sum + p.invoice.net_amount, 0),
          paidAmount: totalPaid, discountAmount: discountValue, discountReason: data.discountReason || '',
          previousBalance: data.processedInvoices.reduce((sum: number, p: any) => sum + p.previousBalance, 0),
          currentBalance: data.processedInvoices.reduce((sum: number, p: any) => sum + p.currentBalance, 0),
          paymentMethod, multipleInvoices: data.processedInvoices,
        });
      }
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });

  // Delete receipt mutation
  const deleteReceipt = useMutation({
    mutationFn: async (payment: any) => {
      const voucherId = payment.id;
      const invoiceId = payment.reference_id;
      const paymentAmount = Number(payment.total_amount);
      if (invoiceId) {
        const { data: invoice } = await supabase.from("sales").select("paid_amount, net_amount, cash_amount, card_amount, upi_amount").eq("id", invoiceId).maybeSingle();
        if (invoice) {
          const newPaidAmount = Math.max(0, (invoice.paid_amount || 0) - paymentAmount);
          const newStatus = newPaidAmount >= invoice.net_amount ? 'completed' : newPaidAmount > 0 ? 'partial' : 'pending';
          await supabase.from("sales").update({ paid_amount: newPaidAmount, payment_status: newStatus }).eq("id", invoiceId);
        }
      }
      await supabase.from("voucher_items").delete().eq("voucher_id", voucherId);
      const { error } = await supabase.from("voucher_entries").delete().eq("id", voucherId);
      if (error) throw error;
      return { voucherId, paymentAmount };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["payment-reconciliation"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      toast.success(`Receipt deleted. ₹${Math.round(data.paymentAmount).toLocaleString('en-IN')} reversed.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete receipt: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || parseFloat(amount) <= 0) { toast.error("Please enter a valid amount"); return; }
    if (!referenceId) { toast.error("Please select a customer"); return; }
    if (customerBalance !== undefined && customerBalance <= 0) { toast.error("Cannot create payment receipt - customer balance is zero"); return; }
    if (customerInvoices && customerInvoices.length > 0 && selectedInvoiceIds.length === 0) { toast.error("Please select at least one pending invoice"); return; }
    const discountValue = parseFloat(discountAmount) || 0;
    if (discountValue > 0 && !discountReason.trim()) { toast.error("Please enter a discount reason"); return; }
    createVoucher.mutate();
  };

  const allCustomerPayments = vouchers
    ?.filter((v) => (v.reference_type === "customer" || v.reference_type === "customer_payment" || v.reference_type === "sale" || v.reference_type === "SALE") && (v.voucher_type === "receipt" || v.voucher_type === "RECEIPT"))
    .sort((a, b) => new Date(b.voucher_date).getTime() - new Date(a.voucher_date).getTime()) || [];
  
  const customerPayments = allCustomerPayments.filter((v) => {
    // Payment method filter
    if (paymentMethodFilter.length > 0) {
      const method = (v.payment_method || "").toLowerCase();
      if (!paymentMethodFilter.includes(method)) return false;
    }
    // Search filter
    if (paymentSearchTerm) {
      const invoice = sales?.find((s) => s.id === v.reference_id);
      let custName = "";
      if (invoice?.customer_name) custName = invoice.customer_name;
      else if (v.reference_type === 'customer') custName = customers?.find((c) => c.id === v.reference_id)?.customer_name || "";
      else if (invoice?.customer_id) custName = customers?.find((c) => c.id === invoice.customer_id)?.customer_name || "";
      const q = paymentSearchTerm.toLowerCase();
      if (!(custName.toLowerCase().includes(q) ||
        (v.voucher_number || "").toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q))) return false;
    }
    return true;
  });
  
  const totalPages = Math.ceil(customerPayments.length / CUSTOMER_PAYMENTS_PER_PAGE);
  const startIndex = (customerPaymentsPage - 1) * CUSTOMER_PAYMENTS_PER_PAGE;
  const endIndex = startIndex + CUSTOMER_PAYMENTS_PER_PAGE;
  const paginatedPayments = customerPayments.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Customer Payment Receipt (RCP)</span>
            {previewReceiptNumber && (
              <Badge variant="outline" className="text-lg font-mono bg-primary/10 text-primary border-primary/30">
                {previewReceiptNumber}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>Record payment received from customers</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-2">
                <Label>Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !voucherDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {voucherDate ? format(voucherDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={voucherDate} onSelect={(date) => date && setVoucherDate(date)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Customer Search */}
              <div className="space-y-2">
                <Label>Customer</Label>
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={customerSearchOpen} className="w-full justify-between">
                      {referenceId ? customersWithBalance?.find((c) => c.id === referenceId)?.customer_name || "Select customer" : "Select customer"}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput placeholder="Search customer by name or phone..." value={customerSearchTerm} onValueChange={setCustomerSearchTerm} />
                      <CommandList>
                        <CommandEmpty>{customersWithBalance?.length === 0 ? "No customers with outstanding balance" : "No customer found"}</CommandEmpty>
                        <CommandGroup>
                          {customersWithBalance
                            ?.filter((c) => {
                              if (!customerSearchTerm) return true;
                              const term = customerSearchTerm.toLowerCase();
                              return c.customer_name.toLowerCase().includes(term) || (c.phone?.toLowerCase().includes(term));
                            })
                            .slice(0, 50)
                            .map((customer) => (
                              <CommandItem
                                key={customer.id}
                                value={customer.id}
                                onSelect={() => {
                                  setReferenceId(customer.id);
                                  setSelectedInvoiceIds([]);
                                  setCustomerSearchOpen(false);
                                  setCustomerSearchTerm("");
                                }}
                                className="flex items-center justify-between"
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{customer.customer_name}</span>
                                  {customer.phone && <span className="text-xs text-muted-foreground">{customer.phone}</span>}
                                </div>
                                <Badge variant="destructive" className="ml-2">
                                  ₹{Math.round(customer.outstandingBalance).toLocaleString('en-IN')}
                                </Badge>
                                {referenceId === customer.id && <Check className="ml-2 h-4 w-4 text-primary" />}
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {referenceId && customerBalance !== undefined && (
                  <div className={cn("mt-2 p-3 border rounded-md", customerBalance <= 0 ? "bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800" : "bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800")}>
                    {customerBalance <= 0 ? (
                      <p className="text-sm font-medium text-red-900 dark:text-red-100">⚠️ No outstanding balance - Payment receipt not allowed</p>
                    ) : (
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Outstanding Balance: <span className="text-lg font-bold">₹{Math.round(customerBalance).toLocaleString('en-IN')}</span></p>
                    )}
                  </div>
                )}
                {/* Advance Balance Banner */}
                {referenceId && advanceBalance > 0 && customerBalance !== undefined && customerBalance > 0 && (
                  <div className="mt-2 p-3 border rounded-md bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-300 dark:border-emerald-700">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                          Advance Balance Available: <span className="text-lg font-bold">₹{Math.round(advanceBalance).toLocaleString('en-IN')}</span>
                        </p>
                      </div>
                      {selectedInvoiceIds.length > 0 && (
                        <Button
                          type="button"
                          size="sm"
                          variant="default"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={applyAdvanceMutation.isPending}
                          onClick={() => applyAdvanceMutation.mutate()}
                        >
                          <Wallet className="h-3.5 w-3.5 mr-1.5" />
                          {applyAdvanceMutation.isPending ? "Applying..." : `Apply ₹${Math.round(Math.min(advanceBalance, customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + Math.max(0, (inv.net_amount || 0) - (inv.paid_amount || 0)), 0) || 0)).toLocaleString('en-IN')} to Invoice`}
                        </Button>
                      )}
                    </div>
                    {selectedInvoiceIds.length === 0 && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Select invoice(s) below to apply advance balance</p>
                    )}
                  </div>
                )}
              </div>

              {/* Invoice Selection */}
              <div className="space-y-2 md:col-span-2">
                <Label>{customerInvoices && customerInvoices.length > 0 ? "Select Invoices (Required)" : "Select Invoices"}</Label>
                {!referenceId ? (
                  <p className="text-xs text-muted-foreground">Select a customer first</p>
                ) : customerInvoices?.length === 0 ? (
                  <div className="p-3 bg-muted/30 border rounded-md">
                    <p className="text-xs text-muted-foreground">No pending invoices - Payment will be applied to Opening Balance</p>
                  </div>
                ) : (
                  <>
                    <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
                      {customerInvoices?.map((invoice) => {
                        const balance = Number(invoice.net_amount || 0) - Number(invoice.paid_amount || 0);
                        const isSelected = selectedInvoiceIds.includes(invoice.id);
                        const invoiceDate = invoice.sale_date ? new Date(invoice.sale_date) : null;
                        const invoiceDateText = invoiceDate && !Number.isNaN(invoiceDate.getTime()) ? format(invoiceDate, "dd/MM/yy") : "-";
                        return (
                          <div key={invoice.id} className={cn("flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors", isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted")}
                            onClick={() => setSelectedInvoiceIds(prev => prev.includes(invoice.id) ? prev.filter(id => id !== invoice.id) : [...prev, invoice.id])}>
                            <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 rounded border-primary text-primary focus:ring-primary pointer-events-none" />
                            <div className="flex-1 flex justify-between items-center">
                              <span className="font-medium">{invoice.sale_number}</span>
                              <span className="text-sm text-muted-foreground">{invoiceDateText}</span>
                              <Badge variant={balance > 0 ? "destructive" : "secondary"}>₹{balance.toFixed(2)}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {selectedInvoiceIds.length === 0 && referenceId && (
                      <p className="text-xs text-red-600 dark:text-red-400">⚠️ Please select at least one invoice to proceed</p>
                    )}
                  </>
                )}
                {selectedInvoiceIds.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary" className="bg-primary/10">{selectedInvoiceIds.length} invoice(s) selected</Badge>
                    <span className="text-sm text-muted-foreground">
                      Total: ₹{customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0).toFixed(2)}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedInvoiceIds([])}>Clear</Button>
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={(value) => { setPaymentMethod(value); setChequeNumber(""); setChequeDate(undefined); setTransactionId(""); setUpiPaymentDate(undefined); }}>
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

              {/* Cheque fields */}
              {paymentMethod === 'cheque' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Cheque Number</Label>
                    <Input placeholder="Enter cheque number" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
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
                        <Calendar mode="single" selected={chequeDate} onSelect={setChequeDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {(paymentMethod === 'upi' || paymentMethod === 'other' || paymentMethod === 'bank_transfer') && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Transaction ID</Label>
                    <Input placeholder="Enter transaction ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
                  </div>
                  {paymentMethod === 'upi' && (
                    <div className="space-y-2">
                      <Label>UPI Payment Date</Label>
                      <Popover open={upiCalendarOpen} onOpenChange={setUpiCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start text-left font-normal">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {upiPaymentDate ? format(upiPaymentDate, "dd/MM/yyyy") : "Select date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={upiPaymentDate} onSelect={(date) => { setUpiPaymentDate(date); setUpiCalendarOpen(false); }} initialFocus className="pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                  )}
                </div>
              )}

              {/* Amount */}
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input type="number" step="0.01" placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} required />
              </div>

              {/* Discount Fields */}
              {(() => {
                const selectedInvoiceTotal = selectedInvoiceIds.length > 0
                  ? customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + (inv.net_amount - (inv.paid_amount || 0)), 0) || 0
                  : (customerBalance || 0);
                const paymentValue = parseFloat(amount) || 0;
                const suggestedDiscount = Math.max(0, selectedInvoiceTotal - paymentValue);
                const showDiscountFields = paymentValue > 0 && paymentValue < selectedInvoiceTotal;
                return showDiscountFields && (
                  <div className="space-y-4 p-4 border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 rounded-lg">
                    <div className="flex items-center gap-2 text-foreground">
                      <TrendingDown className="h-4 w-4" />
                      <span className="text-sm font-medium">Discount Settlement</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Discount Amount</Label>
                        <Input type="number" step="0.01" placeholder={`Suggested: ₹${suggestedDiscount.toFixed(2)}`} value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDiscountAmount(suggestedDiscount.toFixed(2))} className="text-xs text-primary hover:text-primary/80">
                          Apply ₹{suggestedDiscount.toFixed(2)} discount
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Discount Reason <span className="text-red-500">*</span></Label>
                        <Input placeholder="e.g., Customer loyalty" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} required={parseFloat(discountAmount) > 0} />
                      </div>
                    </div>
                    {parseFloat(discountAmount) > 0 && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                        <div className="flex justify-between items-center text-sm">
                          <span>Payment Amount:</span>
                          <span className="font-medium">₹{paymentValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-muted-foreground">
                          <span>+ Discount:</span>
                          <span className="font-medium">₹{parseFloat(discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between items-center text-sm font-bold text-green-700 dark:text-green-400">
                          <span>Total Settled:</span>
                          <span>₹{(paymentValue + parseFloat(discountAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {(paymentValue + parseFloat(discountAmount)) >= selectedInvoiceTotal && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-2">✓ Invoice(s) will be marked as fully paid</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Description */}
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Payment description" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            {/* Submit button with validation */}
            {(() => {
              const paymentAmount = parseFloat(amount) || 0;
              const discountValue = parseFloat(discountAmount) || 0;
              const totalSettled = paymentAmount + discountValue;
              const outstandingBalance = customerBalance || 0;
              const isExcessPayment = Math.round(totalSettled) > Math.round(outstandingBalance) && outstandingBalance > 0;
              const isZeroBalance = outstandingBalance <= 0;
              const isDisabled = isZeroBalance || isExcessPayment;
              return (
                <div className="space-y-2">
                  {isExcessPayment && (
                    <p className="text-sm text-red-600 dark:text-red-400">
                      ⚠️ Payment (₹{Math.round(totalSettled).toLocaleString('en-IN')}) exceeds outstanding balance (₹{Math.round(outstandingBalance).toLocaleString('en-IN')})
                    </p>
                  )}
                  <Button type="submit" className="w-full md:w-auto" disabled={isDisabled || createVoucher.isPending}>
                    <Plus className="mr-2 h-4 w-4" />
                    {createVoucher.isPending ? "Recording..." : "Record Payment"}
                  </Button>
                </div>
              );
            })()}
          </form>
        </CardContent>
      </Card>

      {/* Recent Customer Payments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Customer Payments</CardTitle>
          <div className="flex items-center gap-2">
            {isAdmin && selectedPaymentIds.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Selected ({selectedPaymentIds.length})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Selected Receipts?</AlertDialogTitle>
                    <AlertDialogDescription>This will delete {selectedPaymentIds.length} receipt(s) and reverse the amounts.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                      const selected = vouchers?.filter((v) => selectedPaymentIds.includes(v.id)) || [];
                      selected.forEach((v) => deleteReceipt.mutate(v));
                      setSelectedPaymentIds([]);
                    }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete & Reverse All
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search by customer name, voucher no, or description..."
              value={paymentSearchTerm}
              onChange={(e) => { setPaymentSearchTerm(e.target.value); setCustomerPaymentsPage(1); }}
              className="max-w-sm"
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead className="w-10"></TableHead>}
                <TableHead>Voucher No</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Description</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPayments.map((voucher) => {
                const invoice = sales?.find((s) => s.id === voucher.reference_id);
                let customerName = "-";
                if (invoice?.customer_name) {
                  customerName = invoice.customer_name;
                } else if (voucher.reference_type === 'customer') {
                  customerName = customers?.find((c) => c.id === voucher.reference_id)?.customer_name || "-";
                } else if (invoice?.customer_id) {
                  customerName = customers?.find((c) => c.id === invoice.customer_id)?.customer_name || "-";
                }
                const isSelected = selectedPaymentIds.includes(voucher.id);
                return (
                  <TableRow key={voucher.id} className={isSelected ? "bg-muted/50" : ""}>
                    {isAdmin && (
                      <TableCell>
                        <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                          if (checked) setSelectedPaymentIds([...selectedPaymentIds, voucher.id]);
                          else setSelectedPaymentIds(selectedPaymentIds.filter((id) => id !== voucher.id));
                        }} />
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{voucher.voucher_number}</TableCell>
                    <TableCell>{format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell>{customerName}</TableCell>
                    <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                    <TableCell className="uppercase text-xs">{voucher.payment_method || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {voucher.reference_type === 'customer' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Link to Invoice"
                              className="text-primary"
                              onClick={() => {
                                const cust = customers?.find((c) => c.id === voucher.reference_id);
                                setReassignPayment(voucher);
                                setReassignCustomerId(voucher.reference_id);
                                setReassignCustomerName(cust?.customer_name || "Customer");
                              }}
                            >
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Edit Payment" onClick={() => onEditPayment(voucher)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Print Receipt" onClick={() => {
                            const customer = voucher.reference_type === 'customer'
                              ? customers?.find((c) => c.id === voucher.reference_id)
                              : (invoice?.customer_id ? customers?.find((c) => c.id === invoice.customer_id) : null);
                            onShowReceipt({
                              voucherNumber: voucher.voucher_number, voucherDate: voucher.voucher_date,
                              customerName, customerPhone: customer?.phone || "", customerAddress: customer?.address || "",
                              invoiceNumber: voucher.description?.includes("Against Invoice") ? voucher.description.replace("Against Invoice: ", "") : voucher.description || "-",
                              invoiceDate: voucher.voucher_date, invoiceAmount: voucher.total_amount,
                              paidAmount: voucher.total_amount, paymentMethod: voucher.payment_method || "cash",
                              previousBalance: 0, currentBalance: 0
                            });
                          }}>
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">Showing {startIndex + 1}-{Math.min(endIndex, customerPayments.length)} of {customerPayments.length} receipts</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCustomerPaymentsPage(p => Math.max(1, p - 1))} disabled={customerPaymentsPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="text-sm font-medium px-2">Page {customerPaymentsPage} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCustomerPaymentsPage(p => Math.min(totalPages, p + 1))} disabled={customerPaymentsPage === totalPages}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reassign Payment Dialog */}
      {reassignPayment && (
        <ReassignPaymentDialog
          open={!!reassignPayment}
          onOpenChange={(open) => { if (!open) setReassignPayment(null); }}
          payment={reassignPayment}
          customerId={reassignCustomerId}
          customerName={reassignCustomerName}
          organizationId={organizationId}
        />
      )}
    </div>
  );
}
