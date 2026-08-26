import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckCircle2, IndianRupee, Receipt } from "lucide-react";
import { ListSkeleton } from "@/components/ui/skeletons";
import { useToast } from "@/hooks/use-toast";
import {
  applyCreditNoteFifoToSale,
  consumeAdvanceFIFO,
  createReceiptVoucher,
  getAvailableCN,
} from "@/utils/saleSettlement";
import { formatCnApplyError } from "@/utils/saleReturnCnBalance";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { useCustomerFinancialSnapshot } from "@/hooks/useCustomerFinancialSnapshot";
import { invalidateMoneyViewsAfterMutation } from "@/utils/moneyViewFreshnessInvalidation";
import { fetchCustomerOpeningBalanceRemaining } from "@/utils/customerOpeningBalanceRemaining";
import {
  allocateSettleSources,
  SETTLE_MIN_PENDING_RUPEE,
  SETTLE_OPENING_BALANCE_ID,
  settleAllocationTotals,
} from "@/utils/settleCustomerAccountAllocation";
import {
  assertCustomerPaymentWithinOutstandingCap,
  formatPaymentExceedsOutstandingMessage,
  paymentExceedsOutstandingCap,
} from "@/utils/invoiceOverpaymentGuard";
import {
  recordCustomerAdvanceApplicationJournalEntry,
  recordCustomerReceiptJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";

export interface SettleCustomerAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string | null;
  customerName?: string;
  organizationId: string;
  onSuccess?: () => void;
}

type PendingInvoice = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number;
  paid_amount: number;
  sale_return_adjust: number;
  payment_status: string;
  payment_method: string;
  delivery_status: string | null;
  outstanding: number;
};

