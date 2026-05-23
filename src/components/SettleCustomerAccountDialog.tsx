import { useEffect, useMemo, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  consumeAdvanceFIFO,
  createReceiptVoucher,
  derivePaidAndStatus,
  getAvailableCN,
  preSaveInvariants,
  type AvailableCNReturn,
} from "@/utils/saleSettlement";
import { ensureCreditNoteForSaleReturn } from "@/utils/ensureCreditNoteForSaleReturn";

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

  useEffect(() => {
    if (open && pendingInvoices?.length) {
      setSelectedInvoices(new Set(pendingInvoices.map((i) => i.id)));
    }
  }, [open, pendingInvoices]);

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

  const { data: trueOutstanding } = useQuery({
    queryKey: ["settle-outstanding", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_customer_true_outstanding", {
        p_customer_id: customerId,
        p_organization_id: organizationId,
      });
      if (error) throw error;
      return Number(data || 0);
    },
    enabled: !!customerId && open && !!organizationId,
    staleTime: 5000,
  });

  const selectedTotal = useMemo(() => {
    return (pendingInvoices || [])
      .filter((inv) => selectedInvoices.has(inv.id))
      .reduce((sum, inv) => sum + inv.outstanding, 0);
  }, [pendingInvoices, selectedInvoices]);

  const availableAdvance = advanceData?.total || 0;
  const availableCN = cnData?.total || 0;
  const discountToApply = Math.max(0, parseFloat(discountAmount) || 0);

  const advanceToApply = Math.min(availableAdvance, selectedTotal);
  const cnToApply = Math.min(availableCN, Math.max(0, selectedTotal - advanceToApply));
  const cashNeeded = Math.max(0, selectedTotal - advanceToApply - cnToApply - discountToApply);

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
    if (!pendingInvoices?.length) return;
    if (selectedInvoices.size === pendingInvoices.length) {
      setSelectedInvoices(new Set());
    } else {
      setSelectedInvoices(new Set(pendingInvoices.map((i) => i.id)));
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

  const applyCnFifo = async (
    inv: PendingInvoice,
    amount: number,
    cnPool: AvailableCNReturn[],
    voucherDate: string,
    userId: string | undefined
  ): Promise<number> => {
    let remaining = amount;
    let applied = 0;
    const sb = supabase as any;

    for (const sr of cnPool) {
      if (remaining <= 0.01) break;
      const avail = sr.available;
      if (avail <= 0.01) continue;

      const useFromSR = Math.min(avail, remaining);
      const creditNoteId = await ensureCreditNoteForSaleReturn(supabase, {
        organizationId,
        saleReturnId: sr.id,
        creditNoteIdHint: null,
        customerNameFallback: customerName,
        returnNumberFallback: sr.return_number || undefined,
        creditAmountFallback: sr.net_amount,
      });
      if (!creditNoteId) continue;

      const { error: rpcErr } = await sb.rpc("adjust_invoice_balance", {
        p_organization_id: organizationId,
        p_invoice_id: inv.id,
        p_adjustment_type: "CREDIT_NOTE",
        p_source_document_id: creditNoteId,
        p_amount_applied: useFromSR,
      });
      if (rpcErr) throw rpcErr;

      await createReceiptVoucher(supabase, {
        organizationId,
        referenceId: inv.id,
        amount: useFromSR,
        paymentMethod: "credit_note_adjustment",
        description: `Credit note ${sr.return_number || "SR"} adjusted against ${inv.sale_number}`,
        voucherDate,
        createdBy: userId ?? null,
      });

      const { data: cnRow } = await supabase
        .from("credit_notes")
        .select("credit_amount, used_amount")
        .eq("id", creditNoteId)
        .maybeSingle();
      const cnRemaining = Math.max(
        0,
        Number(cnRow?.credit_amount || 0) - Number(cnRow?.used_amount || 0)
      );
      await supabase
        .from("sale_returns")
        .update({
          credit_available_balance: cnRemaining,
          credit_status: cnRemaining <= 0.01 ? "adjusted" : "partially_adjusted",
          linked_sale_id: inv.id,
        })
        .eq("id", sr.id);

      sr.available = cnRemaining;
      remaining -= useFromSR;
      applied += useFromSR;
    }

    return applied;
  };

  const handleSettle = async () => {
    if (!customerId || selectedTotal <= 0 || isProcessing || selectedInvoices.size === 0) return;

    const cashEntered = parseFloat(cashAmount) || 0;
    const totalApplied =
      advanceToApply + cnToApply + discountToApply + cashEntered;
    if (totalApplied < selectedTotal - 1) {
      toast({
        title: "Insufficient settlement",
        description: `Total applied (₹${Math.round(totalApplied).toLocaleString("en-IN")}) is less than selected due (₹${Math.round(selectedTotal).toLocaleString("en-IN")}).`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const voucherDate = format(new Date(), "yyyy-MM-dd");

      const invoicesToSettle = (pendingInvoices || [])
        .filter((inv) => selectedInvoices.has(inv.id))
        .sort((a, b) => new Date(a.sale_date).getTime() - new Date(b.sale_date).getTime());

      let advanceRemaining = advanceToApply;
      let cnRemaining = cnToApply;
      let cashRemaining = cashEntered;
      let discountRemaining = discountToApply;

      const cnPool = sortedCnReturns.map((r) => ({ ...r, available: r.available }));

      for (const inv of invoicesToSettle) {
        const due = inv.outstanding;
        let runningPaid = inv.paid_amount || 0;
        let runningDiscount = 0;

        if (advanceRemaining > 0.01) {
          const advForThis = Math.min(advanceRemaining, due);
          if (advForThis > 0.01) {
            const { consumed } = await consumeAdvanceFIFO(supabase, {
              customerId,
              organizationId,
              saleId: inv.id,
              requestedAmount: advForThis,
              voucherDate,
              createdBy: user?.id ?? null,
            });
            advanceRemaining -= consumed;
            runningPaid += consumed;
          }
        }

        let saleReturnAdjust = inv.sale_return_adjust || 0;
        if (cnRemaining > 0.01) {
          const stillDue = Math.max(
            0,
            (inv.net_amount || 0) - runningPaid - saleReturnAdjust
          );
          const cnForThis = Math.min(cnRemaining, stillDue);
          if (cnForThis > 0.01) {
            const consumed = await applyCnFifo(inv, cnForThis, cnPool, voucherDate, user?.id);
            cnRemaining -= consumed;
            const { data: fresh } = await supabase
              .from("sales")
              .select("sale_return_adjust")
              .eq("id", inv.id)
              .maybeSingle();
            saleReturnAdjust = Number(fresh?.sale_return_adjust || saleReturnAdjust);
          }
        }

        const settledSoFar =
          runningPaid + saleReturnAdjust + runningDiscount;
        const stillOwed = Math.max(0, (inv.net_amount || 0) - settledSoFar);

        if ((cashRemaining > 0.01 || discountRemaining > 0.01) && stillOwed > 0.01) {
          const cashForThis = Math.min(cashRemaining, stillOwed);
          const discForThis = Math.min(
            discountRemaining,
            Math.max(0, stillOwed - cashForThis)
          );

          if (cashForThis > 0.01 || discForThis > 0.01) {
            await createReceiptVoucher(supabase, {
              organizationId,
              referenceId: inv.id,
              amount: cashForThis,
              discountAmount: discForThis > 0.01 ? discForThis : undefined,
              discountReason: discForThis > 0.01 ? discountReason || undefined : undefined,
              paymentMethod: paymentMode,
              description: narration.trim() || `Payment for ${inv.sale_number}`,
              voucherDate,
              createdBy: user?.id ?? null,
            });
            cashRemaining -= cashForThis;
            discountRemaining -= discForThis;
            runningPaid += cashForThis;
            runningDiscount += discForThis;
          }
        }

        preSaveInvariants({
          netAmount: inv.net_amount,
          items: [{ id: inv.id }],
          customerId,
          paymentMethod: inv.payment_method,
          saleReturnAdjust,
          paidAmount: runningPaid,
        });

        const { paidAmount, paymentStatus } = derivePaidAndStatus({
          netAmount: inv.net_amount,
          saleReturnAdjust,
          cashReceived: runningPaid,
          advanceApplied: 0,
          cnApplied: 0,
          discountGiven: runningDiscount,
          paymentMethod: inv.payment_method,
        });

        await supabase
          .from("sales")
          .update({
            paid_amount: paidAmount,
            payment_status: paymentStatus,
            payment_date: voucherDate,
          })
          .eq("id", inv.id)
          .eq("organization_id", organizationId);
      }

      const summary = `₹${Math.round(selectedTotal).toLocaleString("en-IN")} settled across ${selectedInvoices.size} invoice(s)`;
      setSettledSummary(summary);
      setSettled(true);
      toast({ title: "Settlement recorded", description: summary });

      queryClient.invalidateQueries({ queryKey: ["sales-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advance-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
      queryClient.invalidateQueries({ queryKey: ["settle-"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
      queryClient.invalidateQueries({ queryKey: ["sale-returns"] });

      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Settlement error:", err);
      toast({ title: "Settlement failed", description: message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const previewRows = useMemo(() => {
    return (pendingInvoices || [])
      .filter((inv) => selectedInvoices.has(inv.id))
      .map((inv) => {
        const advShare = Math.min(inv.outstanding, advanceToApply * (inv.outstanding / selectedTotal || 0));
        const afterAdv = Math.max(0, inv.outstanding - advShare);
        const cnShare = Math.min(afterAdv, cnToApply * (inv.outstanding / selectedTotal || 0));
        const afterCn = Math.max(0, afterAdv - cnShare);
        const discShare = Math.min(afterCn, discountToApply * (inv.outstanding / selectedTotal || 0));
        const newBal = Math.max(0, afterCn - discShare - Math.min(afterCn - discShare, cashNeeded * (inv.outstanding / selectedTotal || 0)));
        return { inv, newBal };
      });
  }, [pendingInvoices, selectedInvoices, selectedTotal, advanceToApply, cnToApply, discountToApply, cashNeeded]);

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
            Apply advance, credit notes, and cash to multiple invoices in one step.
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
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-semibold">Pending invoices</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleSelectAll}>
                      {pendingInvoices?.length && selectedInvoices.size === pendingInvoices.length
                        ? "Deselect all"
                        : "Select all"}
                    </Button>
                  </div>
                  {invoicesLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  ) : !pendingInvoices?.length ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No pending invoices.</p>
                  ) : (
                    <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                      {pendingInvoices.map((inv) => (
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
                    {previewRows.map(({ inv, newBal }) => (
                      <div key={inv.id} className="flex justify-between gap-2">
                        <span className="font-medium">{inv.sale_number}</span>
                        <span>
                          {fmt(inv.outstanding)} →{" "}
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
