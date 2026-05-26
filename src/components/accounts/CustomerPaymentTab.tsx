import { useState, useEffect, useRef, useMemo } from "react";
import { useCustomerBalance } from "@/hooks/useCustomerBalance";
import { insertLedgerCredit, deleteLedgerEntries } from "@/lib/customerLedger";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import {
  deleteJournalEntryByReference,
  recordCustomerAdvanceApplicationJournalEntry,
  recordCustomerReceiptJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { reverseCustomerAdvanceFifo } from "@/utils/reverseCustomerAdvanceFifo";
import {
  fetchAllCustomers,
  fetchAllSalesSummary,
  fetchCustomerTrueOutstandingMap,
} from "@/utils/fetchAllRows";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileListCard } from "@/components/mobile/MobileListCard";
import { AdaptiveCustomerPicker } from "@/components/mobile/AdaptiveCustomerPicker";
import { AdaptivePaymentMethodPicker } from "@/components/mobile/AdaptivePaymentMethodPicker";
import { ReassignPaymentDialog } from "./ReassignPaymentDialog";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import { invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import {
  consumeAdvanceFIFO,
  createReceiptVoucher,
  derivePaidAndStatus,
  warnSettlementPathMismatch,
} from "@/utils/saleSettlement";
import {
  reconcileSaleInvoiceDisplay,
  splitSaleLinkedReceiptRows,
  type SaleReceiptVoucherSplit,
} from "@/utils/customerBalanceUtils";
// Sentinel ID used to represent the customer's remaining Opening Balance
// as a selectable row inside the invoice picker.
const OPENING_BALANCE_ID = "__opening_balance__";
/** Per-invoice due — same rules as Sales Invoice Dashboard (avoids double-counting CN in paid_amount + sr). */
const getInvoiceOutstanding = (invoice: any, split?: SaleReceiptVoucherSplit | null) => {
  const s = split ?? { cash: 0, cn: 0, adv: 0, discount: 0 };
  const voucherBucketSum = s.cash + s.adv + s.cn;
  const paidForReconcile = Math.max(0, Number(invoice?.paid_amount || 0) - voucherBucketSum);
  return reconcileSaleInvoiceDisplay({
    net_amount: Number(invoice?.net_amount || 0),
    sale_return_adjust: Number(invoice?.sale_return_adjust || 0),
    paid_amount: paidForReconcile,
    split: s,
  }).outstanding;
};
const toNumberOrZero = (value: any) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const MIN_PENDING_RUPEE = 1;
const SETTLEMENT_TOLERANCE_RUPEE = 0.99;
const roundToRupee = (value: any) => Math.max(0, Math.round(toNumberOrZero(value)));

/** Settlement (invoice total), optional % discount → cash received + discount rupees. */
function resolvePaymentBreakdown(
  settlementRaw: string,
  discountPercentRaw: string,
  discountAmountRaw: string,
) {
  const settlement = roundToRupee(settlementRaw);
  const pct = Math.min(100, Math.max(0, toNumberOrZero(discountPercentRaw)));
  let discount = 0;
  if (pct > 0 && settlement > 0) {
    discount = roundToRupee((settlement * pct) / 100);
  } else {
    discount = roundToRupee(discountAmountRaw);
    if (discount > settlement && settlement > 0) discount = settlement;
  }
  const cash = roundToRupee(Math.max(0, settlement - discount));
  return { settlement, discount, cash, discountPercent: pct };
}

/** Ledger-consistent paid_amount / status from receipt vouchers (avoids double-counting with paid_amount). */
async function syncSalePaymentFromVouchers(
  invoiceId: string,
  organizationId: string,
  voucherDateYmd: string,
  client: typeof supabase,
) {
  const { data: freshSale, error: saleErr } = await client
    .from("sales")
    .select("net_amount, paid_amount, sale_return_adjust")
    .eq("id", invoiceId)
    .eq("organization_id", organizationId)
    .single();
  if (saleErr) throw saleErr;

  const { data: receiptRows, error: vchErr } = await client
    .from("voucher_entries")
    .select("reference_id, total_amount, payment_method, description, discount_amount")
    .eq("organization_id", organizationId)
    .eq("reference_id", invoiceId)
    .in("reference_type", ["sale", "customer"])
    .eq("voucher_type", "receipt")
    .is("deleted_at", null);
  if (vchErr) throw vchErr;

  const splitMap = splitSaleLinkedReceiptRows(receiptRows || []);
  const split = splitMap.get(invoiceId) ?? { cash: 0, cn: 0, adv: 0, discount: 0 };
  const { paidAmount, paymentStatus } = derivePaidAndStatus({
    netAmount: Number(freshSale.net_amount || 0),
    saleReturnAdjust: Number(freshSale.sale_return_adjust || 0),
    cashReceived: split.cash,
    advanceApplied: split.adv,
    cnApplied: split.cn,
    discountGiven: split.discount,
  });

  const { error: updErr } = await client
    .from("sales")
    .update({
      paid_amount: paidAmount,
      payment_status: paymentStatus,
      payment_date: voucherDateYmd,
    })
    .eq("id", invoiceId)
    .eq("organization_id", organizationId);
  if (updErr) throw updErr;
  return reconcileSaleInvoiceDisplay({
    net_amount: Number(freshSale.net_amount || 0),
    sale_return_adjust: Number(freshSale.sale_return_adjust || 0),
    paid_amount: paidAmount,
    split,
  });
}

async function rollbackCustomerReceiptVouchers(
  organizationId: string,
  created: Array<{ id: string }>,
  client: typeof supabase
) {
  for (const v of [...created].reverse()) {
    await deleteJournalEntryByReference(organizationId, "CustomerReceipt", v.id, client);
    await client.from("voucher_entries").delete().eq("id", v.id);
  }
}

interface CustomerPaymentTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
  sales: any[] | undefined;
  customers: any[] | undefined;
  settings: any;
  onShowReceipt: (receiptData: any) => void;
  onShowAdvanceDialog: () => void;
  onEditPayment: (voucher: any) => void;
  /** Hide recent-payments list (floating payments window shows shared history panel). */
  embedded?: boolean;
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
  embedded = false,
}: CustomerPaymentTabProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRoles();
  const isMobile = useIsMobile();

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
  const [discountPercent, setDiscountPercent] = useState("");
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

  // Fetch customers with balance (same RPC as Customer Ledger / audit)
  const { data: customersWithBalance } = useQuery({
    queryKey: ["customers-with-balance", organizationId, "true-outstanding-rpc"],
    queryFn: async () => {
      const [allCustomers, allSales, { data: advances, error: advancesError }] = await Promise.all([
        fetchAllCustomers(organizationId),
        fetchAllSalesSummary(organizationId),
        supabase.from("customer_advances").select("customer_id").eq("organization_id", organizationId),
      ]);
      if (advancesError) throw advancesError;

      const activeCustomerIds = new Set<string>();
      allSales.forEach((s: { customer_id?: string | null }) => {
        if (s.customer_id) activeCustomerIds.add(s.customer_id);
      });
      (advances || []).forEach((a: { customer_id: string }) => activeCustomerIds.add(a.customer_id));

      const candidates = allCustomers.filter(
        (c: { id: string; opening_balance?: number | null }) =>
          activeCustomerIds.has(c.id) || Math.abs(Number(c.opening_balance || 0)) > 0.01,
      );

      const balanceMap = await fetchCustomerTrueOutstandingMap(
        organizationId,
        candidates.map((c: { id: string }) => c.id),
      );

      return allCustomers
        .map((c: any) => ({
          ...c,
          outstandingBalance: balanceMap.get(c.id) ?? 0,
        }))
        .filter((c: { outstandingBalance: number }) => c.outstandingBalance > 0);
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
        .select("reference_id, total_amount, discount_amount, payment_method, description")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        // Phase 1.2: include mis-tagged customer rows for this customer's sale ids.
        .in("reference_type", ["sale", "customer"])
        .is("deleted_at", null)
        .in("reference_id", saleIds);
      if (vouchersError) throw vouchersError;

      const splitBySale = splitSaleLinkedReceiptRows(voucherRows || []);

      // Sync paid_amount / payment_status from receipt vouchers (ledger-consistent).
      const updates = salesRows
        .map((sale: any) => {
          const split = splitBySale.get(sale.id) ?? { cash: 0, cn: 0, adv: 0, discount: 0 };
          const voucherBucketSum = split.cash + split.adv + split.cn;
          const paidForReconcile = Math.max(0, Number(sale.paid_amount || 0) - voucherBucketSum);
          const rec = reconcileSaleInvoiceDisplay({
            net_amount: Number(sale.net_amount || 0),
            sale_return_adjust: Number(sale.sale_return_adjust || 0),
            paid_amount: paidForReconcile,
            split,
          });
          const { paymentStatus: effectiveStatus } = derivePaidAndStatus({
            netAmount: Number(sale.net_amount || 0),
            saleReturnAdjust: Number(sale.sale_return_adjust || 0),
            cashReceived: split.cash,
            advanceApplied: split.adv,
            cnApplied: split.cn,
            discountGiven: 0,
            paymentMethod: sale.payment_method,
          });
          warnSettlementPathMismatch(
            "CustomerPaymentTab.normalizeSync",
            rec.payment_status,
            effectiveStatus,
          );
          return { sale, normalizedPaid: rec.paid_amount, normalizedStatus: rec.payment_status };
        })
        .filter(({ sale, normalizedPaid, normalizedStatus }) =>
          Math.abs(Number(sale.paid_amount || 0) - normalizedPaid) > 0.009 ||
          (sale.payment_status || "pending") !== normalizedStatus
        );

      if (updates.length > 0) {
        await Promise.all(
          updates.map(({ sale, normalizedPaid, normalizedStatus }) =>
            supabase
              .from("sales")
              .update({ paid_amount: normalizedPaid, payment_status: normalizedStatus })
              .eq("id", sale.id)
              .eq("organization_id", organizationId)
          )
        );
      }

      return salesRows.filter((sale: any) => {
        const outstanding = getInvoiceOutstanding(sale, splitBySale.get(sale.id));
        return outstanding >= MIN_PENDING_RUPEE;
      });
    },
    enabled: !!referenceId,
  });

  const { data: customerInvoiceVoucherSplits = new Map<string, SaleReceiptVoucherSplit>() } = useQuery({
    queryKey: ["customer-invoice-voucher-splits", organizationId, referenceId, customerInvoices?.length || 0],
    queryFn: async () => {
      const saleIds = (customerInvoices || []).map((s: any) => s.id).filter(Boolean);
      if (!organizationId || saleIds.length === 0) return new Map<string, SaleReceiptVoucherSplit>();
      const { data, error } = await supabase
        .from("voucher_entries")
        .select("reference_id, total_amount, discount_amount, payment_method, description")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        // Phase 1.2: include mis-tagged customer rows for this customer's sale ids.
        .in("reference_type", ["sale", "customer"])
        .is("deleted_at", null)
        .in("reference_id", saleIds);
      if (error) throw error;
      return splitSaleLinkedReceiptRows(data || []);
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
        .select("total_amount, discount_amount")
        .eq("organization_id", organizationId)
        .eq("voucher_type", "receipt")
        .eq("reference_type", "customer")
        .eq("reference_id", referenceId)
        .is("deleted_at", null);
      const paid = (vouchersData || []).reduce(
        (s: number, v: any) => s + Number(v.total_amount || 0) + Number(v.discount_amount || 0),
        0,
      );
      return Math.max(0, ob - paid);
    },
    enabled: !!referenceId && !!organizationId,
  });

  const { balance: customerBalance } = useCustomerBalance(
    referenceId || null,
    organizationId
  );

  const {
    outstandingDr: snapshotOutstandingDr,
    advanceAvailable: snapshotAdvanceAvailable,
    cnAvailableTotal: snapshotCnAvailable,
  } = useCustomerFinancialSnapshot(referenceId || null, organizationId);

  const lifetimeOutstanding =
    snapshotOutstandingDr ??
    customersWithBalance?.find((c) => c.id === referenceId)?.outstandingBalance;

  /** Sum of opening + per-invoice pending (matches Select Invoices list; includes sale_return_adjust). */
  const listedInvoicePendingTotal = useMemo(() => {
    if (!referenceId) return 0;
    return (
      (customerInvoices || []).reduce(
        (s, inv) => s + getInvoiceOutstanding(inv, customerInvoiceVoucherSplits.get(inv.id)),
        0
      ) + (openingBalanceRemaining || 0)
    );
  }, [referenceId, customerInvoices, customerInvoiceVoucherSplits, openingBalanceRemaining]);


  const advanceBalance = snapshotAdvanceAvailable;
  const adjustedOutstandingCreditTotal = snapshotCnAvailable;

  // Auto-fill amount
  const getAllocatedAmount = (invoiceId: string, fallbackOutstanding: number) => {
    const raw = allocatedAmounts[invoiceId];
    if (raw === undefined || raw === "") return roundToRupee(fallbackOutstanding);
    return roundToRupee(raw);
  };

  const getSelectedPayableTotal = () => {
    const invoicePart = customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id))
      .reduce((sum, inv) => {
        const outstanding = getInvoiceOutstanding(inv, customerInvoiceVoucherSplits.get(inv.id));
        const allocated = Math.min(outstanding, getAllocatedAmount(inv.id, outstanding));
        return sum + allocated;
      }, 0) || 0;
    const obPart = selectedInvoiceIds.includes(OPENING_BALANCE_ID)
        ? Number(openingBalanceRemaining || 0)
        : 0;
    return invoicePart + obPart;
  };

  useEffect(() => {
    if (selectedInvoiceIds.length > 0 && customerInvoices) {
      setAmount(roundToRupee(getSelectedPayableTotal()).toFixed(2));
    }
  }, [selectedInvoiceIds, customerInvoices, openingBalanceRemaining, customerInvoiceVoucherSplits, allocatedAmounts]);

  useEffect(() => {
    const pct = toNumberOrZero(discountPercent);
    if (pct <= 0) return;
    const settlement = roundToRupee(amount);
    if (settlement <= 0) return;
    setDiscountAmount(roundToRupee((settlement * pct) / 100).toFixed(2));
  }, [amount, discountPercent]);

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
    setDiscountPercent("");
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
      const totalOutstanding = invoicesToProcess.reduce((sum, inv) => sum + getInvoiceOutstanding(inv, customerInvoiceVoucherSplits.get(inv.id)), 0);
      const amountToApply = Math.min(advanceBalance, totalOutstanding);
      if (amountToApply <= 0) throw new Error("No advance balance to apply");
      
      // FIFO advance consumption
      const { data: availableAdvances } = await supabase
        .from("customer_advances")
        .select("*")
        .eq("customer_id", referenceId)
        .eq("organization_id", organizationId)
        .in("status", ["active", "partially_used"])
        .order("advance_date", { ascending: true });
      const advanceSnapshots = (availableAdvances || []).map((a: any) => ({
        id: a.id as string,
        used_amount: Number(a.used_amount || 0),
        status: String(a.status || "active"),
      }));

      const { data: acctAdv } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedgerAdv = isAccountingEngineEnabled(
        acctAdv as { accounting_engine_enabled?: boolean } | null
      );

      const advYmd = format(new Date(), "yyyy-MM-dd");
      let remaining = amountToApply;

      const saleRevertAdv: Array<{ id: string; prevPaid: number; prevStatus: string }> = [];
      const createdAdvanceVoucherIds: string[] = [];

      try {
        for (const invoice of invoicesToProcess) {
          if (remaining <= 0) break;
          const outstanding = getInvoiceOutstanding(invoice, customerInvoiceVoucherSplits.get(invoice.id));
          const applyAmt = Math.min(remaining, outstanding);
          if (applyAmt <= 0) continue;
          saleRevertAdv.push({
            id: invoice.id,
            prevPaid: Number(invoice.paid_amount || 0),
            prevStatus: String(invoice.payment_status || "pending"),
          });

          const advDesc = `Adjusted from advance balance for ${invoice.sale_number}`;
          const { vouchers } = await consumeAdvanceFIFO(supabase, {
            customerId: referenceId,
            organizationId,
            saleId: invoice.id,
            requestedAmount: applyAmt,
            voucherDate: advYmd,
          });
          createdAdvanceVoucherIds.push(...vouchers);
          const lastVoucherId = vouchers.length ? vouchers[vouchers.length - 1] : null;
          if (postLedgerAdv && lastVoucherId) {
            await recordCustomerAdvanceApplicationJournalEntry(
              lastVoucherId,
              organizationId,
              applyAmt,
              advYmd,
              advDesc,
              supabase,
            );
          }
          if (referenceId && lastVoucherId) {
            insertLedgerCredit({
              organizationId,
              customerId: referenceId,
              voucherType: "RECEIPT",
              voucherNo: lastVoucherId,
              particulars: `Advance adjusted for ${invoice.sale_number}`,
              transactionDate: advYmd,
              amount: applyAmt,
            });
          }
          await syncSalePaymentFromVouchers(invoice.id, organizationId, advYmd, supabase);
          remaining -= applyAmt;
        }
      } catch (advErr) {
        for (const vid of [...createdAdvanceVoucherIds].reverse()) {
          await deleteJournalEntryByReference(organizationId, "CustomerAdvanceApplication", vid, supabase);
          await supabase.from("voucher_entries").delete().eq("id", vid);
        }
        for (const s of saleRevertAdv) {
          await supabase
            .from("sales")
            .update({ paid_amount: s.prevPaid, payment_status: s.prevStatus })
            .eq("id", s.id);
        }
        for (const snap of advanceSnapshots) {
          await supabase
            .from("customer_advances")
            .update({ used_amount: snap.used_amount, status: snap.status })
            .eq("id", snap.id);
        }
        throw advErr;
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
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      invalidateCustomerFinancialSnapshot(queryClient, organizationId, referenceId);
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
      const { data: acctSettingsGl } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = isAccountingEngineEnabled(
        acctSettingsGl as { accounting_engine_enabled?: boolean } | null
      );

      const includesOpeningBalance = selectedInvoiceIds.includes(OPENING_BALANCE_ID);
      const invoicesToProcess = selectedInvoiceIds.filter(id => id !== OPENING_BALANCE_ID);
      if (!referenceId) throw new Error("Please select a customer to record payment");
      const { cash: paymentAmount, discount: discountValue } = resolvePaymentBreakdown(
        amount,
        discountPercent,
        discountAmount,
      );
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
          const outstanding = getInvoiceOutstanding(invoice, customerInvoiceVoucherSplits.get(invoiceId));
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
          const obCreated = await createReceiptVoucher(supabase, {
            organizationId,
            referenceId: referenceId!,
            referenceType: "customer",
            voucherNumber: obVoucherNumber,
            voucherDate: format(voucherDate, "yyyy-MM-dd"),
            amount: openingBalanceCash,
            discountAmount: openingBalanceDiscount,
            discountReason: openingBalanceDiscount > 0 ? discountReason || null : null,
            paymentMethod,
            description: `Opening Balance Payment${paymentDetails}${obDiscSuffix}`,
          });
          const obVoucher = {
            id: obCreated.id,
            voucher_number: obCreated.voucher_number,
            total_amount: openingBalanceCash,
            discount_amount: openingBalanceDiscount,
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            description: `Opening Balance Payment${paymentDetails}${obDiscSuffix}`,
          };
          createdVouchers.push(obVoucher);
          if (
            postLedger &&
            obVoucher?.id &&
            (paymentMethod || "").toLowerCase() !== "advance_adjustment"
          ) {
            try {
              await recordCustomerReceiptJournalEntry(
                obVoucher.id,
                organizationId,
                Number(obVoucher.total_amount || 0) + Number(obVoucher.discount_amount || 0),
                Number(obVoucher.discount_amount || 0),
                paymentMethod,
                obVoucher.voucher_date as string,
                String(obVoucher.description || finalDescription),
                supabase
              );
            } catch (glErr) {
              await rollbackCustomerReceiptVouchers(organizationId, createdVouchers, supabase);
              throw glErr;
            }
          }
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
          const created = await createReceiptVoucher(supabase, {
            organizationId,
            referenceId: processed.invoice.id,
            voucherNumber: invoiceVoucherNumber,
            voucherDate: format(voucherDate, "yyyy-MM-dd"),
            amount: processed.cashApplied,
            discountAmount: processed.discountApplied,
            discountReason: processed.discountApplied > 0 ? discountReason || null : null,
            paymentMethod,
            description: invoiceDescription + invoiceDiscountSuffix,
          });
          const voucher = {
            id: created.id,
            voucher_number: created.voucher_number,
            total_amount: processed.cashApplied,
            discount_amount: processed.discountApplied,
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            description: invoiceDescription + invoiceDiscountSuffix,
          };
          createdVouchers.push(voucher);
          if (
            postLedger &&
            voucher?.id &&
            (paymentMethod || "").toLowerCase() !== "advance_adjustment"
          ) {
            try {
              await recordCustomerReceiptJournalEntry(
                voucher.id,
                organizationId,
                Number(voucher.total_amount || 0) + Number(voucher.discount_amount || 0),
                Number(voucher.discount_amount || 0),
                paymentMethod,
                voucher.voucher_date as string,
                String(voucher.description || invoiceDescription + invoiceDiscountSuffix),
                supabase
              );
            } catch (glErr) {
              await rollbackCustomerReceiptVouchers(organizationId, createdVouchers, supabase);
              throw glErr;
            }
          }
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
        // total_amount = cash/collected only; discount_amount = CD/waiver. Settlement = sum (matches multi-invoice rows).
        const created = await createReceiptVoucher(supabase, {
          organizationId,
          referenceId: isOpeningBalancePayment
            ? referenceId!
            : processedInvoices[0]?.invoice.id || referenceId!,
          referenceType: isOpeningBalancePayment ? "customer" : "sale",
          voucherNumber: voucherNumber as string,
          voucherDate: format(voucherDate, "yyyy-MM-dd"),
          amount: paymentAmount,
          discountAmount: discountValue,
          discountReason: discountReason || null,
          paymentMethod,
          description: finalDescription + discountSuffix,
        });
        const voucher = {
          id: created.id,
          voucher_number: created.voucher_number,
          total_amount: paymentAmount,
          discount_amount: discountValue,
          voucher_date: format(voucherDate, "yyyy-MM-dd"),
          description: finalDescription + discountSuffix,
        };
        createdVouchers.push(voucher);
        if (
          postLedger &&
          voucher?.id &&
          (paymentMethod || "").toLowerCase() !== "advance_adjustment"
        ) {
          try {
            await recordCustomerReceiptJournalEntry(
              voucher.id,
              organizationId,
              Number(voucher.total_amount || 0) + Number(voucher.discount_amount || 0),
              Number(voucher.discount_amount || 0),
              paymentMethod,
              voucher.voucher_date as string,
              String(voucher.description || finalDescription + discountSuffix),
              supabase
            );
          } catch (glErr) {
            await rollbackCustomerReceiptVouchers(organizationId, createdVouchers, supabase);
            throw glErr;
          }
        }
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

      // Sync paid_amount from vouchers only — do not add allocatedAmount on top (double-counts cash/UPI).
      if (processedInvoices.length > 0) {
        const voucherDateYmd = format(voucherDate, "yyyy-MM-dd");
        await Promise.all(
          processedInvoices.map(async (processed) => {
            if (Number(processed.amountApplied || 0) <= 0) return;
            const rec = await syncSalePaymentFromVouchers(
              processed.invoice.id,
              organizationId,
              voucherDateYmd,
              supabase,
            );
            processed.currentBalance = rec.outstanding;
          }),
        );
      }

      return {
        voucherNumber,
        processedInvoices,
        isOpeningBalancePayment,
        paymentMethod,
        paidAmount: paymentAmount,
        discountAmount: discountValue,
        discountReason,
      };
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
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      invalidateCustomerFinancialSnapshot(queryClient, organizationId, referenceId);

      const totalPaid = data.paidAmount ?? roundToRupee(amount);
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
        const previousBalance = data.processedInvoices.reduce(
          (sum: number, p: any) => sum + p.previousBalance,
          0,
        );
        const totalSettledReceipt = totalPaid + discountValue;
        const syncedCurrentBalance = data.processedInvoices.reduce(
          (sum: number, p: any) => sum + Number(p.currentBalance ?? 0),
          0,
        );
        onShowReceipt({
          voucherNumber: data.voucherNumber, voucherDate: format(voucherDate, 'yyyy-MM-dd'),
          customerName: first.customer_name, customerPhone: first.customer_phone,
          customerAddress: first.customer_address,
          invoiceNumber: data.processedInvoices.map((p: any) => p.invoice.sale_number).join(', '),
          invoiceDate: first.sale_date,
          invoiceAmount: data.processedInvoices.reduce((sum: number, p: any) => sum + p.invoice.net_amount, 0),
          paidAmount: totalPaid, discountAmount: discountValue, discountReason: data.discountReason || '',
          previousBalance,
          currentBalance:
            syncedCurrentBalance > 0
              ? syncedCurrentBalance
              : Math.max(0, previousBalance - totalSettledReceipt),
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
      const saleId = payment.reference_type === "sale" ? payment.reference_id : null;
      const discRev = Number((payment as { discount_amount?: number }).discount_amount || 0);
      const paymentAmount = Number(payment.total_amount) + discRev;
      const pm = String(payment.payment_method || "").toLowerCase();
      const isAdvanceApplication = pm === "advance_adjustment";
      const isCreditNoteApplication = pm === "credit_note_adjustment";
      const { data: acctDel } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const engineOn = isAccountingEngineEnabled(
        acctDel as { accounting_engine_enabled?: boolean } | null
      );
      if (engineOn) {
        const journalRef = isAdvanceApplication
          ? "CustomerAdvanceApplication"
          : isCreditNoteApplication
            ? "CustomerCreditNoteApplication"
            : "CustomerReceipt";
        await deleteJournalEntryByReference(organizationId, journalRef, voucherId, supabase);
      }
      let saleCustomerId: string | null = null;
      if (saleId) {
        const { data: invoice } = await supabase
          .from("sales")
          .select("paid_amount, net_amount, cash_amount, card_amount, upi_amount, customer_id, sale_return_adjust")
          .eq("id", saleId)
          .maybeSingle();
        if (invoice) {
          saleCustomerId = (invoice.customer_id as string) || null;
          const netAmount = Number(invoice.net_amount || 0);
          const srAdjust = Number((invoice as { sale_return_adjust?: number }).sale_return_adjust || 0);
          if (isCreditNoteApplication) {
            const dualPaidAndSr = String(payment.description || "").includes("(Return");
            const newSr = Math.max(0, srAdjust - paymentAmount);
            let newPaid = Number(invoice.paid_amount || 0);
            if (dualPaidAndSr) newPaid = Math.max(0, newPaid - paymentAmount);
            const legacyCnStatus =
              newPaid + newSr >= netAmount - SETTLEMENT_TOLERANCE_RUPEE
                ? "completed"
                : newPaid > 0 || newSr > 0
                  ? "partial"
                  : "pending";
            const { paymentStatus: newStatus } = derivePaidAndStatus({
              netAmount,
              saleReturnAdjust: newSr,
              cashReceived: newPaid,
              advanceApplied: 0,
              cnApplied: newSr,
              discountGiven: 0,
            });
            warnSettlementPathMismatch(
              "CustomerPaymentTab.deleteReceipt.cn",
              legacyCnStatus,
              newStatus,
            );
            await supabase
              .from("sales")
              .update({
                paid_amount: newPaid,
                payment_status: newStatus,
                sale_return_adjust: newSr,
              })
              .eq("id", saleId);
          }
        }
      }
      await supabase.from("voucher_items").delete().eq("voucher_id", voucherId);
      const { error } = await supabase.from("voucher_entries").delete().eq("id", voucherId);
      if (error) throw error;
      if (saleId && !isCreditNoteApplication) {
        if (isAdvanceApplication && saleCustomerId) {
          await reverseCustomerAdvanceFifo(
            supabase,
            organizationId,
            saleCustomerId,
            paymentAmount,
          );
        }
        await syncSalePaymentFromVouchers(
          saleId,
          organizationId,
          format(new Date(), "yyyy-MM-dd"),
          supabase,
        );
      }
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
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advance-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      invalidateCustomerFinancialSnapshot(queryClient, organizationId, referenceId);
      toast.success(`Receipt deleted. ₹${Math.round(data.paymentAmount).toLocaleString('en-IN')} reversed.`);
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete receipt: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const breakdown = resolvePaymentBreakdown(amount, discountPercent, discountAmount);
    if (breakdown.cash <= 0 && breakdown.settlement <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }
    if (!referenceId) { toast.error("Please select a customer"); return; }
    if (selectedInvoiceIds.length > 0) {
      const selectedPayable = getSelectedPayableTotal();
      const { settlement, discount, cash } = breakdown;
      if (settlement > roundToRupee(selectedPayable)) {
        toast.error(`Settlement amount cannot exceed pending total of ₹${selectedPayable.toFixed(2)}`);
        setAmount(roundToRupee(selectedPayable).toFixed(2));
        return;
      }
      if (cash + discount > roundToRupee(selectedPayable) + SETTLEMENT_TOLERANCE_RUPEE) {
        toast.error(`Cash + discount cannot exceed selected pending total of ₹${selectedPayable.toFixed(2)}`);
        return;
      }
    }
    // Align with listed invoice rows (includes sale_return_adjust). Hook balance can lag or
    // historically missed per-invoice CN adjust until useCustomerBalance subtracts sale_return_adjust.
    const selectedPayableForZeroGuard =
      selectedInvoiceIds.length > 0 ? getSelectedPayableTotal() : 0;
    const lifetimeDrForGuard = lifetimeOutstanding ?? customerBalance;
    if (
      lifetimeDrForGuard !== undefined &&
      lifetimeDrForGuard <= 0 &&
      selectedPayableForZeroGuard < MIN_PENDING_RUPEE &&
      listedInvoicePendingTotal < MIN_PENDING_RUPEE
    ) {
      toast.error("Cannot create payment receipt - customer balance is zero");
      return;
    }
    const hasSelectableRows = (customerInvoices && customerInvoices.length > 0) || openingBalanceRemaining > 0;
    if (hasSelectableRows && selectedInvoiceIds.length === 0) { toast.error("Please select at least one invoice or Opening Balance"); return; }
    if (breakdown.discount > 0 && !discountReason.trim()) {
      toast.error("Please enter a discount reason");
      return;
    }
    createVoucher.mutate();
  };

  const allCustomerPayments = vouchers
    ?.filter((v) => (v.reference_type === "customer" || v.reference_type === "customer_payment" || v.reference_type === "sale" || v.reference_type === "SALE") && (v.voucher_type === "receipt" || v.voucher_type === "RECEIPT"))
    .sort((a, b) => new Date(b.voucher_date).getTime() - new Date(a.voucher_date).getTime()) || [];
  const formatEntryDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy, hh:mm a");
  };
  
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

  const customerPaymentsGrandTotals = useMemo(() => {
    let amount = 0;
    let discount = 0;
    for (const v of customerPayments) {
      amount += Number(v.total_amount || 0);
      discount += Number((v as { discount_amount?: number }).discount_amount || 0);
    }
    return { amount, discount, count: customerPayments.length };
  }, [customerPayments]);

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

              <div className="space-y-2">
              <AdaptiveCustomerPicker
                label="Customer"
                open={customerSearchOpen}
                onOpenChange={setCustomerSearchOpen}
                selectedId={referenceId || null}
                selectedLabel={
                  customersWithBalance?.find((c) => c.id === referenceId)?.customer_name || ""
                }
                searchTerm={customerSearchTerm}
                onSearchTermChange={setCustomerSearchTerm}
                options={(customersWithBalance ?? []).map((c) => ({
                  id: c.id,
                  customer_name: c.customer_name,
                  phone: c.phone,
                  outstandingBalance: c.outstandingBalance,
                }))}
                onSelect={(customer) => {
                  setReferenceId(customer.id);
                  setSelectedInvoiceIds([]);
                  setAllocatedAmounts({});
                }}
                emptyMessage={
                  customersWithBalance?.length === 0
                    ? "No customers with outstanding balance"
                    : "No customer found"
                }
                showOutstanding
              />
                {referenceId && (lifetimeOutstanding !== undefined || customerBalance !== undefined) && (() => {
                  const lifetimeDr = lifetimeOutstanding ?? customerBalance ?? 0;
                  const showAsNoOutstanding =
                    lifetimeDr <= 0 && listedInvoicePendingTotal < MIN_PENDING_RUPEE;
                  const displayBalance =
                    lifetimeDr >= MIN_PENDING_RUPEE
                      ? Math.round(lifetimeDr)
                      : Math.round(listedInvoicePendingTotal);
                  return (
                  <div className={cn("mt-2 p-3 border rounded-md", showAsNoOutstanding ? "bg-gradient-to-r from-red-50 to-red-100 dark:from-red-950 dark:to-red-900 border-red-200 dark:border-red-800" : "bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800")}>
                    {showAsNoOutstanding ? (
                      <p className="text-sm font-medium text-red-900 dark:text-red-100">⚠️ No outstanding balance - Payment receipt not allowed</p>
                    ) : (
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Outstanding Balance:{" "}
                        <span className="text-lg font-bold">
                          ₹{displayBalance.toLocaleString("en-IN")}
                        </span>
                        {lifetimeDr < MIN_PENDING_RUPEE && listedInvoicePendingTotal >= MIN_PENDING_RUPEE && (
                          <span className="block text-xs font-normal mt-1 text-amber-800 dark:text-amber-200">
                            Includes sale return / credit note adjustments on invoices
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  );
                })()}
                {/* Advance Balance Banner */}
                {referenceId && advanceBalance > 0 && (lifetimeOutstanding !== undefined || customerBalance !== undefined) && ((lifetimeOutstanding ?? customerBalance ?? 0) >= MIN_PENDING_RUPEE || listedInvoicePendingTotal >= MIN_PENDING_RUPEE) && (
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
                          {applyAdvanceMutation.isPending ? "Applying..." : `Apply ₹${Math.round(Math.min(advanceBalance, customerInvoices?.filter(inv => selectedInvoiceIds.includes(inv.id)).reduce((sum, inv) => sum + getInvoiceOutstanding(inv, customerInvoiceVoucherSplits.get(inv.id)), 0) || 0)).toLocaleString('en-IN')} to Invoice`}
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
                        const balance = getInvoiceOutstanding(invoice, customerInvoiceVoucherSplits.get(invoice.id));
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
                        const grandTotal = roundToRupee(getSelectedPayableTotal());
                        return (
                          <div className="space-y-0.5">
                            <div className="font-semibold text-foreground">
                              Total to collect: ₹{grandTotal.toFixed(2)}
                            </div>
                            {adjustedOutstandingCreditTotal > 0 && (
                              <div className="text-xs text-emerald-700 dark:text-emerald-400">
                                Credit notes available (apply separately): ₹
                                {Number(adjustedOutstandingCreditTotal).toLocaleString("en-IN")}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedInvoiceIds([]); setAllocatedAmounts({}); }}>Clear</Button>
                  </div>
                )}
              </div>

              <AdaptivePaymentMethodPicker
                label="Payment Method"
                value={paymentMethod}
                onChange={(value) => {
                  setPaymentMethod(value);
                  setChequeNumber("");
                  setChequeDate(undefined);
                  setTransactionId("");
                  setUpiPaymentDate(undefined);
                }}
              />

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

              {/* Settlement + discount */}
              {(() => {
                const breakdown = resolvePaymentBreakdown(amount, discountPercent, discountAmount);
                const selectedPayable =
                  selectedInvoiceIds.length > 0 ? roundToRupee(getSelectedPayableTotal()) : 0;
                return (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>
                        {selectedInvoiceIds.length > 0 ? "Settlement Amount" : "Amount"}
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter amount"
                        value={amount}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            setAmount("");
                            return;
                          }
                          const entered = roundToRupee(raw);
                          const maxAllowed =
                            selectedInvoiceIds.length > 0
                              ? roundToRupee(getSelectedPayableTotal())
                              : Infinity;
                          setAmount(Math.min(entered, maxAllowed).toFixed(2));
                        }}
                        required
                        className="no-uppercase"
                      />
                      {selectedInvoiceIds.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Total against selected invoice(s). Add discount % below to calculate cash received.
                        </p>
                      )}
                    </div>

                    <div className="space-y-4 p-4 border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 rounded-lg">
                      <div className="flex items-center gap-2 text-foreground">
                        <TrendingDown className="h-4 w-4" />
                        <span className="text-sm font-medium">Discount (optional)</span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Discount %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            placeholder="e.g. 20"
                            value={discountPercent}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (raw === "") {
                                setDiscountPercent("");
                                return;
                              }
                              const pct = Math.min(100, Math.max(0, toNumberOrZero(raw)));
                              setDiscountPercent(String(pct));
                            }}
                            className="no-uppercase"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Discount Amount (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Auto from %"
                            value={discountAmount}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setDiscountPercent("");
                              if (raw === "") {
                                setDiscountAmount("");
                                return;
                              }
                              setDiscountAmount(roundToRupee(raw).toFixed(2));
                            }}
                            className="no-uppercase"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>
                            Discount Reason
                            {breakdown.discount > 0 && <span className="text-red-500"> *</span>}
                          </Label>
                          <Input
                            placeholder="e.g., Early payment"
                            value={discountReason}
                            onChange={(e) => setDiscountReason(e.target.value)}
                            className="no-uppercase"
                          />
                        </div>
                      </div>

                      {breakdown.settlement > 0 && (
                        <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md space-y-1.5">
                          <div className="flex justify-between items-center text-sm">
                            <span>Settlement (invoice total):</span>
                            <span className="font-medium">
                              ₹{breakdown.settlement.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {breakdown.discount > 0 && (
                            <div className="flex justify-between items-center text-sm text-muted-foreground">
                              <span>
                                − Discount
                                {breakdown.discountPercent > 0
                                  ? ` (${breakdown.discountPercent}%)`
                                  : ""}
                                :
                              </span>
                              <span className="font-medium text-amber-700 dark:text-amber-400">
                                ₹{breakdown.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          )}
                          <Separator className="my-2" />
                          <div className="flex justify-between items-center text-base font-bold text-green-700 dark:text-green-400">
                            <span>Amount Received (Cash):</span>
                            <span>
                              ₹{breakdown.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {selectedPayable > 0 &&
                            breakdown.settlement >= selectedPayable - SETTLEMENT_TOLERANCE_RUPEE && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-2">
                                ✓ Selected invoice(s) will be fully settled
                              </p>
                            )}
                        </div>
                      )}
                    </div>
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
              const { cash: paymentAmount, discount: discountValue } = resolvePaymentBreakdown(
                amount,
                discountPercent,
                discountAmount,
              );
              const totalSettled = paymentAmount + discountValue;
              const outstandingBalance = lifetimeOutstanding ?? customerBalance ?? 0;
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

      {!embedded && (
      <AccountsHistoryPanel
        title="Recent Customer Payments"
        searchPlaceholder="Search by customer name, voucher no, or description..."
        searchValue={paymentSearchTerm}
        onSearchChange={(v) => { setPaymentSearchTerm(v); setCustomerPaymentsPage(1); }}
        disableTableScroll={isMobile}
        toolbar={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 text-sm border-slate-200 bg-slate-50 hover:bg-white">
                  <Filter className="mr-2 h-4 w-4" />
                  Payment Mode{paymentMethodFilter.length > 0 ? ` (${paymentMethodFilter.length})` : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Filter by Method</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {["cash", "cheque", "upi", "bank_transfer", "advance_adjustment", "credit_note_adjustment", "other"].map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m}
                    checked={paymentMethodFilter.includes(m)}
                    onCheckedChange={(checked) => {
                      setCustomerPaymentsPage(1);
                      setPaymentMethodFilter((prev) =>
                        checked ? [...prev, m] : prev.filter((x) => x !== m)
                      );
                    }}
                    className="text-xs"
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
                  <Button variant="destructive" size="sm" className="h-9">
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
          </>
        }
        footer={
          totalPages > 1 ? (
            <>
              <p className="text-muted-foreground">Showing {startIndex + 1}-{Math.min(endIndex, customerPayments.length)} of {customerPayments.length} receipts</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCustomerPaymentsPage(p => Math.max(1, p - 1))} disabled={customerPaymentsPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="font-medium px-2">Page {customerPaymentsPage} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCustomerPaymentsPage(p => Math.min(totalPages, p + 1))} disabled={customerPaymentsPage === totalPages}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
          {isMobile ? (
            <div className="space-y-2.5">
              {paginatedPayments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No receipts found</div>
              ) : (
                paginatedPayments.map((voucher) => {
                  const invoice = sales?.find((s) => s.id === voucher.reference_id);
                  let customerName = "-";
                  if (invoice?.customer_name) {
                    customerName = invoice.customer_name;
                  } else if (voucher.reference_type === "customer") {
                    customerName = customers?.find((c) => c.id === voucher.reference_id)?.customer_name || "-";
                  } else if (invoice?.customer_id) {
                    customerName = customers?.find((c) => c.id === invoice.customer_id)?.customer_name || "-";
                  }
                  const desc = voucher.description || "";
                  const dateMatch = desc.match(/(?:UPI Date|Date):\s*(\d{2}\/\d{2}\/\d{4})/);
                  const extractedDate = dateMatch ? dateMatch[1] : null;
                  const disc = Number((voucher as any).discount_amount) || 0;
                  const isSelected = selectedPaymentIds.includes(voucher.id);

                  return (
                    <MobileListCard
                      key={voucher.id}
                      className={isSelected ? "ring-2 ring-primary/40" : undefined}
                      title={voucher.voucher_number}
                      subtitle={customerName}
                      badge={
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {voucher.payment_method || "—"}
                        </Badge>
                      }
                      amount={
                        <div className="text-sm font-bold tabular-nums">
                          ₹{voucher.total_amount.toLocaleString("en-IN")}
                        </div>
                      }
                      meta={
                        <>
                          <span>Payment {format(new Date(voucher.voucher_date), "dd/MM/yyyy")}</span>
                          <span>Entry {formatEntryDateTime(voucher.created_at)}</span>
                          {extractedDate ? <span>Instrument date {extractedDate}</span> : null}
                          {disc > 0 ? <span>Discount ₹{disc.toFixed(2)}</span> : null}
                          {desc ? <span className="line-clamp-2">{desc}</span> : null}
                        </>
                      }
                      footer={
                        <>
                          {isAdmin && (
                            <div className="flex items-center justify-center px-2 border-r border-border/40">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedPaymentIds([...selectedPaymentIds, voucher.id]);
                                  else setSelectedPaymentIds(selectedPaymentIds.filter((id) => id !== voucher.id));
                                }}
                              />
                            </div>
                          )}
                          {isAdmin && voucher.reference_type === "customer" && (
                            <button
                              type="button"
                              onClick={() => {
                                const cust = customers?.find((c) => c.id === voucher.reference_id);
                                setReassignPayment(voucher);
                                setReassignCustomerId(voucher.reference_id);
                                setReassignCustomerName(cust?.customer_name || "Customer");
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-primary active:bg-primary/5 touch-manipulation"
                            >
                              <Link2 className="h-3.5 w-3.5" />
                              Link
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onEditPayment(voucher)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-blue-600 active:bg-blue-50 touch-manipulation"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              Edit
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const customer = voucher.reference_type === "customer"
                                ? customers?.find((c) => c.id === voucher.reference_id)
                                : (invoice?.customer_id ? customers?.find((c) => c.id === invoice.customer_id) : null);
                              const paid = Number(voucher.total_amount) || 0;
                              const discAmt = Number((voucher as any).discount_amount) || 0;
                              const discReason = String((voucher as any).discount_reason || "");
                              const invNet = invoice?.net_amount != null ? Number(invoice.net_amount) : paid + discAmt;
                              onShowReceipt({
                                voucherNumber: voucher.voucher_number,
                                voucherDate: voucher.voucher_date,
                                customerName,
                                customerPhone: customer?.phone || "",
                                customerAddress: customer?.address || "",
                                invoiceNumber: voucher.description?.includes("Against Invoice")
                                  ? voucher.description.replace("Against Invoice: ", "")
                                  : voucher.description || "-",
                                invoiceDate: invoice?.sale_date || voucher.voucher_date,
                                invoiceAmount: invNet,
                                paidAmount: paid,
                                discountAmount: discAmt,
                                discountReason: discReason,
                                paymentMethod: voucher.payment_method || "cash",
                                previousBalance: 0,
                                currentBalance: 0,
                              });
                            }}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-muted-foreground active:bg-muted/50 touch-manipulation"
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print
                          </button>
                        </>
                      }
                    />
                  );
                })
              )}
              {customerPaymentsGrandTotals.count > 0 && (
                <div className="rounded-2xl border border-border/40 bg-muted/40 p-3.5 flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    Grand total ({customerPaymentsGrandTotals.count} receipt
                    {customerPaymentsGrandTotals.count === 1 ? "" : "s"}
                    {totalPages > 1 ? ", all pages" : ""})
                  </span>
                  <span className="font-bold tabular-nums">
                    ₹{customerPaymentsGrandTotals.amount.toFixed(2)}
                    {customerPaymentsGrandTotals.discount > 0.009
                      ? ` · disc ₹${customerPaymentsGrandTotals.discount.toFixed(2)}`
                      : ""}
                  </span>
                </div>
              )}
            </div>
          ) : (
          <Table className={accountsHistoryTableClass}>
            <TableHeader className="!static">
              <TableRow>
                {isAdmin && <TableHead className={cn(accountsHistoryThClass, "w-10")}></TableHead>}
                <TableHead className={accountsHistoryThClass}>Voucher No</TableHead>
                <TableHead className={accountsHistoryThClass}>Payment Date</TableHead>
                <TableHead className={accountsHistoryThClass}>Entry Date &amp; Time</TableHead>
                <TableHead className={accountsHistoryThClass}>Customer</TableHead>
                <TableHead className={cn(accountsHistoryThClass, "text-right")}>Amount</TableHead>
                <TableHead className={accountsHistoryThClass}>Method</TableHead>
                <TableHead className={accountsHistoryThClass}>Cheque/Txn Date</TableHead>
                <TableHead className={cn(accountsHistoryThClass, "text-right")}>Discount</TableHead>
                <TableHead className={accountsHistoryThClass}>Description</TableHead>
                {isAdmin && <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>}
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
                  <TableRow key={voucher.id} className={cn("hover:bg-accent/50", isSelected && "bg-primary/10")}>
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
                    <TableCell>{formatEntryDateTime(voucher.created_at)}</TableCell>
                    <TableCell>{customerName}</TableCell>
                    <TableCell>₹{voucher.total_amount.toFixed(2)}</TableCell>
                    <TableCell className="uppercase text-xs">{voucher.payment_method || "-"}</TableCell>
                    <TableCell className="text-xs tabular-nums">{extractedDate}</TableCell>
                    <TableCell className="text-xs tabular-nums font-mono">
                      {Number((voucher as any).discount_amount) > 0
                        ? `₹${Number((voucher as any).discount_amount).toFixed(2)}`
                        : "-"}
                    </TableCell>
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
                            const paid = Number(voucher.total_amount) || 0;
                            const discAmt = Number((voucher as any).discount_amount) || 0;
                            const discReason = String((voucher as any).discount_reason || "");
                            const invNet = invoice?.net_amount != null ? Number(invoice.net_amount) : paid + discAmt;
                            onShowReceipt({
                              voucherNumber: voucher.voucher_number, voucherDate: voucher.voucher_date,
                              customerName, customerPhone: customer?.phone || "", customerAddress: customer?.address || "",
                              invoiceNumber: voucher.description?.includes("Against Invoice") ? voucher.description.replace("Against Invoice: ", "") : voucher.description || "-",
                              invoiceDate: invoice?.sale_date || voucher.voucher_date,
                              invoiceAmount: invNet,
                              paidAmount: paid, discountAmount: discAmt, discountReason: discReason,
                              paymentMethod: voucher.payment_method || "cash",
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
            {customerPaymentsGrandTotals.count > 0 ? (
              <TableFooter>
                <TableRow className="bg-muted/60 hover:bg-muted/60 border-t-2 border-t-foreground/10">
                  {isAdmin ? <TableCell /> : null}
                  <TableCell colSpan={4} className="text-right font-semibold text-foreground">
                    Grand total
                    <span className="ml-1.5 font-normal text-muted-foreground">
                      ({customerPaymentsGrandTotals.count}{" "}
                      {customerPaymentsGrandTotals.count === 1 ? "receipt" : "receipts"}
                      {totalPages > 1 ? ", all pages" : ""})
                    </span>
                  </TableCell>
                  <TableCell className="font-bold tabular-nums text-foreground">
                    ₹{customerPaymentsGrandTotals.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                  <TableCell className="text-xs tabular-nums font-semibold font-mono">
                    {customerPaymentsGrandTotals.discount > 0.009
                      ? `₹${customerPaymentsGrandTotals.discount.toFixed(2)}`
                      : "—"}
                  </TableCell>
                  <TableCell />
                  {isAdmin ? <TableCell /> : null}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
          )}
      </AccountsHistoryPanel>
      )}

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
