import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import { Loader2, IndianRupee, CheckCircle2 } from "lucide-react";
import { consumeAdvanceFIFO } from "@/utils/saleSettlement";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { fetchCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import { invalidateMoneyViewsAfterMutation } from "@/utils/moneyViewFreshnessInvalidation";
import {
  fetchSaleReceiptSplitsForInvoices,
  reconcileSaleInvoiceWithSplit,
  type SaleReceiptVoucherSplit,
} from "@/utils/customerBalanceUtils";
import { fetchItemsGrossBySaleId } from "@/utils/fetchItemsGrossBySaleId";
import { fetchCustomerOpeningBalanceRemaining } from "@/utils/customerOpeningBalanceRemaining";
import { isSaleExcludedFromCustomerPaymentPicker } from "@/utils/paymentVoucherFilters";
import { coerceToMap, safeMapGet } from "@/lib/coerceToMap";

/** Same floor as CustomerPaymentTab — invoices with less than ₹1 due are not claimable. */
const MIN_PENDING_RUPEE = 1;
const OPENING_BALANCE_ID = "__opening_balance__";

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
  isOpeningBalance?: boolean;
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
  const processingRef = useRef(false);
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

      // Same outstanding definition as Payments → Collect & Pay (CustomerPaymentTab):
      // active sales, exclude cancelled/hold, then keep rows with reconciled outstanding ≥ ₹1.
      // Do NOT use `.is("is_cancelled", null)` — that drops normal rows where is_cancelled = false.
      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select(
          "id, sale_number, sale_date, net_amount, paid_amount, sale_return_adjust, payment_status, is_cancelled, cash_amount, card_amount, upi_amount, customer_id",
        )
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .is("deleted_at", null)
        .eq("is_cancelled", false)
        .not("payment_status", "in", '("cancelled","hold")')
        .order("sale_date", { ascending: true });
      if (salesError) throw salesError;

      const salesRows = (salesData || []).filter(
        (sale: { payment_status?: string | null; sale_number?: string | null; is_cancelled?: boolean | null }) =>
          !isSaleExcludedFromCustomerPaymentPicker(sale),
      );

      let splitBySale = new Map<string, SaleReceiptVoucherSplit>();
      try {
        splitBySale = coerceToMap<string, SaleReceiptVoucherSplit>(
          await fetchSaleReceiptSplitsForInvoices(
            supabase,
            organizationId,
            salesRows.map((sale: any) => ({
              id: sale.id,
              sale_number: sale.sale_number,
              customer_id: sale.customer_id,
            })),
          ),
        );
      } catch (e) {
        console.error("BulkAdvanceAdjustDialog: invoice receipt splits failed", e);
      }

      let itemsGrossBySale = new Map<string, number>();
      try {
        const needingGross = salesRows
          .filter((s: any) => Number(s.sale_return_adjust || 0) > 0.01)
          .map((s: any) => s.id)
          .filter(Boolean);
        if (needingGross.length > 0) {
          itemsGrossBySale = await fetchItemsGrossBySaleId(supabase, needingGross);
        }
      } catch (e) {
        console.error("BulkAdvanceAdjustDialog: items_gross fetch failed", e);
      }
      for (const sale of salesRows as any[]) {
        const g = itemsGrossBySale.get(sale.id);
        if (g != null) sale.items_gross = g;
      }

      setAdvanceBalance(totalBalance);

      // FIFO: opening balance first (when remaining > 0), then invoices by sale_date ASC.
      let remaining = totalBalance;
      const mapped: OutstandingInvoice[] = [];

      const obRemaining = await fetchCustomerOpeningBalanceRemaining(
        supabase,
        organizationId,
        customerId,
        queryClient,
      );
      if (obRemaining >= MIN_PENDING_RUPEE) {
        const pending = Math.max(0, Math.round(obRemaining));
        const allocate = Math.min(pending, remaining);
        remaining -= allocate;
        mapped.push({
          id: OPENING_BALANCE_ID,
          sale_number: "Opening Balance",
          sale_date: "",
          net_amount: pending,
          paid_amount: 0,
          sale_return_adjust: 0,
          pending,
          allocate,
          isOpeningBalance: true,
        });
      }

      for (const inv of salesRows as any[]) {
        const split = safeMapGet<SaleReceiptVoucherSplit>(splitBySale, inv.id) ?? {
          cash: 0,
          cn: 0,
          adv: 0,
          discount: 0,
        };
        const rec = reconcileSaleInvoiceWithSplit(inv, split);
        if (rec.outstanding < MIN_PENDING_RUPEE) continue;
        const pending = Math.max(0, Math.round(rec.outstanding));
        const allocate = Math.min(pending, remaining);
        remaining -= allocate;
        mapped.push({
          id: inv.id,
          sale_number: inv.sale_number,
          sale_date: inv.sale_date,
          net_amount: Number(inv.net_amount || 0),
          paid_amount: Number(inv.paid_amount || 0),
          sale_return_adjust: Number(inv.sale_return_adjust || 0),
          pending,
          allocate,
        });
      }

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
    if (processingRef.current || isProcessing) return;
    processingRef.current = true;
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
      let appliedTargets = 0;

      for (const inv of invoices) {
        if (inv.allocate <= 0) continue;

        if (inv.isOpeningBalance) {
          await consumeAdvanceFIFO(supabase, {
            customerId,
            organizationId,
            targetOpeningBalance: true,
            requestedAmount: inv.allocate,
            voucherDate: advYmd,
            createdBy: userId ?? null,
          });
          appliedTargets += 1;
          continue;
        }

        await consumeAdvanceFIFO(supabase, {
          customerId,
          organizationId,
          saleId: inv.id,
          requestedAmount: inv.allocate,
          voucherDate: advYmd,
          createdBy: userId ?? null,
        });

        await applyRecomputedSalePaymentState(inv.id, organizationId, supabase);

        const { error: metaErr } = await supabase
          .from("sales")
          .update({
            payment_method: "advance",
            payment_date: advYmd,
          })
          .eq("id", inv.id)
          .eq("organization_id", organizationId);

        if (metaErr) throw metaErr;
        appliedTargets += 1;
      }

      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
      queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
      queryClient.invalidateQueries({ queryKey: ["customer-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["customer-opening-balance-remaining"] });
      invalidateMoneyViewsAfterMutation(queryClient, organizationId, customerId);

      toast.success(
        `₹${totalAllocated.toLocaleString("en-IN")} advance adjusted across ${appliedTargets} target(s)`,
      );
      onOpenChange(false);
      onComplete();
    } catch (err: any) {
      toast.error(err.message || "Failed to adjust advance");
    } finally {
      processingRef.current = false;
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
            Apply advance balance of <strong>{customerName}</strong> to opening balance then outstanding invoices (FIFO)
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
              <p className="text-sm text-muted-foreground text-center py-4">No opening balance or outstanding invoices found for this customer.</p>
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
                          <div
                            className={
                              inv.isOpeningBalance
                                ? "text-xs font-semibold text-amber-700 dark:text-amber-400"
                                : "font-mono text-xs font-semibold"
                            }
                          >
                            {inv.sale_number}
                          </div>
                          {inv.sale_date ? (
                            <div className="text-[11px] text-muted-foreground">
                              {format(new Date(inv.sale_date), "dd/MM/yyyy")}
                            </div>
                          ) : null}
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
