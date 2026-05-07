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
import { CustomerHistoryDialog } from "@/components/CustomerHistoryDialog";
import {
  deleteJournalEntryByReference,
  recordCustomerCreditNoteApplicationJournalEntry,
} from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { cn } from "@/lib/utils";

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
  const [adjustmentType, setAdjustmentType] = useState<"invoice" | "refund" | "outstanding">("invoice");
  const [refundMode, setRefundMode] = useState<"cash" | "bank">("cash");
  const [loading, setLoading] = useState(false);
  const [showCustomerHistory, setShowCustomerHistory] = useState(false);
  /** Rupee amount allocated per sale id */
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  const { data: returnMeta, isLoading: returnMetaLoading } = useQuery({
    queryKey: ["cn-adjust-return-meta", saleReturnId, currentOrganization?.id, open],
    queryFn: async () => {
      if (!saleReturnId || !currentOrganization?.id || !open) return null;
      const { data, error } = await supabase
        .from("sale_returns")
        .select("net_amount, credit_available_balance, credit_status")
        .eq("id", saleReturnId)
        .eq("organization_id", currentOrganization.id)
        .single();
      if (error) throw error;
      return data as {
        net_amount: number;
        credit_available_balance: number | null;
        credit_status: string | null;
      };
    },
    enabled: open && !!saleReturnId && !!currentOrganization?.id,
    staleTime: 0,
  });

  const cnAvailable = useMemo(() => {
    if (returnMeta?.credit_available_balance != null && !Number.isNaN(Number(returnMeta.credit_available_balance))) {
      return Math.max(0, Math.round(Number(returnMeta.credit_available_balance)));
    }
    const net = Number(returnMeta?.net_amount ?? creditAmount ?? 0);
    return Math.max(0, Math.round(net));
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
    const existingFromProps = String(creditNoteId || "").trim();

    if (existingFromProps) {
      const { data: existingCn, error: existingCnError } = await supabase
        .from("credit_notes")
        .select("id")
        .eq("id", existingFromProps)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingCnError) throw existingCnError;
      if (existingCn?.id) return existingCn.id;
    }

    const { data: sr, error: srError } = await supabase
      .from("sale_returns")
      .select("id, organization_id, customer_id, customer_name, return_number, return_date, net_amount, linked_sale_id, credit_note_id")
      .eq("id", saleReturnId)
      .eq("organization_id", currentOrganization!.id)
      .single();
    if (srError) throw srError;

    const srLinkedCreditNoteId = String((sr as any)?.credit_note_id || "").trim();
    if (srLinkedCreditNoteId) {
      const { data: linkedCn, error: linkedCnError } = await supabase
        .from("credit_notes")
        .select("id")
        .eq("id", srLinkedCreditNoteId)
        .eq("organization_id", currentOrganization!.id)
        .is("deleted_at", null)
        .maybeSingle();
      if (linkedCnError) throw linkedCnError;
      if (linkedCn?.id) return linkedCn.id;
    }

    const { data: creditNoteNumber, error: numberError } = await supabase.rpc(
      "generate_credit_note_number",
      { p_organization_id: currentOrganization!.id }
    );
    if (numberError) throw numberError;

    const { data: newCN, error: createError } = await supabase
      .from("credit_notes")
      .insert({
        organization_id: currentOrganization!.id,
        credit_note_number: creditNoteNumber,
        sale_id: (sr as any)?.linked_sale_id || null,
        customer_id: (sr as any)?.customer_id || null,
        customer_name: (sr as any)?.customer_name || customerName || "Walk-in Customer",
        credit_amount: Math.max(
          0,
          Number((sr as any)?.net_amount ?? creditAmount ?? 0)
        ),
        used_amount: 0,
        status: "active",
        issue_date: (sr as any)?.return_date || format(new Date(), "yyyy-MM-dd"),
        notes: `Credit note from sale return ${(sr as any)?.return_number || returnNumber || saleReturnId}`,
      } as any)
      .select("id")
      .single();
    if (createError) throw createError;

    const createdId = (newCN as any)?.id;
    if (!createdId) return null;

    const { error: linkError } = await supabase
      .from("sale_returns")
      .update({ credit_note_id: createdId })
      .eq("id", saleReturnId)
      .eq("organization_id", currentOrganization!.id);
    if (linkError) throw linkError;

    return createdId;
  }, [
    creditAmount,
    creditNoteId,
    currentOrganization,
    customerName,
    returnNumber,
    saleReturnId,
  ]);

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
        const { data: rpcData, error } = await sb.rpc("adjust_invoice_balance", {
          p_organization_id: currentOrganization!.id,
          p_invoice_id: saleId,
          p_adjustment_type: "CREDIT_NOTE",
          p_source_document_id: effectiveCreditNoteId,
          p_amount_applied: applyAmt,
        });

        if (error) throw error;
        appliedTotal += applyAmt || 0;

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
            throw new Error(
              "Accounting is enabled but no receipt voucher was found for this allocation, so the journal entry was not posted."
            );
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
      queryClient.invalidateQueries({ queryKey: ["cn-adjust-return-meta", saleReturnId] });
      queryClient.invalidateQueries({ queryKey: ["unpaid-customer-sales", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
      queryClient.invalidateQueries({ queryKey: ["sale-returns-summary"] });
      return true;
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Error",
        description: err?.message || "Failed to apply credit note to invoices",
        variant: "destructive",
      });
      return false;
    }
  };

  const handleApply = async () => {
    if (loading) return;

    const { data: currentReturn, error: currentReturnError } = await supabase
      .from("sale_returns")
      .select("credit_status, net_amount, credit_available_balance")
      .eq("id", saleReturnId)
      .single();

    if (currentReturnError) throw currentReturnError;

    const liveCn =
      (currentReturn as any)?.credit_available_balance != null &&
      !Number.isNaN(Number((currentReturn as any).credit_available_balance))
        ? Math.max(0, Number((currentReturn as any).credit_available_balance))
        : Math.max(0, Number((currentReturn as any)?.net_amount ?? creditAmount));

    const status = String((currentReturn as any)?.credit_status || "");
    const hasNoCreditLeft = liveCn <= 0.01;
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

        toast({
          title: "Success",
          description: `Refund marked as paid. Payment voucher created.`,
        });
      } else if (adjustmentType === "outstanding") {
        const prevReturnCreditStatus = String((currentReturn as any)?.credit_status || "pending");
        const { error: returnError } = await supabase
          .from("sale_returns")
          .update({
            credit_status: "adjusted_outstanding",
          })
          .eq("id", saleReturnId);

        if (returnError) throw returnError;

        const { data: srRow } = await supabase
          .from("sale_returns")
          .select("linked_sale_id")
          .eq("id", saleReturnId)
          .single();
        const linkedSaleId = (srRow as any)?.linked_sale_id || null;

        if (linkedSaleId && liveCn > 0) {
          const { data: linkedSale } = await supabase
            .from("sales")
            .select("paid_amount, net_amount, sale_return_adjust, payment_status")
            .eq("id", linkedSaleId)
            .single();

          if (linkedSale) {
            const net = Number(linkedSale.net_amount || 0);
            const snapPaid = Number(linkedSale.paid_amount || 0);
            const snapSr = Number((linkedSale as any).sale_return_adjust || 0);
            const snapStatus = String(linkedSale.payment_status || "pending");
            const capRemaining = Math.max(0, net - snapSr - snapPaid);
            const adjustAmount = Math.min(liveCn, capRemaining);
            const newSr = snapSr + adjustAmount;
            const outstandingAfter = Math.max(0, net - newSr - snapPaid);
            const newStatus =
              outstandingAfter <= 0.01
                ? "completed"
                : snapPaid > 0.01 || newSr > 0.01
                  ? "partial"
                  : "pending";

            if (adjustAmount > 0.01) {
              await supabase
                .from("sales")
                .update({
                  payment_status: newStatus,
                  sale_return_adjust: newSr,
                })
                .eq("id", linkedSaleId);

              const today = format(new Date(), "yyyy-MM-dd");
              const { data: lastRcp } = await supabase
                .from("voucher_entries")
                .select("voucher_number")
                .eq("organization_id", currentOrganization?.id)
                .eq("voucher_type", "receipt")
                .order("created_at", { ascending: false })
                .limit(1);
              const lastNum2 = lastRcp?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
              const newVoucherNumber = `RCP-${String(parseInt(lastNum2) + 1).padStart(5, "0")}`;
              const cnApplyDesc = `Credit note adjusted against invoice (Return ${returnNumber})`;

              const { data: outVoucherRow, error: outVoucherErr } = await supabase
                .from("voucher_entries")
                .insert({
                  organization_id: currentOrganization?.id,
                  voucher_number: newVoucherNumber,
                  voucher_type: "receipt",
                  voucher_date: today,
                  reference_type: "sale",
                  reference_id: linkedSaleId,
                  total_amount: adjustAmount,
                  payment_method: "credit_note_adjustment",
                  description: cnApplyDesc,
                })
                .select("id")
                .single();
              if (outVoucherErr) throw outVoucherErr;
              const outVoucherId = outVoucherRow?.id as string | undefined;

              const { data: acctOut2 } = await supabase
                .from("settings")
                .select("accounting_engine_enabled")
                .eq("organization_id", currentOrganization?.id)
                .maybeSingle();
              if (
                outVoucherId &&
                isAccountingEngineEnabled(acctOut2 as { accounting_engine_enabled?: boolean } | null)
              ) {
                try {
                  await recordCustomerCreditNoteApplicationJournalEntry(
                    outVoucherId,
                    currentOrganization!.id,
                    adjustAmount,
                    today,
                    cnApplyDesc,
                    supabase
                  );
                } catch (glErr) {
                  await deleteJournalEntryByReference(
                    currentOrganization!.id,
                    "CustomerCreditNoteApplication",
                    outVoucherId,
                    supabase
                  );
                  await supabase.from("voucher_entries").delete().eq("id", outVoucherId);
                  await supabase
                    .from("sales")
                    .update({
                      payment_status: snapStatus as "pending" | "partial" | "completed",
                      sale_return_adjust: snapSr,
                    })
                    .eq("id", linkedSaleId);
                  await supabase
                    .from("sale_returns")
                    .update({ credit_status: prevReturnCreditStatus })
                    .eq("id", saleReturnId);
                  throw glErr;
                }
              }
            }
          }
        }

        if (creditNoteId && creditNoteId !== "") {
          const { error: voucherError } = await supabase
            .from("voucher_entries")
            .update({
              description: `Credit Note adjusted to Outstanding Balance: ${returnNumber}`,
            })
            .eq("id", creditNoteId);

          if (voucherError) throw voucherError;
        }

        toast({
          title: "Success",
          description: `Credit note adjusted to customer outstanding balance. ₹${liveCn.toFixed(2)} deducted.`,
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
              onClick={() => setShowCustomerHistory(true)}
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
            onValueChange={(value) => setAdjustmentType(value as "invoice" | "refund" | "outstanding")}
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
            <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="outstanding" id="outstanding" />
              <Label htmlFor="outstanding" className="flex-1 cursor-pointer">
                <div className="font-medium">Adjust in Outstanding Balance</div>
                <div className="text-sm text-muted-foreground">Reduce customer balance (linked invoice flow)</div>
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total CN available</span>
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

        {customerId && (
          <CustomerHistoryDialog
            open={showCustomerHistory}
            onOpenChange={setShowCustomerHistory}
            customerId={customerId}
            customerName={customerName}
            organizationId={currentOrganization?.id || ""}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
