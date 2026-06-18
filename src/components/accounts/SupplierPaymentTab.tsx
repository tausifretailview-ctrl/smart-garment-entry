import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus, Printer, Check, ChevronsUpDown, ChevronDown, X, AlertCircle, Pencil, Trash2, ChevronLeft, ChevronRight, Link2, TrendingDown } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  deleteJournalEntryByReference,
  recordSupplierPaymentJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { AccountsHistoryPanel } from "@/components/accounts/AccountsHistoryPanel";
import { accountsHistoryTableClass, accountsHistoryThClass } from "@/components/accounts/accountsHistoryUi";
import {
  fetchSupplierBalanceSnapshot,
  fetchSupplierBalanceSnapshotsForOrg,
  type SupplierBalanceSnapshot,
} from "@/utils/supplierBalanceUtils";
import {
  SUPPLIER_MIN_PENDING_RUPEE,
  allocateSupplierCreditToBills,
  getSupplierBillRawOutstanding,
  sumSupplierBillNetPayable,
  type SupplierBillOutstandingBreakdown,
} from "@/utils/supplierBillOutstanding";
import { ChequePrintDialog } from "@/components/ChequePrintDialog";
import { useUserRoles } from "@/hooks/useUserRoles";
import {
  resolvePaymentBreakdown,
  roundToRupee,
  SETTLEMENT_TOLERANCE_RUPEE,
  voucherSettlementCredit,
} from "@/utils/paymentSettlementBreakdown";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function ensureStringKeyMap<T>(value: unknown): Map<string, T> {
  return value instanceof Map ? value : new Map<string, T>();
}

function safeMapGet<T>(map: unknown, key: string): T | undefined {
  if (!(map instanceof Map)) return undefined;
  return map.get(key);
}

const EMPTY_SUPPLIER_SNAPSHOT = (supplierId: string): SupplierBalanceSnapshot => ({
  supplierId,
  openingBalance: 0,
  totalPurchases: 0,
  totalPaid: 0,
  totalCreditNotesGross: 0,
  creditNotesAppliedToBills: 0,
  creditNotesAppliedToOutstanding: 0,
  creditNotesRefunded: 0,
  totalCreditNotesNet: 0,
  unappliedCreditNotes: 0,
  unreflectedReturns: 0,
  refundsReceived: 0,
  balance: 0,
});

async function loadSupplierBalanceMapForOrg(
  organizationId: string,
): Promise<{ balanceMap: Map<string, SupplierBalanceSnapshot>; degraded: boolean }> {
  let balanceMap: Map<string, SupplierBalanceSnapshot>;
  let degraded = false;
  try {
    balanceMap = await fetchSupplierBalanceSnapshotsForOrg(supabase, organizationId);
  } catch (e) {
    console.error("SupplierPaymentTab: balance snapshot failed", e);
    balanceMap = new Map();
    degraded = true;
  }
  if (!(balanceMap instanceof Map)) {
    console.error("SupplierPaymentTab: balance snapshot was not a Map", balanceMap);
    balanceMap = new Map();
    degraded = true;
  }
  return { balanceMap, degraded };
}

interface SupplierPaymentTabProps {
  organizationId: string;
  vouchers: any[] | undefined;
  suppliers: any[] | undefined;
  onEditPayment?: (voucher: any) => void;
  embedded?: boolean;
}

