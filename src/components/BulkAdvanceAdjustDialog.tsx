import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerAdvances } from "@/hooks/useCustomerAdvances";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, IndianRupee, CheckCircle2 } from "lucide-react";

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
  const { getAvailableAdvanceBalance, applyAdvance } = useCustomerAdvances(organizationId);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && customerId) {
      loadData();
    }
  }, [open, customerId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch advance booking balance
      const bookingBalance = await getAvailableAdvanceBalance(customerId);
      
      // Also compute credit/overpayment balance from ledger
      let creditBalance = 0;
      try {
        const [
          { data: customerData },
          { data: customerSales },
          { data: customerReturns },
          { data: customerAdjustments },
          { data: customerVouchers },
          { data: refundVouchers },
        ] = await Promise.all([
          supabase.from('customers').select('opening_balance').eq('id', customerId).single(),
          supabase.from('sales').select('id, net_amount, paid_amount, sale_return_adjust, payment_status')
            .eq('organization_id', organizationId).eq('customer_id', customerId)
            .is('deleted_at', null).not('payment_status', 'in', '("cancelled","hold")'),
          supabase.from('sale_returns').select('net_amount')
            .eq('organization_id', organizationId).eq('customer_id', customerId).is('deleted_at', null),
          supabase.from('customer_balance_adjustments').select('outstanding_difference')
            .eq('organization_id', organizationId).eq('customer_id', customerId),
          supabase.from('voucher_entries').select('reference_id, total_amount, reference_type, voucher_type')
            .eq('organization_id', organizationId).eq('voucher_type', 'receipt').is('deleted_at', null),
          supabase.from('voucher_entries').select('reference_id, total_amount')
            .eq('organization_id', organizationId).eq('voucher_type', 'payment')
            .eq('reference_type', 'customer').eq('reference_id', customerId).is('deleted_at', null),
        ]);

        const openingBalance = customerData?.opening_balance || 0;
        const totalSales = (customerSales || []).reduce((s: number, sale: any) => s + (sale.net_amount || 0), 0);
        const saleIds = new Set((customerSales || []).map((s: any) => s.id));
        
        const invoiceVoucherMap = new Map<string, number>();
        let openingBalancePaymentTotal = 0;
        (customerVouchers || []).forEach((v: any) => {
          if (v.reference_id && saleIds.has(v.reference_id)) {
            invoiceVoucherMap.set(v.reference_id, (invoiceVoucherMap.get(v.reference_id) || 0) + (v.total_amount || 0));
          } else if (v.reference_type === 'customer' && v.reference_id === customerId && v.voucher_type === 'receipt') {
            openingBalancePaymentTotal += (v.total_amount || 0);
          }
        });
        
        let totalPaidOnSales = 0;
        (customerSales || []).forEach((sale: any) => {
          const salePaid = sale.paid_amount || 0;
          const srAdj = sale.sale_return_adjust || 0;
          const voucherAmt = invoiceVoucherMap.get(sale.id) || 0;
          totalPaidOnSales += Math.max(salePaid - srAdj, voucherAmt);
        });
        
        const totalPaid = totalPaidOnSales + openingBalancePaymentTotal;
        const adjustmentTotal = (customerAdjustments || []).reduce((s: number, a: any) => s + (a.outstanding_difference || 0), 0);
        const creditNoteTotal = (customerReturns || []).reduce((s: number, r: any) => s + (r.net_amount || 0), 0);
        const refundsPaidTotal = (refundVouchers || []).reduce((s: number, v: any) => s + (v.total_amount || 0), 0);
        
        const balance = Math.round(openingBalance + totalSales - totalPaid + adjustmentTotal - creditNoteTotal + refundsPaidTotal);
        
        if (balance < 0) {
          creditBalance = Math.max(0, Math.abs(balance) - bookingBalance);
        }
      } catch (err) {
        console.error("Failed to compute credit balance:", err);
      }
      
      const totalBalance = bookingBalance + creditBalance;

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
      // Update each invoice
      for (const inv of invoices) {
        if (inv.allocate <= 0) continue;

        const newPaid = Math.round((inv.paid_amount + inv.allocate) * 100) / 100;
        const totalSettled = newPaid + inv.sale_return_adjust;
        const newStatus = totalSettled >= inv.net_amount - 1 ? "completed" : totalSettled > 0 ? "partial" : "pending";

        const { error: updateErr } = await supabase
          .from("sales")
          .update({
            paid_amount: newPaid,
            payment_status: newStatus,
            payment_method: "advance",
            payment_date: format(new Date(), "yyyy-MM-dd"),
          })
          .eq("id", inv.id);

        if (updateErr) throw updateErr;

        // Create voucher entry
        const { data: voucherNum, error: vNumErr } = await supabase.rpc("generate_voucher_number", {
          p_type: "receipt",
          p_date: format(new Date(), "yyyy-MM-dd"),
        });
        if (vNumErr) throw vNumErr;

        const { error: vErr } = await supabase.from("voucher_entries").insert({
          organization_id: organizationId,
          voucher_number: voucherNum,
          voucher_type: "receipt",
          voucher_date: format(new Date(), "yyyy-MM-dd"),
          reference_type: "customer",
          reference_id: inv.id,
          total_amount: inv.allocate,
          description: `Adjusted from advance balance for invoice ${inv.sale_number}`,
          created_by: userId,
        });
        if (vErr) throw vErr;
      }

      // Apply advance deduction (FIFO) - only for booking-based advances
      const bookingBalance = await getAvailableAdvanceBalance(customerId);
      const bookingDeduction = Math.min(totalAllocated, bookingBalance);
      if (bookingDeduction > 0) {
        await applyAdvance.mutateAsync({
          customerId,
          amountToApply: bookingDeduction,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });

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
