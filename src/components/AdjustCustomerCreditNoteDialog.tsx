import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Loader2, IndianRupee } from "lucide-react";
import { useOpenCustomerAccount } from "@/hooks/useOpenCustomerAccount";
import {
  recordCustomerCreditNoteApplicationJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { cn } from "@/lib/utils";
import { ensureCreditNoteForSaleReturn } from "@/utils/ensureCreditNoteForSaleReturn";
import { insertLedgerCredit } from "@/lib/customerLedger";
import { invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import {
  ensureCreditNoteHeadroom,
  formatCnApplyError,
  resolveSaleReturnCnAvailable,
} from "@/utils/saleReturnCnBalance";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";

interface AdjustCustomerCreditNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleReturnId: string;
  creditNoteId: string;
  returnNumber: string;
  creditAmount: number;
  customerId: string;
  customerName: string;
  onSuccess?: () => void;
}

function invoiceOutstanding(sale: {
  net_amount?: number | null;
  paid_amount?: number | null;
  sale_return_adjust?: number | null;
}): number {
  const net = Number(sale.net_amount || 0);
  const paid = Number(sale.paid_amount || 0);
  const sr = Number(sale.sale_return_adjust || 0);
  return Math.max(0, Math.round(net - paid - sr));
}

export function AdjustCustomerCreditNoteDialog({
  open,
  onOpenChange,
  saleReturnId,
  creditNoteId,
  returnNumber,
  creditAmount,
  customerId,
  customerName,
  onSuccess,
}: AdjustCustomerCreditNoteDialogProps) {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [adjustmentType, setAdjustmentType] = useState<"invoice" | "refund">("invoice");
  const [refundMode, setRefundMode] = useState<"cash" | "bank">("cash");
  const [loading, setLoading] = useState(false);
  const openCustomerAccount = useOpenCustomerAccount();
  /** Rupee amount allocated per sale id */
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { data: returnMeta, isLoading: returnMetaLoading } = useQuery({
    queryKey: ["cn-adjust-return-meta", saleReturnId, currentOrganization?.id, open],
    queryFn: async () => {
      if (!saleReturnId || !currentOrganization?.id || !open) return null;
      return resolveSaleReturnCnAvailable(supabase, {
        organizationId: currentOrganization.id,
        saleReturnId,
        healCabDrift: true,
      });
    },
    enabled: open && !!saleReturnId && !!currentOrganization?.id,
    staleTime: 0,
  });

  const cnAvailable = useMemo(() => {
    if (returnMeta) return Math.max(0, Math.round(returnMeta.available));
    return Math.max(0, Math.round(Number(creditAmount || 0)));
  }, [returnMeta, creditAmount]);

  const { data: unpaidSales = [], isLoading: salesLoading } = useQuery({
    queryKey: ["unpaid-customer-sales", customerId, currentOrganization?.id],
    queryFn: async () => {
      if (!customerId || customerId === "" || !currentOrganization?.id) return [];

      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sale_date, net_amount, paid_amount, payment_status, is_cancelled, sale_return_adjust"
        )
        .eq("customer_id", customerId)
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .or("payment_status.is.null,payment_status.neq.completed")
        .order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      return (salesData || [])
        .filter((sale: any) => !sale.is_cancelled)
        .map((sale: any) => ({
          ...sale,
          outstanding: invoiceOutstanding(sale),
        }))
        .filter((sale: any) => sale.outstanding > 0.01);
    },
    enabled: open && !!customerId && customerId !== "" && !!currentOrganization?.id,
  });

  useEffect(() => {
    if (!open) return;
    setAllocations({});
    setCheckedIds(new Set());
  }, [open, saleReturnId]);

  const totalAllocated = useMemo(() => {
    return Object.values(allocations).reduce((s, v) => s + (Number(v) || 0), 0);
  }, [allocations]);

  const remainingCn = useMemo(() => cnAvailable - totalAllocated, [cnAvailable, totalAllocated]);
  const overAllocated = remainingCn < -0.01;

  const sumAllocationsExcept = useCallback(
    (saleId: string) => {
      let s = 0;
      Object.entries(allocations).forEach(([id, amt]) => {
        if (id !== saleId) s += Number(amt) || 0;
      });
      return s;
    },
    [allocations]
  );

  const toggleInvoice = useCallback(
    (sale: { id: string; outstanding: number }, checked: boolean) => {
      if (checked) {
        setCheckedIds((prev) => new Set(prev).add(sale.id));
        setAllocations((prev) => {
          const other = Object.entries(prev)
            .filter(([id]) => id !== sale.id)
            .reduce((s, [, v]) => s + (Number(v) || 0), 0);
          const room = Math.max(0, cnAvailable - other);
          const alloc = Math.min(sale.outstanding, room);
          return { ...prev, [sale.id]: alloc };
        });
      } else {
        setCheckedIds((prev) => {
          const next = new Set(prev);
          next.delete(sale.id);
          return next;
        });
        setAllocations((prev) => {
          const next = { ...prev };
          delete next[sale.id];
          return next;
        });
      }
    },
    [cnAvailable]
  );

  const setAllocationInput = useCallback(
    (saleId: string, raw: string, saleOutstanding: number) => {
      const parsed = parseFloat(raw.replace(/,/g, ""));
      const num = Number.isFinite(parsed) ? parsed : 0;
      const other = sumAllocationsExcept(saleId);
      const maxForCn = Math.max(0, cnAvailable - other);
      const clamped = Math.max(0, Math.min(num, saleOutstanding, maxForCn));
      setAllocations((prev) => ({ ...prev, [saleId]: Math.round(clamped * 100) / 100 }));
    },
    [cnAvailable, sumAllocationsExcept]
  );

  const ensureCreditNoteIdForReturn = useCallback(async (): Promise<string | null> => {
    if (!currentOrganization?.id) return null;
    return ensureCreditNoteForSaleReturn(supabase, {
      organizationId: currentOrganization.id,
      saleReturnId,
      creditNoteIdHint: creditNoteId,
      customerNameFallback: customerName,
      returnNumberFallback: returnNumber,
      creditAmountFallback: creditAmount,
    });
  }, [creditAmount, creditNoteId, currentOrganization, customerName, returnNumber, saleReturnId]);

  /** Multi-invoice CN apply: one `adjust_invoice_balance` RPC per row (types pending regen). */
  const applyInvoiceAllocationsViaRpc = async (
    maxCredit: number,
    effectiveCreditNoteId: string
  ): Promise<boolean> => {
    const entries = Object.entries(allocations)
      .map(([saleId, amt]) => ({ saleId, amount: Number(amt) || 0 }))
      .filter((e) => e.amount > 0.01 && checkedIds.has(e.saleId))
      .sort((a, b) => a.saleId.localeCompare(b.saleId));

    if (entries.length === 0) {
      toast({ title: "Nothing to apply", description: "Select invoices and enter amounts to allocate.", variant: "destructive" });
      return false;
    }

    const total = entries.reduce((s, e) => s + e.amount, 0);
    if (total > maxCredit + 0.01) {
      toast({ title: "Invalid allocation", description: "Allocated amount exceeds Credit Note value.", variant: "destructive" });
      return false;
    }

    for (const e of entries) {
      const row = unpaidSales.find((s: any) => s.id === e.saleId);
      if (!row || e.amount > row.outstanding + 0.01) {
        toast({ title: "Invalid allocation", description: "An amount exceeds invoice outstanding.", variant: "destructive" });
        return false;
      }
    }

    try {
      const sb = supabase as any;
      let appliedTotal = 0;

      const { data: acctOut } = await supabase
        .from("settings")
        .select("accounting_engine_enabled")
        .eq("organization_id", currentOrganization!.id)
        .maybeSingle();
      const glOn = isAccountingEngineEnabled(acctOut as { accounting_engine_enabled?: boolean } | null);
      const today = format(new Date(), "yyyy-MM-dd");

      const voucherIdFromRpcPayload = (rpcData: unknown): string => {
        if (rpcData == null) return "";
        if (typeof rpcData === "string") return rpcData;
        if (Array.isArray(rpcData) && rpcData.length > 0 && typeof rpcData[0] === "object" && rpcData[0] !== null) {
          const o = rpcData[0] as Record<string, unknown>;
          return String(o.voucher_entry_id ?? o.voucher_id ?? o.id ?? "");
        }
        if (typeof rpcData === "object") {
          const o = rpcData as Record<string, unknown>;
          return String(o.voucher_entry_id ?? o.voucher_id ?? o.id ?? "");
        }
        return "";
      };

      for (const { saleId, amount } of entries) {
        const applyAmt = Number(amount);
        await ensureCreditNoteHeadroom(supabase, {
          organizationId: currentOrganization!.id,
          creditNoteId: effectiveCreditNoteId,
          amountNeeded: applyAmt,
          maxPoolFromReturn: maxCredit,
          saleReturnId,
        });
        const { data: rpcData, error } = await sb.rpc("adjust_invoice_balance", {
          p_organization_id: currentOrganization!.id,
          p_invoice_id: saleId,
          p_adjustment_type: "CREDIT_NOTE",
          p_source_document_id: effectiveCreditNoteId,
          p_amount_applied: applyAmt,
        });

        if (error) throw error;
        appliedTotal += applyAmt || 0;

        // Persist status from compute_sale_settlement (paid + SRA vs net). Safe no-op when
        // already correct; repairs rows if normalize had previously forced "pending".
        try {
          await applyRecomputedSalePaymentState(
            saleId,
            currentOrganization!.id,
            supabase,
          );
        } catch (recomputeErr) {
          console.warn("CN adjust: sale payment recompute failed", saleId, recomputeErr);
        }

        if (glOn) {
          let voucherEntryId = voucherIdFromRpcPayload(rpcData);

          if (!voucherEntryId) {
            const { data: vRows, error: vErr } = await supabase
              .from("voucher_entries")
              .select("id")
              .eq("organization_id", currentOrganization!.id)
              .eq("reference_type", "sale")
              .eq("reference_id", saleId)
              .eq("voucher_type", "receipt")
              .eq("payment_method", "credit_note_adjustment")
              .order("created_at", { ascending: false })
              .limit(1);
            if (vErr) throw vErr;
            voucherEntryId = (vRows?.[0] as { id?: string } | undefined)?.id || "";
          }

          if (!voucherEntryId) {
            // adjust_invoice_balance now writes the voucher inline; absence means RPC failed silently.
            throw new Error("Receipt voucher missing for credit-note adjustment.");
          }

          const saleNumber = (unpaidSales.find((s: any) => s.id === saleId) as any)?.sale_number || saleId;
          const cnApplyDesc = `Credit note ${returnNumber} → ${saleNumber}`;

          await recordCustomerCreditNoteApplicationJournalEntry(
            voucherEntryId,
            currentOrganization!.id,
            applyAmt,
            today,
            cnApplyDesc,
            supabase
          );
        }
      }

      const remainingCredit = Math.max(0, Math.round((maxCredit - appliedTotal) * 100) / 100);
      const nextCreditStatus = remainingCredit <= 0.01 ? "adjusted" : "partially_adjusted";
      const linkedSaleForStatus = entries.length === 1 ? entries[0].saleId : null;

      const { error: returnUpdateError } = await supabase
        .from("sale_returns")
        .update({
          credit_available_balance: remainingCredit,
          credit_status: nextCreditStatus,
          linked_sale_id: linkedSaleForStatus,
        })
        .eq("id", saleReturnId)
        .eq("organization_id", currentOrganization!.id);
      if (returnUpdateError) throw returnUpdateError;

      toast({
        title: "Adjustment applied successfully",
        description: `Applied ₹${appliedTotal.toLocaleString("en-IN")} across ${entries.length} invoice(s).`,
      });

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-unified"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["customer-invoices", customerId] });
      queryClient.invalidateQueries({ queryKey: ["cn-adjust-return-meta", saleReturnId] });
      queryClient.invalidateQueries({ queryKey: ["unpaid-customer-sales", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
      queryClient.invalidateQueries({ queryKey: ["sale-returns-summary"] });
      invalidateCustomerFinancialSnapshot(queryClient, currentOrganization!.id, customerId);
      return true;
    } catch (err: unknown) {
      console.error(err);
      toast({
        title: "Error",
        description: formatCnApplyError(err),
        variant: "destructive",
      });
      return false;
    }
  };

  const handleApply = async () => {
    if (loading) return;

    const liveResolved = await resolveSaleReturnCnAvailable(supabase, {
      organizationId: currentOrganization!.id,
      saleReturnId,
      healCabDrift: true,
    });
    const liveCn = liveResolved.available;

    const { data: currentReturn, error: currentReturnError } = await supabase
      .from("sale_returns")
      .select("credit_status, linked_sale_id")
      .eq("id", saleReturnId)
      .single();

    if (currentReturnError) throw currentReturnError;

    const status = String((currentReturn as any)?.credit_status || "");
    const linkedSaleId = String((currentReturn as any)?.linked_sale_id || "").trim();
    const hasNoCreditLeft = liveCn <= 0.01;
    // Root-cause guard for the CN double-credit: a return that is `adjusted` AND
    // linked to a sale was already consumed at billing via sales.sale_return_adjust
    // (the credit is baked into that invoice's net). Applying / refunding its CN
    // again would hand the customer the same credit twice. Block it regardless of
    // the (possibly un-neutralised) CN header balance.
    const consumedAtBilling = status === "adjusted" && !!linkedSaleId;
    if (consumedAtBilling) {
      toast({
        title: "Already adjusted at billing",
        description:
          "This return was already adjusted against an invoice when it was billed — its credit is included in that invoice's balance and cannot be applied again.",
        variant: "destructive",
      });
      return;
    }
    // Only block truly terminal cases. A partially adjusted return can still be refunded/allocated.
    if (status === "refunded" || (["adjusted", "adjusted_outstanding"].includes(status) && hasNoCreditLeft)) {
      toast({
        title: "Already Adjusted",
        description: "This return cannot be adjusted in this way anymore.",
        variant: "destructive",
      });
      return;
    }

    if (adjustmentType === "invoice") {
      if (overAllocated || totalAllocated <= 0.01) {
        toast({
          title: "Cannot apply",
          description: overAllocated
            ? "Allocated amount exceeds Credit Note value."
            : "Allocate at least one rupee to an invoice.",
          variant: "destructive",
        });
        return;
      }
      if (totalAllocated > liveCn + 0.01) {
        toast({
          title: "Cannot apply",
          description: "Allocated amount exceeds Credit Note value.",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      if (adjustmentType === "invoice") {
        let effectiveCreditNoteId: string;
        try {
          const ensured = await ensureCreditNoteIdForReturn();
          if (!ensured) {
            toast({
              title: "Cannot apply",
              description: "Failed to prepare credit note record for this sale return.",
              variant: "destructive",
            });
            return;
          }
          effectiveCreditNoteId = ensured;
        } catch (ensureErr: any) {
          toast({
            title: "Cannot apply",
            description: ensureErr?.message || "Failed to create missing credit note record.",
            variant: "destructive",
          });
          return;
        }

        const ok = await applyInvoiceAllocationsViaRpc(liveCn, effectiveCreditNoteId);
        if (!ok) return;
      } else if (adjustmentType === "refund") {
        const today = format(new Date(), "yyyy-MM-dd");

        const { data: lastVoucher } = await supabase
          .from("voucher_entries")
          .select("voucher_number")
          .eq("organization_id", currentOrganization?.id)
          .eq("voucher_type", "payment")
          .order("created_at", { ascending: false })
          .limit(1);

        const lastNum = lastVoucher?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
        const newVoucherNumber = `PAY-${String(parseInt(lastNum) + 1).padStart(5, "0")}`;

        const insertData: any = {
          organization_id: currentOrganization?.id,
          voucher_number: newVoucherNumber,
          voucher_type: "payment",
          voucher_date: today,
          reference_type: "customer",
          description: `Refund paid for Sale Return: ${returnNumber}`,
          total_amount: liveCn,
          payment_method: refundMode,
        };
        if (customerId && customerId !== "") {
          insertData.reference_id = customerId;
        }
        const { error: paymentError } = await supabase.from("voucher_entries").insert(insertData);

        if (paymentError) throw paymentError;

        const { error: returnError } = await supabase
          .from("sale_returns")
          .update({
            credit_status: "refunded",
            credit_available_balance: 0,
          })
          .eq("id", saleReturnId);

        if (returnError) throw returnError;

        // Mirror the refund into customer_ledger_entries so the
        // Customer Account Statement report stays in sync.
        if (currentOrganization?.id && customerId) {
          await insertLedgerCredit({
            organizationId: currentOrganization.id,
            customerId,
            voucherType: "PAYMENT",
            voucherNo: newVoucherNumber,
            particulars: `Refund paid for Sale Return ${returnNumber} (${refundMode})`,
            transactionDate: today,
            amount: liveCn,
          });
        }

        toast({
          title: "Success",
          description: `Refund marked as paid. Payment voucher created.`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error adjusting credit note:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to adjust credit note",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const invoiceApplyDisabled =
    loading ||
    returnMetaLoading ||
    cnAvailable <= 0.01 ||
    overAllocated ||
    totalAllocated <= 0.01 ||
    unpaidSales.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Adjust Credit Note</DialogTitle>
          <DialogDescription>
            Return: <strong>{returnNumber}</strong> | Customer:{" "}
            <button
              type="button"
              className="text-primary hover:underline cursor-pointer bg-transparent border-none p-0 font-bold"
              onClick={() => openCustomerAccount(customerId, customerName)}
            >
              {customerName}
            </button>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
          <div className="flex items-center justify-center p-3 bg-muted rounded-lg shrink-0">
            <IndianRupee className="h-5 w-5 mr-1 text-primary" />
            <span className="text-xl font-bold text-primary">
              {returnMetaLoading ? "…" : cnAvailable.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className="text-sm text-muted-foreground ml-2">available to allocate</span>
          </div>

          <RadioGroup
            value={adjustmentType}
            onValueChange={(value) => setAdjustmentType(value as "invoice" | "refund")}
            className="space-y-2 shrink-0"
          >
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="invoice" id="invoice" />
              <Label htmlFor="invoice" className="flex-1 cursor-pointer">
                <div className="font-medium">Adjust Against Invoice(s)</div>
                <div className="text-sm text-muted-foreground">Split credit across one or more unpaid invoices</div>
              </Label>
            </div>
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="refund" id="refund" />
              <Label htmlFor="refund" className="flex-1 cursor-pointer">
                <div className="font-medium">Mark as Refund</div>
                <div className="text-sm text-muted-foreground">Cash/bank refund paid to customer</div>
              </Label>
            </div>
          </RadioGroup>

          {adjustmentType === "invoice" && (
            <div className="space-y-2">
              <Label>Invoices</Label>
              {salesLoading || returnMetaLoading ? (
                <div className="flex items-center justify-center p-6">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : unpaidSales.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 bg-muted rounded-lg">No unpaid invoices for this customer</p>
              ) : (
                <ScrollArea className="h-[min(280px,40vh)] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Invoice</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead className="text-right w-[140px]">Adjust ₹</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unpaidSales.map((sale: any) => {
                        const checked = checkedIds.has(sale.id);
                        const val = allocations[sale.id] ?? 0;
                        return (
                          <TableRow key={sale.id}>
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(c) => toggleInvoice(sale, c === true)}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-sm">{sale.sale_number}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {sale.sale_date ? format(new Date(sale.sale_date), "dd/MM/yyyy") : "—"}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              ₹{sale.outstanding.toLocaleString("en-IN")}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                className="h-8 text-right tabular-nums"
                                disabled={!checked}
                                value={checked ? (Number.isFinite(val) ? val : 0) : ""}
                                placeholder="0"
                                onChange={(e) => setAllocationInput(sale.id, e.target.value, sale.outstanding)}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}

              <div
                className={cn(
                  "sticky bottom-0 z-10 rounded-lg border bg-card p-3 space-y-1 text-sm shadow-sm",
                  overAllocated && "border-destructive"
                )}
              >
                {returnMeta?.cabDrift != null && Math.abs(returnMeta.cabDrift) > 0.01 && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Accounts CN balance was ₹{returnMeta.creditAvailableBalance?.toLocaleString("en-IN")} on the
                    return; live credit note pool is ₹{cnAvailable.toLocaleString("en-IN")} (synced).
                  </p>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total CN available (live)</span>
                  <span className="font-semibold tabular-nums">₹{cnAvailable.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total allocated</span>
                  <span className="font-semibold tabular-nums">₹{totalAllocated.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="font-medium">Remaining CN</span>
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      overAllocated ? "text-destructive" : remainingCn <= 0.01 ? "text-emerald-600" : "text-amber-600"
                    )}
                  >
                    ₹{remainingCn.toLocaleString("en-IN")}
                  </span>
                </div>
                {overAllocated && (
                  <p className="text-destructive text-xs font-medium pt-1">Allocated amount exceeds Credit Note value.</p>
                )}
              </div>
            </div>
          )}

          {adjustmentType === "refund" && (
            <div className="space-y-2 shrink-0">
              <Label>Payment Mode</Label>
              <Select value={refundMode} onValueChange={(value) => setRefundMode(value as "cash" | "bank")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={
              loading ||
              (adjustmentType === "invoice" && invoiceApplyDisabled) ||
              (adjustmentType === "refund" && (returnMetaLoading || cnAvailable <= 0))
            }
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply Adjustment
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