export function SupplierPaymentTab({
  organizationId,
  vouchers,
  suppliers,
  onEditPayment,
  embedded = false,
}: SupplierPaymentTabProps) {
  const queryClient = useQueryClient();
  const { isAdmin } = useUserRoles();

  // Form states
  const [voucherDate, setVoucherDate] = useState<Date>(new Date());
  const [referenceId, setReferenceId] = useState("");
  const [selectedSupplierBillIds, setSelectedSupplierBillIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [showDiscountOptions, setShowDiscountOptions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState<Date | undefined>(undefined);
  const [transactionId, setTransactionId] = useState("");
  const savingRef = useRef(false);

  // Search
  const [supplierSearchOpen, setSupplierSearchOpen] = useState(false);
  const [supplierSearchTerm, setSupplierSearchTerm] = useState("");

  // Cheque print
  const [showChequePrintDialog, setShowChequePrintDialog] = useState(false);

  // Pagination & selection for recent payments
  const PAYMENTS_PER_PAGE = 10;
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [paymentSearchTerm, setPaymentSearchTerm] = useState("");

  // Suppliers with balance
  const { data: suppliersWithBalanceResult } = useQuery({
    queryKey: ["suppliers-with-balance", organizationId],
    queryFn: async () => {
      const { data: allSuppliers, error: suppError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("supplier_name");
      if (suppError) throw suppError;
      const { balanceMap, degraded } = await loadSupplierBalanceMapForOrg(organizationId);
      const suppliers =
        allSuppliers?.filter((s: any) => (safeMapGet<SupplierBalanceSnapshot>(balanceMap, s.id)?.balance ?? 0) > 0.01).map((s: any) => ({
          ...s,
          outstandingBalance: safeMapGet<SupplierBalanceSnapshot>(balanceMap, s.id)?.balance ?? 0,
        })) || [];
      return { suppliers, balanceSnapshotDegraded: degraded };
    },
    enabled: !!organizationId,
  });
  const suppliersWithBalance = suppliersWithBalanceResult?.suppliers;
  const balanceSnapshotDegraded = suppliersWithBalanceResult?.balanceSnapshotDegraded ?? false;

  // Supplier balance snapshot (same source as Supplier Ledger)
  const { data: supplierSnapshot } = useQuery({
    queryKey: ["supplier-balance-snapshot", organizationId, referenceId],
    queryFn: async () => {
      try {
        return await fetchSupplierBalanceSnapshot(supabase, organizationId, referenceId);
      } catch (e) {
        console.error("SupplierPaymentTab: supplier balance snapshot failed", e);
        return EMPTY_SUPPLIER_SNAPSHOT(referenceId);
      }
    },
    enabled: !!referenceId && !!organizationId,
  });

  const lifetimePayable = supplierSnapshot?.balance ?? 0;

  // Supplier bills
  const { data: supplierBillsData } = useQuery({
    queryKey: ["supplier-bills", organizationId, referenceId],
    queryFn: async () => {
      const { data, error } = await supabase.from("purchase_bills").select("*").eq("supplier_id", referenceId).is("deleted_at", null).order("bill_date", { ascending: false });
      if (error) throw error;
      const bills = data || [];
      const billIds = bills.map((b: any) => b.id).filter(Boolean);
      const voucherPaidByBill = new Map<string, number>();

      if (billIds.length > 0) {
        const { data: paymentRows, error: paymentError } = await supabase
          .from("voucher_entries")
          .select("reference_id, total_amount, discount_amount")
          .eq("organization_id", organizationId)
          .eq("reference_type", "supplier")
          .eq("voucher_type", "payment")
          .is("deleted_at", null)
          .in("reference_id", billIds);
        if (paymentError) throw paymentError;

        for (const row of paymentRows || []) {
          if (!row?.reference_id) continue;
          try {
            voucherPaidByBill.set(
              row.reference_id,
              (voucherPaidByBill.get(row.reference_id) || 0) + voucherSettlementCredit(row),
            );
          } catch (rowErr) {
            console.warn("SupplierPaymentTab: skip voucher payment row", rowErr);
          }
        }
      }

      // Supplier payment reconciliation - Apr 2026:
      // keep bill paid_amount/payment_status synced with actual bill-linked payment vouchers.
      const updates = bills
        .map((bill: any) => {
          const net = Number(bill.net_amount || 0);
          const voucherPaid = Number(safeMapGet<number>(voucherPaidByBill, bill.id) || 0);
          const effectivePaid = Math.min(net, Math.max(Number(bill.paid_amount || 0), voucherPaid));
          const status = effectivePaid >= net - 0.01 ? "paid" : effectivePaid > 0 ? "partial" : "unpaid";
          return { bill, effectivePaid, status };
        })
        .filter(({ bill, effectivePaid, status }) =>
          Math.abs(Number(bill.paid_amount || 0) - effectivePaid) > 0.009 ||
          (bill.payment_status || "unpaid") !== status
        );

      if (updates.length > 0) {
        await Promise.all(
          updates.map(({ bill, effectivePaid, status }) =>
            supabase
              .from("purchase_bills")
              .update({ paid_amount: effectivePaid, payment_status: status })
              .eq("id", bill.id)
          )
        );
      }

      return {
        bills: bills.filter((bill: any) => getSupplierBillRawOutstanding(bill, voucherPaidByBill) > 0.009),
        voucherPaidByBill,
      };
    },
    enabled: !!referenceId && !!organizationId,
  });

  const supplierBills = supplierBillsData?.bills;
  const voucherPaidByBill = useMemo(
    () => ensureStringKeyMap<number>(supplierBillsData?.voucherPaidByBill),
    [supplierBillsData?.voucherPaidByBill],
  );

  const { data: adjustedOutstandingCreditTotal = 0 } = useQuery({
    queryKey: ["supplier-adjusted-outstanding-credit", organizationId, referenceId],
    queryFn: async () => {
      if (!organizationId || !referenceId) return 0;
      const { data, error } = await supabase
        .from("purchase_returns" as any)
        .select("net_amount")
        .eq("organization_id", organizationId)
        .eq("supplier_id", referenceId)
        .eq("credit_status", "adjusted_outstanding")
        .is("deleted_at", null);
      if (error) throw error;
      return (data || []).reduce((sum: number, row: any) => sum + Number(row.net_amount || 0), 0);
    },
    enabled: !!organizationId && !!referenceId,
  });

  // Credit available to FIFO-allocate against bills = genuinely unapplied CN vouchers
  // PLUS returns adjusted to outstanding. We use `unappliedCreditNotes` (which excludes
  // CN vouchers already adjusted to outstanding) so a voucher-backed adjusted-outstanding
  // return is counted ONCE via `adjustedOutstandingCreditTotal`, not double-counted.
  const cnCreditPool = useMemo(
    () =>
      roundMoney(
        (supplierSnapshot?.unappliedCreditNotes ?? 0) + Number(adjustedOutstandingCreditTotal || 0),
      ),
    [supplierSnapshot?.unappliedCreditNotes, adjustedOutstandingCreditTotal],
  );

  const billOutstandingMap = useMemo(() => {
    try {
      const map = allocateSupplierCreditToBills(
        supplierBills ?? [],
        cnCreditPool,
        voucherPaidByBill,
      );
      return ensureStringKeyMap<SupplierBillOutstandingBreakdown>(map);
    } catch (e) {
      console.error("SupplierPaymentTab: bill outstanding allocation failed", e);
      return new Map<string, SupplierBillOutstandingBreakdown>();
    }
  }, [supplierBills, cnCreditPool, voucherPaidByBill]);

  const listedBillPendingTotal = useMemo(
    () => sumSupplierBillNetPayable(billOutstandingMap),
    [billOutstandingMap],
  );

  const payableBills = useMemo(
    () =>
      (supplierBills ?? []).filter(
        (bill) =>
          (safeMapGet<SupplierBillOutstandingBreakdown>(billOutstandingMap, bill.id)?.netPayable ?? 0) >= SUPPLIER_MIN_PENDING_RUPEE,
      ),
    [supplierBills, billOutstandingMap],
  );

  const getSelectedPayableTotal = () =>
    (supplierBills ?? [])
      .filter((bill) => selectedSupplierBillIds.includes(bill.id))
      .reduce(
        (sum, bill) => sum + (safeMapGet<SupplierBillOutstandingBreakdown>(billOutstandingMap, bill.id)?.netPayable ?? 0),
        0,
      );

  const getSelectedRawSubtotal = () =>
    (supplierBills ?? [])
      .filter((bill) => selectedSupplierBillIds.includes(bill.id))
      .reduce(
        (sum, bill) => sum + (safeMapGet<SupplierBillOutstandingBreakdown>(billOutstandingMap, bill.id)?.rawOutstanding ?? 0),
        0,
      );

  const getSelectedCreditApplied = () =>
    (supplierBills ?? [])
      .filter((bill) => selectedSupplierBillIds.includes(bill.id))
      .reduce(
        (sum, bill) => sum + (safeMapGet<SupplierBillOutstandingBreakdown>(billOutstandingMap, bill.id)?.creditAllocated ?? 0),
        0,
      );

  // Auto-fill settlement amount when bills are selected
  useEffect(() => {
    if (selectedSupplierBillIds.length > 0 && supplierBills) {
      setAmount(getSelectedPayableTotal().toFixed(2));
    }
  }, [selectedSupplierBillIds, supplierBills, billOutstandingMap]);

  useEffect(() => {
    const pct = Number(discountPercent);
    if (!Number.isFinite(pct) || pct <= 0 || !amount) return;
    const settlement = roundToRupee(amount);
    if (settlement <= 0) return;
    setDiscountAmount(roundToRupee((settlement * Math.min(100, pct)) / 100).toFixed(2));
  }, [amount, discountPercent]);

  const resetForm = () => {
    setVoucherDate(new Date());
    setReferenceId("");
    setSelectedSupplierBillIds([]);
    setDescription("");
    setAmount("");
    setDiscountPercent("");
    setDiscountAmount("");
    setDiscountReason("");
    setShowDiscountOptions(false);
    setPaymentMethod("cash");
    setChequeNumber("");
    setChequeDate(undefined);
    setTransactionId("");
  };

  const createVoucher = useMutation({
    mutationFn: async () => {
      if (savingRef.current) {
        throw new Error("Save already in progress");
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

      if (!referenceId) throw new Error("Please select a supplier to record payment");
      const breakdown = resolvePaymentBreakdown(amount, discountPercent, discountAmount);
      if (breakdown.settlement <= 0) throw new Error("Please enter a valid settlement amount");
      if (breakdown.discount > 0 && !discountReason.trim()) {
        throw new Error("Please enter a discount reason");
      }
      if (
        lifetimePayable <= SUPPLIER_MIN_PENDING_RUPEE &&
        listedBillPendingTotal < SUPPLIER_MIN_PENDING_RUPEE &&
        selectedSupplierBillIds.length === 0
      ) {
        throw new Error("Supplier has credit / overpayment balance — no payment required");
      }
      if (selectedSupplierBillIds.length > 0) {
        const selectedPayable = getSelectedPayableTotal();
        if (selectedPayable <= SUPPLIER_MIN_PENDING_RUPEE) {
          throw new Error("Selected bills are fully covered by credit notes — no cash payment needed");
        }
        if (breakdown.settlement > roundToRupee(selectedPayable) + SETTLEMENT_TOLERANCE_RUPEE) {
          throw new Error(`Settlement cannot exceed selected pending total of ₹${selectedPayable.toFixed(2)}`);
        }
      }
      const paymentAmount = breakdown.cash;
      const discountValue = breakdown.discount;
      if (paymentAmount <= 0 && discountValue <= 0) {
        throw new Error("Cash payment or discount must be greater than zero");
      }

      let remainingCash = paymentAmount;
      let remainingDiscount = discountValue;
      const takeFromPool = (target: number) => {
        const t = roundToRupee(target);
        if (t <= 0) return { cash: 0, discount: 0 };
        let c = Math.min(remainingCash, t);
        let d = roundToRupee(t - c);
        if (d > remainingDiscount) d = remainingDiscount;
        c = roundToRupee(t - d);
        remainingCash = roundToRupee(remainingCash - c);
        remainingDiscount = roundToRupee(remainingDiscount - d);
        return { cash: c, discount: d };
      };

      const processedBills: Array<{
        bill: any;
        cashApplied: number;
        discountApplied: number;
        prevPaid: number;
        prevStatus: string;
      }> = [];

      if (selectedSupplierBillIds.length > 0) {
        for (const billId of selectedSupplierBillIds) {
          if (remainingCash + remainingDiscount <= 0) break;
          const bill = supplierBills?.find((b) => b.id === billId);
          if (!bill) continue;
          const currentPaid = bill.paid_amount || 0;
          const prevPaid = Number(currentPaid);
          const prevStatus = (bill.payment_status || "unpaid") as string;
          const netDue =
            safeMapGet<SupplierBillOutstandingBreakdown>(billOutstandingMap, billId)?.netPayable ??
            Math.max(0, Number(bill.net_amount || 0) - Number(currentPaid));
          const pool = remainingCash + remainingDiscount;
          if (pool <= 0 || netDue <= 0) continue;
          const amountToApply = Math.min(pool, netDue);
          const { cash: cashApplied, discount: discountApplied } = takeFromPool(amountToApply);
          const settledOnBill = roundToRupee(cashApplied + discountApplied);
          if (settledOnBill <= 0) continue;
          const newPaidAmount = Math.min(
            Number(bill.net_amount || 0),
            roundToRupee(Number(currentPaid) + settledOnBill),
          );
          const newStatus =
            newPaidAmount >= Number(bill.net_amount || 0) - 0.01
              ? "paid"
              : newPaidAmount > 0
                ? "partial"
                : "unpaid";
          const { error: updateError } = await supabase
            .from("purchase_bills")
            .update({ paid_amount: newPaidAmount, payment_status: newStatus })
            .eq("id", billId);
          if (updateError) throw updateError;
          processedBills.push({ bill, cashApplied, discountApplied, prevPaid, prevStatus });
        }
      }

      const { data: voucherNumber, error: numberError } = await supabase.rpc("generate_voucher_number", { p_type: "payment", p_date: format(voucherDate, "yyyy-MM-dd") });
      if (numberError) throw numberError;

      const billNumbers = processedBills.map(p => p.bill.supplier_invoice_no || p.bill.software_bill_no || p.bill.id.slice(0, 8)).join(', ');
      let paymentDetails = '';
      if (paymentMethod === 'cheque' && chequeNumber) {
        paymentDetails = ` | Cheque No: ${chequeNumber}`;
        if (chequeDate) paymentDetails += `, Date: ${format(chequeDate, 'dd/MM/yyyy')}`;
      } else if ((paymentMethod === 'other' || paymentMethod === 'bank_transfer' || paymentMethod === 'upi') && transactionId) {
        paymentDetails = ` | Transaction ID: ${transactionId}`;
      }

      const discountSuffix =
        discountValue > 0
          ? ` | Discount: ₹${discountValue.toFixed(2)}${discountReason ? ` (${discountReason})` : ""}`
          : "";

      const isOpeningBalancePayment = selectedSupplierBillIds.length === 0;
      let finalDescription: string;
      if (isOpeningBalancePayment) {
        const supplierName = suppliersWithBalance?.find((s) => s.id === referenceId)?.supplier_name || "Supplier";
        finalDescription = description
          ? `${description}${paymentDetails}`
          : `Opening Balance Payment to ${supplierName}${paymentDetails}`;
      } else {
        finalDescription = description
          ? `${description}${paymentDetails}`
          : `Payment for Bills: ${billNumbers}${paymentDetails}`;
      }

      const createdSupplierVoucherIds: string[] = [];

      if (processedBills.length > 0) {
        for (let i = 0; i < processedBills.length; i++) {
          const processed = processedBills[i];
          const vNum = processedBills.length > 1 ? `${voucherNumber}-${i + 1}` : voucherNumber;
          const billRef =
            processed.bill.supplier_invoice_no ||
            processed.bill.software_bill_no ||
            processed.bill.id.slice(0, 8);
          const billDiscountSuffix =
            processed.discountApplied > 0
              ? ` | Discount: ₹${processed.discountApplied.toFixed(2)}${discountReason ? ` (${discountReason})` : ""}`
              : "";
          const baseDescription = `Payment for Bill: ${billRef} | Supplier: ${processed.bill.supplier_name || suppliersWithBalance?.find((s: any) => s.id === referenceId)?.supplier_name || ""}${paymentDetails}`;
          const voucherDescription = description
            ? `${description} | ${baseDescription}${billDiscountSuffix}`
            : `${baseDescription}${billDiscountSuffix}`;
          const { data: ins, error: voucherError } = await supabase
            .from("voucher_entries")
            .insert({
              organization_id: organizationId,
              voucher_number: vNum,
              voucher_type: "payment",
              voucher_date: format(voucherDate, "yyyy-MM-dd"),
              reference_type: "supplier",
              reference_id: processed.bill.id,
              description: voucherDescription,
              total_amount: processed.cashApplied,
              discount_amount: processed.discountApplied,
              discount_reason: processed.discountApplied > 0 ? discountReason.trim() || null : null,
              payment_method: paymentMethod,
            })
            .select("id")
            .single();
          if (voucherError) throw voucherError;
          if (!ins?.id) throw new Error("Supplier payment voucher insert failed");
          createdSupplierVoucherIds.push(ins.id);
          if (postLedger) {
            try {
              await recordSupplierPaymentJournalEntry(
                ins.id,
                organizationId,
                processed.cashApplied,
                processed.discountApplied,
                paymentMethod,
                format(voucherDate, "yyyy-MM-dd"),
                voucherDescription,
                supabase
              );
            } catch (glErr) {
              for (const vid of createdSupplierVoucherIds) {
                await deleteJournalEntryByReference(organizationId, "SupplierPayment", vid, supabase);
                await supabase.from("voucher_entries").delete().eq("id", vid);
              }
              for (const p of processedBills) {
                await supabase
                  .from("purchase_bills")
                  .update({ paid_amount: p.prevPaid, payment_status: p.prevStatus })
                  .eq("id", p.bill.id);
              }
              throw glErr;
            }
          }
        }
      } else {
        const obDescription = finalDescription + discountSuffix;
        const { data: ins, error } = await supabase
          .from("voucher_entries")
          .insert({
            organization_id: organizationId,
            voucher_number: voucherNumber,
            voucher_type: "payment",
            voucher_date: format(voucherDate, "yyyy-MM-dd"),
            reference_type: "supplier",
            reference_id: referenceId,
            description: obDescription,
            total_amount: paymentAmount,
            discount_amount: discountValue,
            discount_reason: discountValue > 0 ? discountReason.trim() || null : null,
            payment_method: paymentMethod,
          })
          .select("id")
          .single();
        if (error) throw error;
        if (postLedger && ins?.id) {
          try {
            await recordSupplierPaymentJournalEntry(
              ins.id,
              organizationId,
              paymentAmount,
              discountValue,
              paymentMethod,
              format(voucherDate, "yyyy-MM-dd"),
              obDescription,
              supabase
            );
          } catch (glErr) {
            await deleteJournalEntryByReference(organizationId, "SupplierPayment", ins.id, supabase);
            await supabase.from("voucher_entries").delete().eq("id", ins.id);
            throw glErr;
          }
        }
      }
      } finally {
        savingRef.current = false;
      }
    },
    onSuccess: () => {
      toast.success("Payment recorded successfully");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-summary"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bill-payment-voucher-drift"] });
      resetForm();
    },
    onError: (error: any) => {
      toast.error(`Failed to record payment: ${error.message}`);
    },
  });

  // Delete supplier payment
  const deletePayment = useMutation({
    mutationFn: async (voucher: any) => {
      const voucherAmount = voucherSettlementCredit(voucher);

      // Reverse bill paid_amount if this voucher is linked to specific bills
      if (voucher.reference_type === "supplier" && voucher.reference_id) {
        // Check if reference_id is a bill ID (not a supplier ID)
        const { data: linkedBill } = await supabase
          .from("purchase_bills")
          .select("id, paid_amount, net_amount")
          .eq("id", voucher.reference_id)
          .is("deleted_at", null)
          .maybeSingle();

        if (linkedBill) {
          // Direct bill-linked payment — reverse on that single bill
          const newPaid = Math.max(0, (linkedBill.paid_amount || 0) - voucherAmount);
          const newStatus = newPaid >= (linkedBill.net_amount || 0) ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await supabase.from("purchase_bills").update({ paid_amount: newPaid, payment_status: newStatus }).eq("id", linkedBill.id);
        } else {
          // Supplier-level payment — try to find bills from description
          const desc = voucher.description || "";
          const billMatch = desc.match(/Bills?:\s*(.+?)(?:\s*\||$)/i);
          if (billMatch) {
            const billRefs = billMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean);
            if (billRefs.length > 0) {
              // Find matching bills by invoice number
              const { data: matchedBills } = await supabase
                .from("purchase_bills")
                .select("id, paid_amount, net_amount, supplier_invoice_no, software_bill_no")
                .eq("supplier_id", voucher.reference_id)
                .is("deleted_at", null);

              let remaining = voucherAmount;
              for (const bill of (matchedBills || [])) {
                if (remaining <= 0) break;
                const billRef = bill.supplier_invoice_no || bill.software_bill_no || bill.id.slice(0, 8);
                if (billRefs.includes(billRef)) {
                  const amountToReverse = Math.min(remaining, bill.paid_amount || 0);
                  const newPaid = Math.max(0, (bill.paid_amount || 0) - amountToReverse);
                  const newStatus = newPaid >= (bill.net_amount || 0) ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
                  await supabase.from("purchase_bills").update({ paid_amount: newPaid, payment_status: newStatus }).eq("id", bill.id);
                  remaining -= amountToReverse;
                }
              }
            }
          }
        }
      }

      const { data: acctDel } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (isAccountingEngineEnabled(acctDel as { accounting_engine_enabled?: boolean } | null)) {
        await deleteJournalEntryByReference(organizationId, "SupplierPayment", voucher.id, supabase);
      }

      // Soft-delete the voucher
      const { error } = await supabase.from("voucher_entries").update({ deleted_at: new Date().toISOString() }).eq("id", voucher.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Payment deleted");
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bills"] });
      queryClient.invalidateQueries({ queryKey: ["suppliers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-balance-snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["supplier-bill-payment-voucher-drift"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-summary"] });
      queryClient.invalidateQueries({ queryKey: ["journal-vouchers"] });
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createVoucher.mutate();
  };

  // Computed supplier payments for the table
  const allSupplierPayments = vouchers?.filter((v) => v.reference_type === "supplier" && (v.voucher_type === "payment" || v.voucher_type === "PAYMENT")) || [];
  const supplierPayments = paymentSearchTerm
    ? allSupplierPayments.filter((v) => {
        const supplierName = suppliers?.find((s) => s.id === v.reference_id)?.supplier_name || "";
        return supplierName.toLowerCase().includes(paymentSearchTerm.toLowerCase()) ||
          (v.voucher_number || "").toLowerCase().includes(paymentSearchTerm.toLowerCase()) ||
          (v.description || "").toLowerCase().includes(paymentSearchTerm.toLowerCase());
      })
    : allSupplierPayments;
  const formatEntryDateTime = (value: string | null | undefined) => {
    if (!value) return "-";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "-" : format(date, "dd/MM/yyyy, hh:mm a");
  };
  const totalPaymentPages = Math.ceil(supplierPayments.length / PAYMENTS_PER_PAGE);
  const startIdx = (paymentsPage - 1) * PAYMENTS_PER_PAGE;
  const endIdx = startIdx + PAYMENTS_PER_PAGE;
  const paginatedPayments = supplierPayments.slice(startIdx, endIdx);

  const supplierPaymentsGrandTotals = useMemo(() => {
    let cash = 0;
    let discount = 0;
    for (const v of supplierPayments) {
      cash += Number(v.total_amount || 0);
      discount += Number((v as { discount_amount?: number }).discount_amount || 0);
    }
    return { cash, discount, count: supplierPayments.length };
  }, [supplierPayments]);

  const paymentBreakdown = resolvePaymentBreakdown(amount, discountPercent, discountAmount);

  const billGridMaxHeight = useMemo(() => {
    const count = payableBills.length;
    if (count === 0) return undefined;
    const headerPx = 44;
    const rowPx = 36;
    const contentPx = headerPx + count * rowPx;
    const capPx = embedded ? 420 : 480;
    const vhCapPx =
      typeof window !== "undefined"
        ? embedded
          ? Math.round(window.innerHeight * 0.48)
          : Math.round(window.innerHeight * 0.55)
        : capPx;
    return Math.min(Math.max(contentPx, 200), capPx, vhCapPx);
  }, [payableBills.length, embedded]);

  useEffect(() => {
    if (discountPercent || discountAmount || discountReason || paymentBreakdown.discount > 0) {
      setShowDiscountOptions(true);
    }
  }, [discountPercent, discountAmount, discountReason, paymentBreakdown.discount]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Supplier Payment (PAY)</CardTitle>
          <CardDescription>Record payment made to suppliers - select bills or pay against opening balance</CardDescription>
        </CardHeader>
        <CardContent>
          {balanceSnapshotDegraded && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Supplier balances could not be fully computed from bills and vouchers. The list still loads; payable amounts may show as zero until data is corrected.
              </span>
            </div>
          )}
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

              {/* Supplier Search */}
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Popover open={supplierSearchOpen} onOpenChange={setSupplierSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" aria-expanded={supplierSearchOpen} className="w-full justify-between font-normal">
                      <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-left">
                      {referenceId ? (() => {
                        const supplier = suppliersWithBalance?.find(s => s.id === referenceId) || suppliers?.find(s => s.id === referenceId);
                        return supplier ? (
                          <>
                            <span className="truncate">{supplier.supplier_name}</span>
                            {supplier.outstandingBalance !== undefined && (
                              <Badge variant="destructive" className="shrink-0 tabular-nums">₹{(supplier.outstandingBalance || 0).toFixed(2)}</Badge>
                            )}
                          </>
                        ) : "Select supplier";
                      })() : "Select supplier..."}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="z-[200] w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(calc(100vw-2rem),42rem)] p-0"
                    align="start"
                    sideOffset={4}
                  >
                    <Command>
                      <CommandInput placeholder="Search suppliers..." value={supplierSearchTerm} onValueChange={setSupplierSearchTerm} />
                      <CommandList className="max-h-[min(50vh,360px)]">
                        <CommandEmpty>No supplier found.</CommandEmpty>
                        <CommandGroup heading="Suppliers with Balance">
                          {suppliersWithBalance?.filter(s => s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase())).map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={supplier.supplier_name}
                              className="flex items-center gap-2 py-2"
                              onSelect={() => {
                              setReferenceId(supplier.id);
                              setSelectedSupplierBillIds([]);
                              setAmount("");
                              setSupplierSearchOpen(false);
                              setSupplierSearchTerm("");
                            }}>
                              <Check className={cn("h-4 w-4 shrink-0", referenceId === supplier.id ? "opacity-100" : "opacity-0")} />
                              <span className="min-w-0 flex-1 text-left leading-snug">{supplier.supplier_name}</span>
                              <Badge variant="destructive" className="shrink-0 tabular-nums whitespace-nowrap">₹{(supplier.outstandingBalance || 0).toFixed(2)}</Badge>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                        <CommandGroup heading="All Suppliers">
                          {suppliers?.filter(s => s.supplier_name.toLowerCase().includes(supplierSearchTerm.toLowerCase()) && !suppliersWithBalance?.find(sw => sw.id === s.id)).map((supplier) => (
                            <CommandItem
                              key={supplier.id}
                              value={supplier.supplier_name}
                              className="flex items-center gap-2 py-2"
                              onSelect={() => {
                              setReferenceId(supplier.id);
                              setSelectedSupplierBillIds([]);
                              setAmount("");
                              setSupplierSearchOpen(false);
                              setSupplierSearchTerm("");
                            }}>
                              <Check className={cn("h-4 w-4 shrink-0", referenceId === supplier.id ? "opacity-100" : "opacity-0")} />
                              <span className="min-w-0 flex-1 text-left leading-snug">{supplier.supplier_name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {referenceId && supplierSnapshot !== undefined && (() => {
                  const lifetimeCr = lifetimePayable < -SUPPLIER_MIN_PENDING_RUPEE;
                  const showAsNoPayable =
                    lifetimePayable <= SUPPLIER_MIN_PENDING_RUPEE &&
                    listedBillPendingTotal < SUPPLIER_MIN_PENDING_RUPEE;
                  const displayPayable = Math.round(
                    lifetimePayable >= SUPPLIER_MIN_PENDING_RUPEE
                      ? lifetimePayable
                      : listedBillPendingTotal,
                  );
                  return (
                  <div className={cn(
                    "mt-2 p-3 border rounded-md",
                    lifetimeCr
                      ? "bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950 dark:to-teal-950 border-emerald-300 dark:border-emerald-700"
                      : showAsNoPayable
                        ? "bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 border-slate-200 dark:border-slate-700"
                        : "bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800",
                  )}>
                    {lifetimeCr ? (
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
                        Credit / Overpayment with Supplier:{" "}
                        <span className="text-lg font-bold">
                          ₹{Math.abs(Math.round(lifetimePayable)).toLocaleString("en-IN")}
                        </span>
                      </p>
                    ) : showAsNoPayable ? (
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        No payable balance — supplier account is settled or in credit
                      </p>
                    ) : (
                      <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                        Payable Balance:{" "}
                        <span className="text-lg font-bold">
                          ₹{displayPayable.toLocaleString("en-IN")}
                        </span>
                        {lifetimePayable < SUPPLIER_MIN_PENDING_RUPEE && listedBillPendingTotal >= SUPPLIER_MIN_PENDING_RUPEE && (
                          <span className="block text-xs font-normal mt-1 text-amber-800 dark:text-amber-200">
                            Bill list includes amounts offset by purchase return / credit notes (₹
                            {cnCreditPool.toLocaleString("en-IN", { minimumFractionDigits: 2 })} credit pool)
                          </span>
                        )}
                      </p>
                    )}
                    {cnCreditPool > 0 && !lifetimeCr && listedBillPendingTotal >= SUPPLIER_MIN_PENDING_RUPEE && (
                      <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                        Unapplied supplier credit available: ₹{cnCreditPool.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                  );
                })()}
              </div>
            </div>

            {/* Bill Selection */}
            {referenceId && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Select Bills (Optional)</Label>
                  {selectedSupplierBillIds.length > 0 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setSelectedSupplierBillIds([]); setAmount(""); }}>
                      <X className="h-4 w-4 mr-1" /> Clear Selection
                    </Button>
                  )}
                </div>
                {payableBills.length > 0 ? (
                  <div
                    className="border rounded-lg overflow-y-auto overflow-x-auto"
                    style={billGridMaxHeight ? { maxHeight: billGridMaxHeight } : undefined}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[50px]">Select</TableHead>
                          <TableHead>Bill No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="text-right">Bill Amt</TableHead>
                          <TableHead className="text-right">Paid</TableHead>
                          {cnCreditPool > 0 && <TableHead className="text-right">CN Offset</TableHead>}
                          <TableHead className="text-right">Payable</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payableBills.map((bill) => {
                          const netAmount = Number(bill.net_amount || 0);
                          const paidAmount = Math.max(
                            Number(bill.paid_amount || 0),
                            Number(safeMapGet<number>(voucherPaidByBill, bill.id) || 0),
                          );
                          const breakdown = safeMapGet<SupplierBillOutstandingBreakdown>(billOutstandingMap, bill.id);
                          const cnOffset = breakdown?.creditAllocated ?? 0;
                          const netPayable = breakdown?.netPayable ?? 0;
                          const isSelected = selectedSupplierBillIds.includes(bill.id);
                          const billDate = bill.bill_date ? new Date(bill.bill_date) : null;
                          const billDateText = billDate && !Number.isNaN(billDate.getTime()) ? format(billDate, "dd/MM/yyyy") : "-";
                          return (
                            <TableRow key={bill.id} className={cn("cursor-pointer transition-colors", isSelected && "bg-primary/5")}
                              onClick={() => {
                                if (isSelected) setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                else setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                              }}>
                              <TableCell>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <Checkbox checked={isSelected} onCheckedChange={(checked) => {
                                    if (checked === true) setSelectedSupplierBillIds(prev => [...prev, bill.id]);
                                    else setSelectedSupplierBillIds(prev => prev.filter(id => id !== bill.id));
                                  }} />
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{bill.supplier_invoice_no || bill.software_bill_no || bill.id.slice(0, 8)}</TableCell>
                              <TableCell>{billDateText}</TableCell>
                              <TableCell className="text-right">₹{netAmount.toFixed(2)}</TableCell>
                              <TableCell className="text-right text-muted-foreground">₹{paidAmount.toFixed(2)}</TableCell>
                              {cnCreditPool > 0 && (
                                <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                                  {cnOffset > 0 ? `-₹${cnOffset.toFixed(2)}` : "—"}
                                </TableCell>
                              )}
                              <TableCell className="text-right font-semibold text-rose-600 dark:text-rose-400">₹{netPayable.toFixed(2)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : supplierBills && supplierBills.length > 0 ? (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground bg-muted/30">
                    {lifetimePayable < -SUPPLIER_MIN_PENDING_RUPEE
                      ? "All bills are covered by credit / overpayment — no cash payment needed"
                      : "Pending bill amounts are fully offset by supplier credit notes"}
                  </div>
                ) : (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground bg-muted/30">No outstanding bills found for this supplier</div>
                )}
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="text-sm">
                    {selectedSupplierBillIds.length > 0 ? (
                      <div className="space-y-0.5">
                        <div className="font-medium">
                          {selectedSupplierBillIds.length} bill(s) selected • Subtotal: <span className="text-primary font-bold">
                            ₹{getSelectedRawSubtotal().toFixed(2)}
                          </span>
                        </div>
                        {getSelectedCreditApplied() > 0 && (
                          <div className="text-emerald-700 dark:text-emerald-400">
                            Less: Credit Notes / Returns: -₹{getSelectedCreditApplied().toFixed(2)}
                          </div>
                        )}
                        <div className="font-semibold text-foreground">
                          Grand Total: ₹{getSelectedPayableTotal().toFixed(2)}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground flex items-center gap-1"><AlertCircle className="h-4 w-4" /> No bills selected = Opening Balance payment (only when payable balance &gt; 0)</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>
                    {selectedSupplierBillIds.length > 0 ? "Settlement Amount" : "Amount"}
                    {selectedSupplierBillIds.length > 0 && (
                      <span className="text-xs text-muted-foreground"> (Auto-filled)</span>
                    )}
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
                        selectedSupplierBillIds.length > 0 ? roundToRupee(getSelectedPayableTotal()) : Infinity;
                      setAmount(Math.min(entered, maxAllowed).toFixed(2));
                    }}
                    required
                    className="no-uppercase"
                  />
                  {selectedSupplierBillIds.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Total against selected bill(s). Use &quot;Discount&quot; below if applying settlement discount.
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-900/50 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowDiscountOptions((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors"
                  aria-expanded={showDiscountOptions}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <TrendingDown className="h-4 w-4 shrink-0" />
                    Discount (optional)
                    {paymentBreakdown.discount > 0 && (
                      <Badge variant="secondary" className="text-xs font-normal tabular-nums">
                        −₹{paymentBreakdown.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </Badge>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      showDiscountOptions && "rotate-180",
                    )}
                  />
                </button>
                {showDiscountOptions && (
                <div className="px-3 pb-3 pt-1 space-y-4 border-t border-slate-200 dark:border-slate-700">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
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
                        const pct = Math.min(100, Math.max(0, Number(raw) || 0));
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
                      {paymentBreakdown.discount > 0 && <span className="text-red-500"> *</span>}
                    </Label>
                    <Input
                      placeholder="e.g., Early payment"
                      value={discountReason}
                      onChange={(e) => setDiscountReason(e.target.value)}
                      className="no-uppercase"
                    />
                  </div>
                </div>
                {paymentBreakdown.settlement > 0 && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <span>Settlement (bill total):</span>
                      <span className="font-medium">
                        ₹{paymentBreakdown.settlement.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    {paymentBreakdown.discount > 0 && (
                      <div className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>
                          − Discount
                          {paymentBreakdown.discountPercent > 0
                            ? ` (${paymentBreakdown.discountPercent}%)`
                            : ""}
                          :
                        </span>
                        <span className="font-medium text-amber-700 dark:text-amber-400">
                          ₹{paymentBreakdown.discount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}
                    <Separator className="my-2" />
                    <div className="flex justify-between items-center text-base font-bold text-green-700 dark:text-green-400">
                      <span>Cash to pay:</span>
                      <span>
                        ₹{paymentBreakdown.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                )}
                </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {paymentMethod === "cheque" && (
                <>
                  <div className="space-y-2">
                    <Label>Cheque Number</Label>
                    <Input placeholder="Enter cheque number" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Cheque Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !chequeDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {chequeDate ? format(chequeDate, "PPP") : <span>Pick date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={chequeDate} onSelect={setChequeDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                  </div>
                </>
              )}

              {(paymentMethod === "bank_transfer" || paymentMethod === "upi") && (
                <div className="space-y-2">
                  <Label>Transaction Number</Label>
                  <Input placeholder="Enter UTR / Reference ID" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea placeholder="Payment description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                type="submit"
                className="w-full md:w-auto"
                disabled={
                  createVoucher.isPending ||
                  savingRef.current ||
                  (referenceId &&
                    lifetimePayable <= SUPPLIER_MIN_PENDING_RUPEE &&
                    listedBillPendingTotal < SUPPLIER_MIN_PENDING_RUPEE &&
                    selectedSupplierBillIds.length === 0)
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                {createVoucher.isPending ? "Recording..." : "Record Payment"}
              </Button>
              {paymentMethod === "cheque" && paymentBreakdown.cash > 0 && referenceId && (
                <Button type="button" variant="outline" onClick={() => setShowChequePrintDialog(true)}>
                  <Printer className="mr-2 h-4 w-4" /> Print Cheque
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {!embedded && (
      <AccountsHistoryPanel
        title="Recent Supplier Payments"
        searchPlaceholder="Search by supplier name, voucher no, or description..."
        searchValue={paymentSearchTerm}
        onSearchChange={(v) => { setPaymentSearchTerm(v); setPaymentsPage(1); }}
        toolbar={
          isAdmin && selectedPaymentIds.length > 0 ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-9">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Selected ({selectedPaymentIds.length})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Selected Payments?</AlertDialogTitle>
                  <AlertDialogDescription>This will delete {selectedPaymentIds.length} payment(s).</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    const selected = supplierPayments.filter((v) => selectedPaymentIds.includes(v.id));
                    selected.forEach((v) => deletePayment.mutate(v));
                    setSelectedPaymentIds([]);
                  }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : undefined
        }
        footer={
          totalPaymentPages > 1 ? (
            <>
              <p className="text-muted-foreground">Showing {startIdx + 1}-{Math.min(endIdx, supplierPayments.length)} of {supplierPayments.length} payments</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPaymentsPage(p => Math.max(1, p - 1))} disabled={paymentsPage === 1}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <span className="font-medium px-2">Page {paymentsPage} of {totalPaymentPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPaymentsPage(p => Math.min(totalPaymentPages, p + 1))} disabled={paymentsPage === totalPaymentPages}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
          <Table className={accountsHistoryTableClass}>
            <TableHeader className="!static">
              <TableRow>
                {isAdmin && <TableHead className={cn(accountsHistoryThClass, "w-10")}></TableHead>}
                <TableHead className={accountsHistoryThClass}>Voucher No</TableHead>
                <TableHead className={accountsHistoryThClass}>Date</TableHead>
                <TableHead className={accountsHistoryThClass}>Entry Date &amp; Time</TableHead>
                <TableHead className={accountsHistoryThClass}>Supplier</TableHead>
                <TableHead className={cn(accountsHistoryThClass, "text-right")}>Cash Paid</TableHead>
                <TableHead className={cn(accountsHistoryThClass, "text-right")}>Discount</TableHead>
                <TableHead className={accountsHistoryThClass}>Method</TableHead>
                <TableHead className={accountsHistoryThClass}>Description</TableHead>
                {isAdmin && <TableHead className={cn(accountsHistoryThClass, "text-right")}>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedPayments.map((voucher) => {
                const supplierName =
                  suppliers?.find((s) => s.id === voucher.reference_id)?.supplier_name ||
                  voucher.description?.match(/Supplier:\s*([^|]+)/i)?.[1]?.trim() ||
                  "-";
                const isSelected = selectedPaymentIds.includes(voucher.id);
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
                    <TableCell>{supplierName}</TableCell>
                    <TableCell className="tabular-nums text-right">
                      ₹{Number(voucher.total_amount || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="tabular-nums text-right text-amber-700 dark:text-amber-400">
                      {Number((voucher as { discount_amount?: number }).discount_amount || 0) > 0
                        ? `₹${Number((voucher as { discount_amount?: number }).discount_amount).toFixed(2)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="uppercase text-xs">{voucher.payment_method || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">{voucher.description}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {voucher.description?.includes("Bill") && (
                            <Button variant="ghost" size="icon" title="Linked to Bill" className="text-primary">
                              <Link2 className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Edit Payment" onClick={() => onEditPayment?.(voucher)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Print" onClick={() => window.print()}>
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
      </AccountsHistoryPanel>
      )}

      <ChequePrintDialog
        open={showChequePrintDialog}
        onOpenChange={setShowChequePrintDialog}
        payeeName={suppliers?.find(s => s.id === referenceId)?.supplier_name || ""}
        amount={paymentBreakdown.cash || 0}
        chequeDate={chequeDate || new Date()}
        chequeNumber={chequeNumber}
      />
    </div>
  );
}