const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function SettleCustomerAccountDialog({
  open,
  onOpenChange,
  customerId,
  customerName = "Customer",
  organizationId,
  onSuccess,
}: SettleCustomerAccountDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set());
  const [cashAmount, setCashAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "upi" | "card" | "bank_transfer">("cash");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [narration, setNarration] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const settleProcessingRef = useRef(false);
  const [settled, setSettled] = useState(false);
  const [settledSummary, setSettledSummary] = useState("");

  const resetForm = () => {
    setSelectedInvoices(new Set());
    setCashAmount("");
    setPaymentMode("cash");
    setDiscountAmount("");
    setDiscountReason("");
    setNarration("");
    setSettled(false);
    setSettledSummary("");
  };

  useEffect(() => {
    if (!open) {
      resetForm();
      return;
    }
    setSettled(false);
    setSettledSummary("");
  }, [open, customerId]);

  const { data: pendingInvoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["settle-pending-invoices", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sale_date, net_amount, paid_amount, sale_return_adjust, payment_status, payment_method, delivery_status"
        )
        .eq("customer_id", customerId!)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .or("is_cancelled.is.null,is_cancelled.eq.false")
        .in("payment_status", ["pending", "partial"])
        .order("sale_date", { ascending: true });
      if (error) throw error;
      return (data || [])
        .map((inv) => ({
          ...inv,
          paid_amount: inv.paid_amount || 0,
          sale_return_adjust: inv.sale_return_adjust || 0,
          net_amount: inv.net_amount || 0,
          outstanding: Math.max(
            0,
            (inv.net_amount || 0) - (inv.paid_amount || 0) - (inv.sale_return_adjust || 0)
          ),
        }))
        .filter((inv) => inv.outstanding > 0.5) as PendingInvoice[];
    },
    enabled: !!customerId && open && !!organizationId,
    staleTime: 5000,
  });

  const { data: openingBalanceRemaining = 0 } = useQuery({
    queryKey: ["customer-opening-balance-remaining", organizationId, customerId],
    queryFn: () =>
      fetchCustomerOpeningBalanceRemaining(
        supabase,
        organizationId,
        customerId!,
        queryClient,
      ),
    enabled: !!customerId && open && !!organizationId,
    staleTime: 5000,
  });

  const obClaimable =
    Number(openingBalanceRemaining || 0) >= SETTLE_MIN_PENDING_RUPEE
      ? Number(openingBalanceRemaining)
      : 0;
  const obSelected = obClaimable > 0 && selectedInvoices.has(SETTLE_OPENING_BALANCE_ID);

  useEffect(() => {
    if (!open) return;
    const next = new Set((pendingInvoices || []).map((i) => i.id));
    if (obClaimable > 0) next.add(SETTLE_OPENING_BALANCE_ID);
    setSelectedInvoices(next);
  }, [open, pendingInvoices, obClaimable]);

  const { data: advanceData } = useQuery({
    queryKey: ["settle-advance", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_advances")
        .select("id, amount, used_amount, advance_number, status")
        .eq("customer_id", customerId!)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .in("status", ["active", "partially_used"]);
      if (error) throw error;
      const total = (data || []).reduce(
        (s, a) => s + Math.max(0, (a.amount || 0) - (a.used_amount || 0)),
        0
      );
      return { total, advances: data || [] };
    },
    enabled: !!customerId && open && !!organizationId,
    staleTime: 5000,
  });

  const { data: cnData } = useQuery({
    queryKey: ["settle-cn", customerId, organizationId],
    queryFn: () => getAvailableCN(supabase, customerId!, organizationId, { includeUnlinkedAdjusted: true }),
    enabled: !!customerId && open && !!organizationId,
    staleTime: 5000,
  });

  const {
    outstandingDr: snapshotOutstanding,
    advanceAvailable: snapshotAdvance,
    cnAvailableTotal: snapshotCnTotal,
  } = useCustomerFinancialSnapshot(open ? customerId : null, organizationId);

  const selectedInvoiceRows = useMemo(() => {
    return (pendingInvoices || [])
      .filter((inv) => selectedInvoices.has(inv.id))
      .sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime())
      .map((inv) => ({ id: inv.id, outstanding: inv.outstanding, sale_number: inv.sale_number, sale_date: inv.sale_date, paid_amount: inv.paid_amount, sale_return_adjust: inv.sale_return_adjust, net_amount: inv.net_amount }));
  }, [pendingInvoices, selectedInvoices]);

  const selectedInvoiceTotal = useMemo(
    () => selectedInvoiceRows.reduce((sum, inv) => sum + inv.outstanding, 0),
    [selectedInvoiceRows],
  );

  const obForPlan = obSelected ? obClaimable : 0;
  const selectedTotal = obForPlan + selectedInvoiceTotal;

  const availableAdvance = snapshotAdvance || advanceData?.total || 0;
  const availableCN = snapshotCnTotal || cnData?.total || 0;
  const trueOutstanding = snapshotOutstanding;
  const discountToApply = Math.max(0, parseFloat(discountAmount) || 0);

  const dryAllocation = useMemo(
    () =>
      allocateSettleSources({
        openingBalanceRemaining: obForPlan,
        invoices: selectedInvoiceRows,
        advancePool: availableAdvance,
        cnPool: availableCN,
        cash: 0,
        discount: discountToApply,
      }),
    [obForPlan, selectedInvoiceRows, availableAdvance, availableCN, discountToApply],
  );
  const dryTotals = settleAllocationTotals(dryAllocation);
  const cashNeeded = Math.max(0, Math.round((selectedTotal - dryTotals.total) * 100) / 100);
  const cashEntered = parseFloat(cashAmount) || 0;

  const liveAllocation = useMemo(
    () =>
      allocateSettleSources({
        openingBalanceRemaining: obForPlan,
        invoices: selectedInvoiceRows,
        advancePool: availableAdvance,
        cnPool: availableCN,
        cash: cashEntered,
        discount: discountToApply,
      }),
    [obForPlan, selectedInvoiceRows, availableAdvance, availableCN, cashEntered, discountToApply],
  );
  const liveTotals = settleAllocationTotals(liveAllocation);
  const advanceToApply = liveTotals.advance;
  const cnToApply = liveTotals.cn;

  useEffect(() => {
    if (!open || settled) return;
    setCashAmount(cashNeeded > 0.01 ? String(Math.round(cashNeeded * 100) / 100) : "");
  }, [cashNeeded, open, settled]);

  const toggleInvoice = (id: string) => {
    setSelectedInvoices((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const invoiceIds = (pendingInvoices || []).map((i) => i.id);
    const allIds = obClaimable > 0 ? [...invoiceIds, SETTLE_OPENING_BALANCE_ID] : invoiceIds;
    if (allIds.length === 0) return;
    const allSelected = allIds.every((id) => selectedInvoices.has(id));
    if (allSelected) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(allIds));
    }
  };

  const sortedCnReturns = useMemo(() => {
    const rows = [...(cnData?.returns || [])];
    rows.sort((a, b) => {
      const da = a.return_date ? new Date(a.return_date).getTime() : 0;
      const db = b.return_date ? new Date(b.return_date).getTime() : 0;
      return da - db;
    });
    return rows;
  }, [cnData?.returns]);

  const syncSaleFromVouchers = async (invoiceId: string, voucherDate: string) => {
    const result = await applyRecomputedSalePaymentState(
      invoiceId,
      organizationId,
      supabase,
    );
    if (!result.skipped) {
      const { error: dateErr } = await supabase
        .from("sales")
        .update({ payment_date: voucherDate })
        .eq("id", invoiceId)
        .eq("organization_id", organizationId);
      if (dateErr) throw dateErr;
    }
    return result;
  };

  const handleSettle = async () => {
    if (!customerId || selectedTotal <= 0 || isProcessing || selectedInvoices.size === 0) return;
    if (settleProcessingRef.current) return;
    settleProcessingRef.current = true;
    setIsProcessing(true);

    try {
    let liveCnPool = sortedCnReturns.map((r) => ({ ...r, available: r.available }));
    if (cnToApply > 0.01) {
      try {
        const live = await getAvailableCN(supabase, customerId, organizationId, {
          includeUnlinkedAdjusted: true,
        });
        liveCnPool = live.returns;
        if (live.total <= 0.01) {
          toast({
            title: "No CN balance",
            description: "Customer has no credit note pool available. Use cash/advance or adjust CN on an invoice first.",
            variant: "destructive",
          });
          return;
        }
        if (cnToApply > live.total + 0.01) {
          toast({
            title: "Insufficient CN balance",
            description: `Live CN pool is ₹${live.total.toLocaleString("en-IN")}; cannot apply ₹${cnToApply.toLocaleString("en-IN")}.`,
            variant: "destructive",
          });
          return;
        }
      } catch (cnErr) {
        console.error("CN balance refetch failed:", cnErr);
        toast({
          title: "Error",
          description: "Could not verify credit note balance. Please retry.",
          variant: "destructive",
        });
        return;
      }
    }

    const cashTyped = parseFloat(cashAmount) || 0;
    const requestedTotal =
      advanceToApply + cnToApply + discountToApply + cashTyped;
    if (requestedTotal <= 0.01) {
      toast({
        title: "Nothing to apply",
        description: "Enter cash/UPI amount, discount, or ensure advance/CN is available.",
        variant: "destructive",
      });
      return;
    }

    if (paymentExceedsOutstandingCap(requestedTotal, selectedTotal)) {
      toast({
        title: "Amount too high",
        description: formatPaymentExceedsOutstandingMessage(selectedTotal),
        variant: "destructive",
      });
      return;
    }

    await assertCustomerPaymentWithinOutstandingCap(supabase, {
      organizationId,
      saleIds: selectedInvoiceRows.map((inv) => inv.id),
      customerId,
      includeOpeningBalance: obSelected,
      proposedSettlement: requestedTotal,
      queryClient,
    });

    const plan = allocateSettleSources({
      openingBalanceRemaining: obForPlan,
      invoices: selectedInvoiceRows,
      advancePool: availableAdvance,
      cnPool: availableCN,
      cash: cashTyped,
      discount: discountToApply,
    });
    const applied = settleAllocationTotals(plan);
    const isPartialSettlement = applied.total < selectedTotal - 0.5;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const voucherDate = format(new Date(), "yyyy-MM-dd");

      const { data: acctRow } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const postLedger = isAccountingEngineEnabled(
        acctRow as { accounting_engine_enabled?: boolean | null } | null,
      );

      const postAdvanceJournal = async (
        vouchers: string[],
        amount: number,
        description: string,
      ) => {
        if (!postLedger || amount <= 0.01 || vouchers.length === 0) return;
        await recordCustomerAdvanceApplicationJournalEntry(
          vouchers[vouchers.length - 1],
          organizationId,
          amount,
          voucherDate,
          description,
          supabase,
        );
      };

      if (plan.advanceToOb > 0.01) {
        const { consumed, vouchers } = await consumeAdvanceFIFO(supabase, {
          customerId,
          organizationId,
          targetOpeningBalance: true,
          requestedAmount: plan.advanceToOb,
          voucherDate,
          createdBy: user?.id ?? null,
        });
        await postAdvanceJournal(
          vouchers,
          consumed,
          "Adjusted from advance balance for Opening Balance",
        );
      }

      if (plan.cashToOb > 0.01 || plan.discountToOb > 0.01) {
        const obDesc =
          narration.trim() || "Opening Balance Payment";
        const created = await createReceiptVoucher(supabase, {
          organizationId,
          referenceId: customerId,
          referenceType: "customer",
          amount: plan.cashToOb,
          discountAmount: plan.discountToOb > 0.01 ? plan.discountToOb : undefined,
          discountReason: plan.discountToOb > 0.01 ? discountReason || undefined : undefined,
          paymentMethod: paymentMode,
          description: obDesc,
          voucherDate,
          createdBy: user?.id ?? null,
        });
        if (postLedger && created.id) {
          await recordCustomerReceiptJournalEntry(
            created.id,
            organizationId,
            plan.cashToOb + plan.discountToOb,
            plan.discountToOb,
            paymentMode,
            voucherDate,
            obDesc,
            supabase,
          );
        }
      }

      const cnPool = liveCnPool;
      const saleById = new Map(selectedInvoiceRows.map((inv) => [inv.id, inv]));

      for (const row of plan.invoices) {
        const inv = saleById.get(row.id);
        if (!inv) continue;
        if (row.advance <= 0.01 && row.cn <= 0.01 && row.cash <= 0.01 && row.discount <= 0.01) {
          continue;
        }

        if (row.advance > 0.01) {
          const { consumed, vouchers } = await consumeAdvanceFIFO(supabase, {
            customerId,
            organizationId,
            saleId: row.id,
            requestedAmount: row.advance,
            voucherDate,
            createdBy: user?.id ?? null,
          });
          await postAdvanceJournal(
            vouchers,
            consumed,
            `Adjusted from advance balance for ${inv.sale_number}`,
          );
        }

        if (row.cn > 0.01) {
          await applyCreditNoteFifoToSale(supabase, {
            organizationId,
            saleId: row.id,
            amount: row.cn,
            cnPool,
            customerNameFallback: customerName,
            adjustedBy: user?.id ?? null,
          });
        }

        if (row.cash > 0.01 || row.discount > 0.01) {
          await createReceiptVoucher(supabase, {
            organizationId,
            referenceId: row.id,
            amount: row.cash,
            discountAmount: row.discount > 0.01 ? row.discount : undefined,
            discountReason: row.discount > 0.01 ? discountReason || undefined : undefined,
            paymentMethod: paymentMode,
            description: narration.trim() || `Payment for ${inv.sale_number}`,
            voucherDate,
            createdBy: user?.id ?? null,
          });
        }

        await syncSaleFromVouchers(row.id, voucherDate);
      }

      const targetLabel = [
        obSelected ? "opening balance" : null,
        selectedInvoiceRows.length
          ? `${selectedInvoiceRows.length} invoice(s)`
          : null,
      ]
        .filter(Boolean)
        .join(" + ");
      const summary = isPartialSettlement
        ? `₹${Math.round(applied.total).toLocaleString("en-IN")} applied to ${targetLabel} (₹${Math.round(selectedTotal - applied.total).toLocaleString("en-IN")} still due on selection)`
        : `₹${Math.round(applied.total).toLocaleString("en-IN")} settled across ${targetLabel}`;
      setSettledSummary(summary);
      setSettled(true);
      toast({
        title: isPartialSettlement ? "Partial settlement recorded" : "Settlement recorded",
        description: summary,
      });

      queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["sales-invoice-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-unified"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advance-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["settle-"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-history"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
      queryClient.invalidateQueries({ queryKey: ["customer-opening-balance-remaining"] });
      invalidateMoneyViewsAfterMutation(queryClient, organizationId, customerId);

      onSuccess?.();
    } catch (err: unknown) {
      console.error("Settlement error:", err);
      toast({ title: "Settlement failed", description: formatCnApplyError(err), variant: "destructive" });
    } finally {
      settleProcessingRef.current = false;
      setIsProcessing(false);
    }
  };

  const previewRows = useMemo(() => {
    const invoiceById = new Map(selectedInvoiceRows.map((inv) => [inv.id, inv]));
    const rows: Array<{ id: string; label: string; outstanding: number; newBal: number }> = [];
    if (obSelected) {
      const newBal = Math.max(
        0,
        obForPlan - liveAllocation.advanceToOb - liveAllocation.cashToOb - liveAllocation.discountToOb,
      );
      rows.push({
        id: SETTLE_OPENING_BALANCE_ID,
        label: "Opening Balance",
        outstanding: obForPlan,
        newBal,
      });
    }
    for (const row of liveAllocation.invoices) {
      const inv = invoiceById.get(row.id);
      if (!inv) continue;
      const applied = row.advance + row.cn + row.cash + row.discount;
      rows.push({
        id: row.id,
        label: inv.sale_number,
        outstanding: inv.outstanding,
        newBal: Math.max(0, inv.outstanding - applied),
      });
    }
    return rows;
  }, [obSelected, obForPlan, liveAllocation, selectedInvoiceRows]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!isProcessing) onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <div className="h-1 w-full bg-gradient-to-r from-emerald-600 via-primary to-teal-500 rounded-t-lg flex-shrink-0" />
        <DialogHeader className="px-5 pt-4 pb-2 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-emerald-600" />
            Settle Customer Account — {customerName}
          </DialogTitle>
          <DialogDescription>
            Apply advance, credit notes, and cash. Opening balance is settled first, then invoices by date.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-5">
          <div className="space-y-4 pb-4 pr-2">
            {settled ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
                <p className="font-semibold text-emerald-800">Settlement complete</p>
                <p className="text-sm text-emerald-700">{settledSummary}</p>
                <Button className="mt-2" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                    <p className="text-[10px] uppercase font-semibold text-red-700">Outstanding</p>
                    <p className="text-lg font-bold text-red-800 tabular-nums">
                      {invoicesLoading ? "…" : fmt(trueOutstanding || 0)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-center">
                    <p className="text-[10px] uppercase font-semibold text-purple-700">Advance</p>
                    <p className="text-lg font-bold text-purple-800 tabular-nums">{fmt(availableAdvance)}</p>
                  </div>
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
                    <p className="text-[10px] uppercase font-semibold text-amber-700">CN Available</p>
                    <p className="text-lg font-bold text-amber-800 tabular-nums">{fmt(availableCN)}</p>
                    {availableCN <= 0.01 && (
                      <p className="text-[10px] text-amber-900/80 mt-1">No CN pool — use Adjust CN on invoice</p>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Pending invoices</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleSelectAll}>
                      {(pendingInvoices?.length || 0) + (obClaimable > 0 ? 1 : 0) > 0 &&
                      (obClaimable <= 0 || selectedInvoices.has(SETTLE_OPENING_BALANCE_ID)) &&
                      (pendingInvoices || []).every((i) => selectedInvoices.has(i.id))
                        ? "Deselect all"
                        : "Select all"}
                    </Button>
                  </div>
                  {invoicesLoading ? (
                    <div className="py-2" aria-busy="true">
                      <ListSkeleton items={4} showIcon={false} />
                    </div>
                  ) : !pendingInvoices?.length && obClaimable <= 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No opening balance or pending invoices.</p>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {obClaimable > 0 && (
                        <label
                          className="flex items-center gap-3 p-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selectedInvoices.has(SETTLE_OPENING_BALANCE_ID)}
                            onCheckedChange={() => toggleInvoice(SETTLE_OPENING_BALANCE_ID)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-amber-800 dark:text-amber-300">Opening Balance</div>
                            <div className="text-xs text-muted-foreground">Settled first (before invoices)</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold tabular-nums">{fmt(obClaimable)}</div>
                          </div>
                        </label>
                      )}
                      {pendingInvoices?.map((inv) => (
                        <label
                          key={inv.id}
                          className="flex items-center gap-3 p-2.5 hover:bg-muted/40 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selectedInvoices.has(inv.id)}
                            onCheckedChange={() => toggleInvoice(inv.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium">{inv.sale_number}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(inv.sale_date), "dd/MM/yyyy")}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-semibold tabular-nums">{fmt(inv.outstanding)}</div>
                            <Badge variant="outline" className="text-[10px] h-5 capitalize">
                              {inv.payment_status}
                            </Badge>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                  {selectedTotal > 0 && (
                    <p className="text-sm font-medium text-right mt-2 tabular-nums">
                      Selected total: {fmt(selectedTotal)}
                    </p>
                  )}
                  {selectedInvoices.size > 1 && cashNeeded > 0.01 && (
                    <p className="text-xs text-amber-700 text-right mt-1">
                      Tip: Deselect invoices you are not paying now, or enter enough cash to cover the full selection.
                    </p>
                  )}
                </div>

                <div className="rounded-lg border bg-slate-50 p-3 space-y-2 text-sm">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Settlement breakdown</p>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-purple-500" />
                      From advance
                    </span>
                    <span className="font-medium tabular-nums">{fmt(advanceToApply)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-amber-500" />
                      From credit note
                    </span>
                    <span className="font-medium tabular-nums">{fmt(cnToApply)}</span>
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="h-2 w-2 rounded-full bg-orange-500" />
                      Discount
                    </span>
                    <Input
                      type="number"
                      className="h-8 w-28 text-right"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      placeholder="0"
                      min={0}
                    />
                  </div>
                  <div className="flex justify-between items-center gap-2">
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Cash / UPI / Card
                    </span>
                    <div className="flex gap-1">
                      <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as typeof paymentMode)}>
                        <SelectTrigger className="h-8 w-24 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="upi">UPI</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="bank_transfer">Bank</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        className="h-8 w-28 text-right"
                        value={cashAmount}
                        onChange={(e) => setCashAmount(e.target.value)}
                        min={0}
                      />
                    </div>
                  </div>
                  {discountToApply > 0 && (
                    <div>
                      <Label className="text-xs">Discount reason</Label>
                      <Input
                        className="h-8 mt-1"
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                  )}
                </div>

                {selectedTotal > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3 space-y-2 text-xs">
                    <p className="font-semibold text-blue-900 uppercase tracking-wide">After settlement</p>
                    {previewRows.map(({ id, label, outstanding, newBal }) => (
                      <div key={id} className="flex justify-between gap-2">
                        <span className="font-medium">{label}</span>
                        <span>
                          {fmt(outstanding)} →{" "}
                          <span className={newBal <= 0.5 ? "text-emerald-700 font-semibold" : "text-amber-700"}>
                            {fmt(newBal)}
                          </span>
                        </span>
                      </div>
                    ))}
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>New outstanding (approx.)</span>
                      <span className="tabular-nums">
                        {fmt(Math.max(0, (trueOutstanding || 0) - selectedTotal))}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs">Narration (optional)</Label>
                  <Textarea
                    className="mt-1 min-h-[60px] text-sm"
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                    placeholder="Payment note for receipts…"
                  />
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {!settled && (
          <DialogFooter className="px-5 py-3 border-t flex-shrink-0 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={isProcessing || selectedTotal <= 0 || selectedInvoices.size === 0}
              onClick={handleSettle}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Settling…
                </>
              ) : (
                <>
                  <IndianRupee className="h-4 w-4 mr-1" />
                  Settle {fmt(selectedTotal)}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
