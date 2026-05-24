import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, IndianRupee, CheckCircle2 } from "lucide-react";
import { consumeAdvanceFIFO, derivePaidAndStatus, warnSettlementPathMismatch } from "@/utils/saleSettlement";
import { fetchCustomerFinancialSnapshot, invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";

interface BulkAdvanceAdjustDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
  customerName: string;
  organizationId: string;
  userId?: string;
  onComplete: () => void;
}

interface OutstandingInvoice {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number;
  paid_amount: number;
  sale_return_adjust: number;
  pending: number;
  allocate: number;
}

export function BulkAdvanceAdjustDialog({
  open,
  onOpenChange,
  customerId,
  customerName,
  organizationId,
  userId,
  onComplete,
}: BulkAdvanceAdjustDialogProps) {
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([]);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && customerId) {
      loadData();
    }
  }, [open, customerId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Only true unused advance bookings (customer_advances.amount - used_amount) are spendable.
      // Customer overpayments / refund liabilities must be returned via Refund or converted to a
      // new Advance booking — they cannot be re-spent here as advance.
      const snap = await fetchCustomerFinancialSnapshot(supabase, organizationId, customerId);
      const totalBalance = snap.advanceAvailable;

      // Fetch pending invoices
      const { data: pendingInvoices } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount, paid_amount, sale_return_adjust")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .eq("sale_type", "invoice")
        .is("deleted_at", null)
        .is("is_cancelled", null)
        .in("payment_status", ["pending", "partial"])
        .order("sale_date", { ascending: true });

      setAdvanceBalance(totalBalance);

      let remaining = totalBalance;
      const mapped: OutstandingInvoice[] = (pendingInvoices || []).map((inv: any) => {
        const pending = Math.max(0, Math.round(inv.net_amount - (inv.paid_amount || 0) - (inv.sale_return_adjust || 0)));
        const allocate = Math.min(pending, remaining);
        remaining -= allocate;
        return { ...inv, pending, allocate, paid_amount: inv.paid_amount || 0, sale_return_adjust: inv.sale_return_adjust || 0 };
      });

      setInvoices(mapped);
    } catch (err) {
      console.error("Failed to load bulk advance data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalAllocated = invoices.reduce((s, i) => s + i.allocate, 0);

  const handleConfirm = async () => {
    if (totalAllocated <= 0) return;
    setIsProcessing(true);

    try {
      // Hard guard: re-verify available advance balance from customer_advances at write time.
      const liveSnap = await fetchCustomerFinancialSnapshot(supabase, organizationId, customerId);
      const liveAdvanceBalance = liveSnap.advanceAvailable;
      if (totalAllocated > liveAdvanceBalance + 0.01) {
        toast.error(
          `Insufficient advance balance. Customer has only ₹${liveAdvanceBalance.toLocaleString("en-IN")} unused advance.`,
        );
        return;
      }

      const advYmd = format(new Date(), "yyyy-MM-dd");

      for (const inv of invoices) {
        if (inv.allocate <= 0) continue;

        const prevPaid = inv.paid_amount;
        const newPaid = Math.round((prevPaid + inv.allocate) * 100) / 100;
        const legacyStatus =
          newPaid + inv.sale_return_adjust >= inv.net_amount - 1
            ? "completed"
            : newPaid > 0
              ? "partial"
              : "pending";
        const { paymentStatus: newStatus } = derivePaidAndStatus({
          netAmount: inv.net_amount,
          saleReturnAdjust: inv.sale_return_adjust,
          cashReceived: prevPaid,
          advanceApplied: inv.allocate,
          cnApplied: 0,
          discountGiven: 0,
          paymentMethod: "advance",
        });
        warnSettlementPathMismatch("BulkAdvanceAdjustDialog", legacyStatus, newStatus);

        await consumeAdvanceFIFO(supabase, {
          customerId,
          organizationId,
          saleId: inv.id,
          requestedAmount: inv.allocate,
          voucherDate: advYmd,
          createdBy: userId ?? null,
        });

        const { error: updateErr } = await supabase
          .from("sales")
          .update({
            paid_amount: newPaid,
            payment_status: newStatus,
            payment_method: "advance",
            payment_date: advYmd,
          })
          .eq("id", inv.id);

        if (updateErr) throw updateErr;
      }

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      invalidateCustomerFinancialSnapshot(queryClient, organizationId, customerId);

      toast.success(`₹${totalAllocated.toLocaleString("en-IN")} advance adjusted across ${invoices.filter((i) => i.allocate > 0).length} invoice(s)`);
      onOpenChange(false);
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust advance");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IndianRupee className="h-5 w-5 text-primary" />
            Bulk Adjust Advance
          </DialogTitle>
          <DialogDescription>
            Apply advance balance of <strong>{customerName}</strong> to outstanding invoices (FIFO)
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <span className="text-sm font-medium">Available Advance</span>
              <span className="text-lg font-bold text-primary">₹{advanceBalance.toLocaleString("en-IN")}</span>
            </div>

            {invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No outstanding invoices found for this customer.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-xs text-muted-foreground">
                      <th className="text-left px-3 py-2">Invoice</th>
                      <th className="text-right px-3 py-2">Pending</th>
                      <th className="text-right px-3 py-2">Allocate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs font-semibold">{inv.sale_number}</div>
                          <div className="text-[11px] text-muted-foreground">{format(new Date(inv.sale_date), "dd/MM/yyyy")}</div>
                        </td>
                        <td className="text-right px-3 py-2 text-amber-600 font-medium">₹{inv.pending.toLocaleString("en-IN")}</td>
                        <td className="text-right px-3 py-2">
                          {inv.allocate > 0 ? (
                            <Badge variant="default" className="bg-emerald-500 text-white">
                              ₹{inv.allocate.toLocaleString("en-IN")}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalAllocated > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <span className="text-sm font-medium text-emerald-800">Total to Adjust</span>
                <span className="text-lg font-bold text-emerald-700">₹{totalAllocated.toLocaleString("en-IN")}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={isProcessing || totalAllocated <= 0}>
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Adjustment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
