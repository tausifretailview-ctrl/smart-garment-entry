import { useState, useEffect, useRef } from "react";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";
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
import { useUserRoles } from "@/hooks/useUserRoles";
import { ReassignPaymentDialog } from "./ReassignPaymentDialog";
import { useCustomerAdvanceBalance } from "@/hooks/useCustomerAdvances";

// Sentinel ID used to represent the customer's remaining Opening Balance
// as a selectable row inside the invoice picker.
const OPENING_BALANCE_ID = "__opening_balance__";
// Fix Apr 2026: subtract sale_return_adjust to match per-invoice outstanding.
// Test case: Mamta Footwear-Kandivali W (1ce7dbea-...) outstanding = ₹15,054
const getInvoiceOutstanding = (invoice: any, voucherPaid = 0) => {
  const net = Number(invoice?.net_amount || 0);
  const paid = Number(invoice?.paid_amount || 0);
  const srAdjust = Number(invoice?.sale_return_adjust || 0);
  const effectivePaid = Math.max(paid, Number(voucherPaid || 0));
  return Math.max(0, net - effectivePaid - srAdjust);
};
const toNumberOrZero = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const MIN_PENDING_RUPEE = 1;
const SETTLEMENT_TOLERANCE_RUPEE = 0.99;
const roundToRupee = (value: any) => Math.max(0, Math.round(toNumberOrZero(value)));
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
  const [allocatedAmounts, setAllocatedAmounts] = useState<Record<string, string>>({});
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
  const savingRef = useRef(false);

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
      const customerBalances = new Map<string, number>();
      allSales.forEach((sale: any) => {
        if (!sale?.customer_id) return;
        const outstanding = getInvoiceOutstanding(sale, invoiceVoucherPayments.get(sale.id) || 0);
        customerBalances.set(
          sale.customer_id,
          (customerBalances.get(sale.customer_id) || 0) + outstanding
        );
      });
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
        .not("payment_status", "in", '("cancelled","hold")')
        .is("deleted_at", null)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      const salesRows = data || [];
      const saleIds = salesRows.map((s: any) => s.id).filter(Boolean);
      if (saleIds.length === 0) return salesRows;

      const { data: voucherRows, error: vouchersError } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .eq("reference_type", "sale")
        .is("deleted_at", null)
        .in("reference_id", saleIds);
      if (vouchersError) throw vouchersError;

      const voucherPaidBySale = new Map<string, number>();
      (voucherRows || []).forEach((v: any) => {
        if (!v.reference_id) return;
        voucherPaidBySale.set(v.reference_id, (voucherPaidBySale.get(v.reference_id) || 0) + Number(v.total_amount || 0));
      });

      // KS Footwear payment-status sync (Apr 2026):
      // derive paid/status from receipts so fully settled invoices don't remain pending forever.
      const updates = salesRows
        .map((sale: any) => {
          const net = Number(sale.net_amount || 0);
          const srAdjust = Number(sale.sale_return_adjust || 0);
          const cap = Math.max(0, net - srAdjust);
          const effectivePaid = Math.min(cap, Math.max(Number(sale.paid_amount || 0), Number(voucherPaidBySale.get(sale.id) || 0)));
          const effectiveStatus =
            effectivePaid + srAdjust >= net - SETTLEMENT_TOLERANCE_RUPEE
              ? "completed"
              : effectivePaid > 0 || srAdjust > 0
                ? "partial"
                : "pending";
          return { sale, effectivePaid, effectiveStatus };
        })
        .filter(({ sale, effectivePaid, effectiveStatus }) =>
          Math.abs(Number(sale.paid_amount || 0) - effectivePaid) > 0.009 ||
          (sale.payment_status || "pending") !== effectiveStatus
        );

      if (updates.length > 0) {
        await Promise.all(
          updates.map(({ sale, effectivePaid, effectiveStatus }) =>
            supabase
              .from("sales")
              .update({ paid_amount: effectivePaid, payment_status: effectiveStatus })
              .eq("id", sale.id)
              .eq("organization_id", organizationId)
          )
        );
      }

      return salesRows.filter((sale: any) => {
        const outstanding = getInvoiceOutstanding(sale, voucherPaidBySale.get(sale.id) || 0);
        return outstanding >= MIN_PENDING_RUPEE;
      });
    },
    enabled: !!referenceId,
  });

  const { data: adjustedOutstandingCreditTotal = 0 } = useQuery({
    queryKey: ["customer-adjusted-outstanding-credit", organizationId, referenceId],
    queryFn: async () => {
      if (!organizationId || !referenceId) return 0;
      const { data, error } = await supabase
        .from("sale_returns")
        .select("net_amount")
        .eq("organization_id", organizationId)
        .eq("customer_id", referenceId)
        .eq("credit_status", "adjusted_outstanding")
        .is("deleted_at", null);
      if (error) throw error;
      return (data || []).reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
    },
    enabled: !!organizationId && !!referenceId,
  });

  const { data: customerInvoiceVoucherPayments = new Map<string, number>() } = useQuery({
    queryKey: ["customer-invoice-voucher-payments", organizationId, referenceId, customerInvoices?.length || 0],
    queryFn: async () => {
      const saleIds = (customerInvoices || []).map((s: any) => s.id).filter(Boolean);
      if (!organizationId || saleIds.length === 0) return new Map<string, number>();
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .eq("reference_type", "sale")
        .is("deleted_at", null)
        .in("reference_id", saleIds);
      if (error) throw error;
      const map = new Map<string, number>();
      (data || []).forEach((v: any) => {
        if (!v.reference_id) return;
        map.set(v.reference_id, (map.get(v.reference_id) || 0) + Number(v.total_amount || 0));
      });
      return map;
    },
    enabled: !!organizationId && !!referenceId && !!customerInvoices && customerInvoices.length > 0,
  });

  // Remaining Opening Balance for the selected customer
  // = customers.opening_balance − sum(receipt vouchers with reference_type='customer')
  const { data: openingBalanceRemaining = 0 } = useQuery({
    queryKey: ["customer-opening-balance-remaining", referenceId, organizationId],
    queryFn: async () => {
      if (!referenceId) return 0;
      const { data: cust } = await supabase
        .from("customers")
        .select("opening_balance")
        .eq("id", referenceId)
        .maybeSingle();
      const ob = Number(cust?.opening_balance || 0);
      if (ob <= 0) return 0;
      const { data: vouchersData } = await supabase
        .from("voucher_entries")
        .select("total_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .eq("reference_type", "customer")
        .eq("reference_id", referenceId)
        .is("deleted_at", null);
      const paid = (vouchersData || []).reduce(
        (s: number, v: any) => s + Number(v.total_amount || 0),
        0
      );
      return Math.max(0, ob - paid);
    },
    enabled: !!referenceId && !!organizationId,
  });

  // Customer balance — uses correct formula including balance adjustments
  const { balance: customerBalance } = useCustomerBalance(
    referenceId || null,
    organizationId
  );


  // Customer advance balance
  const { data: advanceBalance = 0 } = useCustomerAdvanceBalance(referenceId || null, organizationId);

  // Auto-fill amount
  const getAllocatedAmount = (invoiceId: string, fallbackOutstanding: number) => {
    const raw = allocatedAmounts[invoiceId];
    if (raw === undefined || raw === "") return roundToRupee(fallbackOutstanding);
    return roundToRupee(raw);
  };

  const getSelectedPayableTotal = () => {
    const invoicePart = customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id))
      .reduce((sum, inv) => {
        const outstanding = getInvoiceOutstanding(inv, customerInvoiceVoucherPayments.get(inv.id) || 0);
        const allocated = Math.min(outstanding, getAllocatedAmount(inv.id, outstanding));
        return sum + allocated;
      }, 0) || 0;
    const obPart = selectedInvoiceIds.includes(OPENING_BALANCE_ID)
        ? Number(openingBalanceRemaining || 0)
        : 0;
    const selectedSubtotal = invoicePart + obPart;
    const appliedCreditNotes = Math.min(Number(adjustedOutstandingCreditTotal || 0), selectedSubtotal);
    return Math.max(0, selectedSubtotal - appliedCreditNotes);
  };

  useEffect(() => {
    if (selectedInvoiceIds.length > 0 && customerInvoices) {
      setAmount(roundToRupee(getSelectedPayableTotal()).toFixed(2));
    }
  }, [selectedInvoiceIds, customerInvoices, openingBalanceRemaining, customerInvoiceVoucherPayments, adjustedOutstandingCreditTotal, allocatedAmounts]);

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceId("");
    setSelectedInvoiceIds([]);
    setAllocatedAmounts({});
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
      if (savingRef.current) {
        throw new Error('Save already in progress');
      }
      savingRef.current = true;
      try {
      if (!referenceId || selectedInvoiceIds.length === 0) throw new Error("Select customer and invoices");
      const invoicesToProcess = customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)) || [];
      if (invoicesToProcess.length === 0) throw new Error("No invoices selected");
      const totalOutstanding = invoicesToProcess.reduce((sum, inv) => sum + getInvoiceOutstanding(inv, customerInvoiceVoucherPayments.get(inv.id) || 0), 0);
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
        const outstanding = getInvoiceOutstanding(invoice, customerInvoiceVoucherPayments.get(invoice.id) || 0);
        const applyAmt = Math.min(remaining, outstanding);
        if (applyAmt <= 0) continue;
        const newPaid = (invoice.paid_amount || 0) + applyAmt;
        const newStatus = newPaid >= invoice.net_amount ? 'completed' : newPaid > 0 ? 'partial' : 'pending';
        await supabase.from('sales').update({ paid_amount: newPaid, payment_status: newStatus }).eq('id', invoice.id);
        const vNum = invoicesToProcess.length > 1 ? `${voucherNumber}-${idx + 1}` : voucherNumber;
        await supabase.from("voucher_entries").insert({ organization_id: organizationId, voucher_number: vNum, voucher_type: "receipt", voucher_date: format(new Date(), "yyyy-MM-dd"), reference_type: 'sale', reference_id: invoice.id, description: `Adjusted from advance balance for ${invoice.sale_number}`, total_amount: applyAmt, payment_method: 'advance_adjustment' });
        if (referenceId) {
          insertLedgerCredit({
            organizationId,
            customerId: referenceId,
            voucherType: 'RECEIPT',
            voucherNo: vNum,
            particulars: `Advance adjusted for ${invoice.sale_number}`,
            transactionDate: format(new Date(), "yyyy-MM-dd"),
            amount: applyAmt,
          });
        }
        remaining -= applyAmt;
        idx++;
      }
      return { applied: amountToApply - remaining };
      } finally {
        savingRef.current = false;
      }
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
      setAllocatedAmounts({});
    },
    onError: (error: Error) => toast.error(`Failed to apply advance: ${error.message}`),
  });

  // Create voucher mutation
  const createVoucher = useMutation({
    mutationFn: async () => {
      if (savingRef.current) {
        throw new Error('Save already in progress');
      }
      savingRef.current = true;
      try {
      const includesOpeningBalance = selectedInvoiceIds.includes(OPENING_BALANCE_ID);
      const invoicesToProcess = selectedInvoiceIds.filter(id => id !== OPENING_BALANCE_ID);
      if (!referenceId) throw new Error("Please select a customer to record payment");
      const paymentAmount = roundToRupee(amount);
      const discountValue = roundToRupee(discountAmount);
      let remainingCash = paymentAmount;
      let remainingDiscount = discountValue;
      /** Apply settlement to invoices/OB: use cash first, then discount (matches “received + waived” mentally). */
      const takeFromPool = (totalNeedRaw: number) => {
        const t = roundToRupee(totalNeedRaw);
        if (t <= 0) return { cash: 0, discount: 0 };
        let c = Math.min(remainingCash, t);
        let d = t - c;
        if (d > remainingDiscount) {
          d = remainingDiscount;
          c = t - d;
        }
        remainingCash = roundToRupee(remainingCash - c);
        remainingDiscount = roundToRupee(remainingDiscount - d);
        return { cash: c, discount: d };
      };

      const processedInvoices: any[] = [];
      // Treat as opening-balance-only when nothing real is selected and either OB row is selected,
      // or no invoices exist at all (legacy behaviour).
      const isOpeningBalancePayment = invoicesToProcess.length === 0;
      let openingBalanceApplied = 0;
      let openingBalanceCash = 0;
      let openingBalanceDiscount = 0;

      // If user selected the Opening Balance row alongside invoices, settle OB FIRST
      // up to its remaining amount, then apply the rest to invoices.
      if (includesOpeningBalance && invoicesToProcess.length > 0) {
        const obRemaining = roundToRupee(openingBalanceRemaining);
        const pool = remainingCash + remainingDiscount;
        openingBalanceApplied = Math.min(pool, obRemaining);
        const split = takeFromPool(openingBalanceApplied);
        openingBalanceCash = split.cash;
        openingBalanceDiscount = split.discount;
      }

      if (invoicesToProcess.length > 0) {
        for (const invoiceId of invoicesToProcess) {
          const pool = remainingCash + remainingDiscount;
          if (pool <= 0) break;
          const invoice = customerInvoices?.find(inv => inv.id === invoiceId);
          if (!invoice) continue;
          const currentPaid = invoice.paid_amount || 0;
          const outstanding = getInvoiceOutstanding(invoice, customerInvoiceVoucherPayments.get(invoiceId) || 0);
          const allocatedForInvoice = getAllocatedAmount(invoiceId, outstanding);
          const amountToApply = Math.min(pool, outstanding, allocatedForInvoice);
          if (amountToApply <= 0) continue;
          const { cash: cashApplied, discount: discountApplied } = takeFromPool(amountToApply);
          const projectedPaidAmount = currentPaid + amountToApply;
          processedInvoices.push({
            invoice,
            amountApplied: amountToApply,
            cashApplied,
            discountApplied,
            newPaidAmount: projectedPaidAmount,
            previousBalance: outstanding,
            currentBalance: outstanding - amountToApply,
          });
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
        // Optional Opening Balance leg, when mixed with invoices
        if (includesOpeningBalance && openingBalanceApplied > 0) {
          const obVoucherNumber = `${voucherNumber}-OB`;
          const obDiscSuffix =
            openingBalanceDiscount > 0
              ? ` | Discount: ₹${openingBalanceDiscount.toFixed(2)}${discountReason ? ` (${discountReason})` : ""}`
              : "";
          const { data: obVoucher, error: obErr } = await supabase.from("voucher_entries").insert({
            organization_id: organizationId,
            voucher_number: obVoucherNumber,
            voucher_type: "receipt",
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: 'customer',
            reference_id: referenceId,
            description: `Opening Balance Payment${paymentDetails}${obDiscSuffix}`,
            total_amount: openingBalanceApplied,
            discount_amount: openingBalanceDiscount,
            discount_reason: openingBalanceDiscount > 0 ? discountReason || null : null,
            payment_method: paymentMethod,
          }).select().single();
          if (obErr) throw obErr;
          createdVouchers.push(obVoucher);
          if (referenceId) {
            if (openingBalanceCash > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: obVoucherNumber,
                particulars: "Opening Balance Receipt",
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: openingBalanceCash,
              });
            }
            if (openingBalanceDiscount > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: obVoucherNumber,
                particulars: `Opening Balance — settlement discount${discountReason ? ` (${discountReason})` : ""}`,
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: openingBalanceDiscount,
              });
            }
          }
        }
        for (let i = 0; i < processedInvoices.length; i++) {
          const processed = processedInvoices[i];
          const invoiceVoucherNumber = processedInvoices.length > 1 ? `${voucherNumber}-${i + 1}` : voucherNumber;
          const invoiceDescription = `Payment for ${processed.invoice.sale_number}${paymentDetails}`;
          const invoiceDiscountSuffix =
            processed.discountApplied > 0
              ? ` | Discount: ₹${processed.discountApplied.toFixed(2)}${discountReason ? ` (${discountReason})` : ""}`
              : "";
          const { data: voucher, error: voucherError } = await supabase.from("voucher_entries").insert({
            organization_id: organizationId,
            voucher_number: invoiceVoucherNumber,
            voucher_type: "receipt",
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: 'sale',
            reference_id: processed.invoice.id,
            description: invoiceDescription + invoiceDiscountSuffix,
            total_amount: processed.amountApplied,
            discount_amount: processed.discountApplied,
            discount_reason: processed.discountApplied > 0 ? discountReason || null : null,
            payment_method: paymentMethod,
          }).select().single();
          if (voucherError) throw voucherError;
          createdVouchers.push(voucher);
          if (referenceId) {
            if (processed.cashApplied > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: invoiceVoucherNumber,
                particulars: `Receipt for ${processed.invoice.sale_number}`,
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: processed.cashApplied,
              });
            }
            if (processed.discountApplied > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: invoiceVoucherNumber,
                particulars: `Settlement discount — ${processed.invoice.sale_number}${discountReason ? ` (${discountReason})` : ""}`,
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: processed.discountApplied,
              });
            }
          }
        }
      } else {
        const fullSettlement = paymentAmount + discountValue;
        const { data: voucher, error: voucherError } = await supabase.from("voucher_entries").insert({
          organization_id: organizationId,
          voucher_number: voucherNumber,
          voucher_type: "receipt",
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          reference_type: isOpeningBalancePayment ? 'customer' : 'sale',
          reference_id: isOpeningBalancePayment ? referenceId : processedInvoices[0]?.invoice.id || referenceId,
          description: finalDescription + discountSuffix,
          total_amount: fullSettlement,
          discount_amount: discountValue,
          discount_reason: discountReason || null,
          payment_method: paymentMethod,
        }).select().single();
        if (voucherError) throw voucherError;
        createdVouchers.push(voucher);
        if (referenceId) {
          if (isOpeningBalancePayment) {
            if (paymentAmount > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: voucherNumber,
                particulars: 'Opening Balance Receipt',
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: paymentAmount,
              });
            }
            if (discountValue > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: voucherNumber,
                particulars: `Opening Balance — settlement discount${discountReason ? ` (${discountReason})` : ""}`,
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: discountValue,
              });
            }
          } else {
            if (paymentAmount > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: voucherNumber,
                particulars: 'Receipt',
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: paymentAmount,
              });
            }
            if (discountValue > 0) {
              insertLedgerCredit({
                organizationId,
                customerId: referenceId,
                voucherType: 'RECEIPT',
                voucherNo: voucherNumber,
                particulars: `Settlement discount${discountReason ? ` (${discountReason})` : ""}`,
                transactionDate: format(voucherDate, "yyyy-MM-dd"),
                amount: discountValue,
              });
            }
          }
        }
      }

      // After voucher creation succeeds, update all allocated invoices in parallel.
      if (processedInvoices.length > 0) {
        await Promise.all(
          processedInvoices.map(async (processed) => {
            const invoiceId = processed.invoice.id;
            const allocatedAmount = Number(processed.amountApplied || 0);
            if (allocatedAmount <= 0) return;

            const { data: sale, error: saleError } = await supabase
              .from("sales")
              .select("paid_amount, net_amount, sale_return_adjust")
              .eq("id", invoiceId)
              .eq("organization_id", organizationId)
              .single();
            if (saleError) throw saleError;

            const netAmount = Number(sale?.net_amount || 0);
            const saleReturnAdjust = Number((sale as any)?.sale_return_adjust || 0);
            const payableCap = Math.max(0, netAmount - saleReturnAdjust);
            const newPaidAmount = Math.min(payableCap, Number(sale?.paid_amount || 0) + allocatedAmount);
            const newStatus = (newPaidAmount + saleReturnAdjust) >= (netAmount - SETTLEMENT_TOLERANCE_RUPEE) ? "completed" : "partial";

            const { error: updateError } = await supabase
              .from("sales")
              .update({
                paid_amount: newPaidAmount,
                payment_status: newStatus,
                payment_date: format(voucherDate, "yyyy-MM-dd"),
              })
              .eq("id", invoiceId)
              .eq("organization_id", organizationId);
            if (updateError) throw updateError;
          })
        );
      }

      return { voucherNumber, processedInvoices, isOpeningBalancePayment, paymentMethod, discountAmount: discountValue, discountReason };
      } finally {
        savingRef.current = false;
      }
    },
    onSuccess: (data) => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["next-receipt-number"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger-statement"] });

      const totalPaid = roundToRupee(amount);
      const discountValue = data.discountAmount || 0;
      queryClient.invalidateQueries({ queryKey: ["customer-opening-balance-remaining"] });

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
      return { voucherId, paymentAmount, voucherNumber: payment.voucher_number };
    },
    onSuccess: (data) => {
      if (data.voucherNumber && organizationId) {
        deleteLedgerEntries({ organizationId, voucherNo: data.voucherNumber, voucherTypes: ['RECEIPT'] });
      }
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
    if (!amount || roundToRupee(amount) <= 0) { toast.error("Please enter a valid amount"); return; }
    if (!referenceId) { toast.error("Please select a customer"); return; }
    if (selectedInvoiceIds.length > 0) {
      const selectedPayable = getSelectedPayableTotal();
      const pay = roundToRupee(amount);
      const disc = roundToRupee(discountAmount);
      if (pay > roundToRupee(selectedPayable)) {
        toast.error(`Amount cannot exceed pending total of ₹${selectedPayable.toFixed(2)}`);
        setAmount(roundToRupee(selectedPayable).toFixed(2));
        return;
      }
      if (pay + disc > roundToRupee(selectedPayable) + SETTLEMENT_TOLERANCE_RUPEE) {
        toast.error(`Payment + discount cannot exceed selected pending total of ₹${selectedPayable.toFixed(2)}`);
        return;
      }
    }
    if (customerBalance !== undefined && customerBalance <= 0) { toast.error("Cannot create payment receipt - customer balance is zero"); return; }
    const hasSelectableRows = (customerInvoices && customerInvoices.length > 0) || openingBalanceRemaining > 0;
    if (hasSelectableRows && selectedInvoiceIds.length === 0) { toast.error("Please select at least one invoice or Opening Balance"); return; }
    const discountValue = roundToRupee(discountAmount);
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
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                                  setAllocatedAmounts({});
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
                          {applyAdvanceMutation.isPending ? "Applying..." : `Apply ₹${Math.round(Math.min(advanceBalance, customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + getInvoiceOutstanding(inv, customerInvoiceVoucherPayments.get(inv.id) || 0), 0) || 0)).toLocaleString('en-IN')} to Invoice`}
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
                <Label>{(customerInvoices && customerInvoices.length > 0) || openingBalanceRemaining > 0 ? "Select Invoices (Required)" : "Select Invoices"}</Label>
                {!referenceId ? (
                  <p className="text-xs text-muted-foreground">Select a customer first</p>
                ) : (customerInvoices?.length === 0 && openingBalanceRemaining <= 0) ? (
                  <div className="p-3 bg-muted/30 border rounded-md">
                    <p className="text-xs text-muted-foreground">No pending invoices - Payment will be applied to Opening Balance</p>
                  </div>
                ) : (
                  <>
                    <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-2 bg-muted/30">
                      {openingBalanceRemaining > 0 && (() => {
                        const isSelected = selectedInvoiceIds.includes(OPENING_BALANCE_ID);
                        return (
                          <div
                            key={OPENING_BALANCE_ID}
                            className={cn("flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors", isSelected ? "bg-amber-100/60 dark:bg-amber-900/20 border border-amber-400/40" : "hover:bg-muted")}
                            onClick={() => setSelectedInvoiceIds(prev => prev.includes(OPENING_BALANCE_ID) ? prev.filter(id => id !== OPENING_BALANCE_ID) : [...prev, OPENING_BALANCE_ID])}
                          >
                            <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 rounded border-primary text-primary focus:ring-primary pointer-events-none" />
                            <div className="flex-1 flex justify-between items-center">
                              <span className="font-medium text-amber-700 dark:text-amber-400">Opening Balance</span>
                              <span className="text-sm text-muted-foreground">—</span>
                              <Badge variant="destructive">₹{Number(openingBalanceRemaining).toFixed(2)}</Badge>
                            </div>
                          </div>
                        );
                      })()}
                      {customerInvoices?.map((invoice) => {
                        const balance = getInvoiceOutstanding(invoice, customerInvoiceVoucherPayments.get(invoice.id) || 0);
                        const roundedBalance = roundToRupee(balance);
                        const isSelected = selectedInvoiceIds.includes(invoice.id);
                        const invoiceDate = invoice.sale_date ? new Date(invoice.sale_date) : null;
                        const invoiceDateText = invoiceDate && !Number.isNaN(invoiceDate.getTime()) ? format(invoiceDate, "dd/MM/yy") : "-";
                        return (
                          <div key={invoice.id} className={cn("flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors", isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-muted")}
                            onClick={() => {
                              setSelectedInvoiceIds(prev => {
                                const exists = prev.includes(invoice.id);
                                if (exists) {
                                  setAllocatedAmounts((old) => {
                                    const next = { ...old };
                                    delete next[invoice.id];
                                    return next;
                                  });
                                  return prev.filter(id => id !== invoice.id);
                                }
                                setAllocatedAmounts((old) => ({ ...old, [invoice.id]: roundedBalance.toFixed(2) }));
                                return [...prev, invoice.id];
                              });
                            }}>
                            <input type="checkbox" checked={isSelected} readOnly className="h-4 w-4 rounded border-primary text-primary focus:ring-primary pointer-events-none" />
                            <div className="flex-1 flex justify-between items-center gap-3">
                              <span className="font-medium">{invoice.sale_number}</span>
                              <span className="text-sm text-muted-foreground">{invoiceDateText}</span>
                              <Badge variant={roundedBalance > 0 ? "destructive" : "secondary"}>₹{roundedBalance.toFixed(2)}</Badge>
                              {isSelected && (
                                <Input
                                  type="number"
                                  step="1"
                                  className="h-8 w-28"
                                  value={allocatedAmounts[invoice.id] ?? roundedBalance.toFixed(2)}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === "") {
                                      setAllocatedAmounts((old) => ({ ...old, [invoice.id]: "" }));
                                      return;
                                    }
                                    const next = Math.min(roundedBalance, roundToRupee(raw));
                                    setAllocatedAmounts((old) => ({ ...old, [invoice.id]: next.toFixed(2) }));
                                  }}
                                />
                              )}
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
                    <div className="text-sm text-muted-foreground">
                      {(() => {
                        const selectedSubtotal =
                          (customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => {
                            const outstanding = getInvoiceOutstanding(inv, customerInvoiceVoucherPayments.get(inv.id) || 0);
                            return sum + Math.min(outstanding, getAllocatedAmount(inv.id, outstanding));
                          }, 0) || 0)
                          + (selectedInvoiceIds.includes(OPENING_BALANCE_ID) ? Number(openingBalanceRemaining || 0) : 0);
                        const appliedCreditNotes = Math.min(Number(adjustedOutstandingCreditTotal || 0), selectedSubtotal);
                        const grandTotal = Math.max(0, selectedSubtotal - appliedCreditNotes);
                        return (
                          <div className="space-y-0.5">
                            <div>Subtotal: ₹{selectedSubtotal.toFixed(2)}</div>
                            <div className="text-emerald-700 dark:text-emerald-400">Less: Applied Credit Notes: -₹{appliedCreditNotes.toFixed(2)}</div>
                            <div className="font-semibold text-foreground">Grand Total: ₹{grandTotal.toFixed(2)}</div>
                          </div>
                        );
                      })()}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedInvoiceIds([]); setAllocatedAmounts({}); }}>Clear</Button>
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
                <Input
                  type="number"
                  step="1"
                  placeholder="Enter amount"
                  value={amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setAmount("");
                      return;
                    }
                    const entered = roundToRupee(raw);
                    const maxAllowed = selectedInvoiceIds.length > 0 ? roundToRupee(getSelectedPayableTotal()) : Infinity;
                    setAmount(Math.min(entered, maxAllowed).toFixed(2));
                  }}
                  required
                />
              </div>

              {/* Discount Fields */}
              {(() => {
                const invoicePart = customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => {
                  const outstanding = getInvoiceOutstanding(inv, customerInvoiceVoucherPayments.get(inv.id) || 0);
                  return sum + Math.min(outstanding, getAllocatedAmount(inv.id, outstanding));
                }, 0) || 0;
                const obPart = selectedInvoiceIds.includes(OPENING_BALANCE_ID) ? Number(openingBalanceRemaining || 0) : 0;
                const selectedSubtotal = invoicePart + obPart;
                const appliedCreditNotes = Math.min(Number(adjustedOutstandingCreditTotal || 0), selectedSubtotal);
                const selectedInvoiceTotal = selectedInvoiceIds.length > 0
                  ? Math.max(0, selectedSubtotal - appliedCreditNotes)
                  : (customerBalance || 0);
                const paymentValue = roundToRupee(amount);
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
                        <Input
                          type="number"
                          step="1"
                          placeholder={`Suggested: ₹${roundToRupee(suggestedDiscount).toFixed(2)}`}
                          value={discountAmount}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setDiscountAmount("");
                              return;
                            }
                            setDiscountAmount(roundToRupee(raw).toFixed(2));
                          }}
                        />
                        <Button type="button" variant="ghost" size="sm" onClick={() => setDiscountAmount(roundToRupee(suggestedDiscount).toFixed(2))} className="text-xs text-primary hover:text-primary/80">
                          Apply ₹{suggestedDiscount.toFixed(2)} discount
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Label>Discount Reason <span className="text-red-500">*</span></Label>
                        <Input placeholder="e.g., Customer loyalty" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} required={roundToRupee(discountAmount) > 0} />
                      </div>
                    </div>
                    {roundToRupee(discountAmount) > 0 && (
                      <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                        <div className="flex justify-between items-center text-sm">
                          <span>Payment Amount:</span>
                          <span className="font-medium">₹{paymentValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm text-muted-foreground">
                          <span>+ Discount:</span>
                          <span className="font-medium">₹{roundToRupee(discountAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        <Separator className="my-2" />
                        <div className="flex justify-between items-center text-sm font-bold text-green-700 dark:text-green-400">
                          <span>Total Settled:</span>
                          <span>₹{(paymentValue + roundToRupee(discountAmount)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {(paymentValue + roundToRupee(discountAmount)) >= selectedInvoiceTotal && (
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
              const paymentAmount = roundToRupee(amount);
              const discountValue = roundToRupee(discountAmount);
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
                  <Button type="submit" className="w-full md:w-auto" disabled={isDisabled || createVoucher.isPending || savingRef.current}>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="mr-2 h-4 w-4" />
                  Payment Mode{paymentMethodFilter.length > 0 ? ` (${paymentMethodFilter.length})` : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Filter by Method</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {["cash", "cheque", "upi", "bank_transfer", "advance_adjustment", "other"].map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m}
                    checked={paymentMethodFilter.includes(m)}
                    onCheckedChange={(checked) => {
                      setCustomerPaymentsPage(1);
                      setPaymentMethodFilter((prev) =>
                        checked ? [...prev, m] : prev.filter((x) => x !== m)
                      );
                    }}
                    className="uppercase text-xs"
                  >
                    {m.replace("_", " ")}
                  </DropdownMenuCheckboxItem>
                ))}
                {paymentMethodFilter.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => { setPaymentMethodFilter([]); setCustomerPaymentsPage(1); }}>
                      Clear filters
                    </Button>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
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
                <TableHead>Payment Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Cheque/Txn Date</TableHead>
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
                // Extract cheque/UPI date from description (format: ", Date: dd/MM/yyyy" or ", UPI Date: dd/MM/yyyy")
                const desc = voucher.description || "";
                const dateMatch = desc.match(/(?:UPI Date|Date):\s*(\d{2}\/\d{2}\/\d{4})/);
                const extractedDate = dateMatch ? dateMatch[1] : "-";
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
                    <TableCell className="text-xs tabular-nums">{extractedDate}</TableCell>
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
