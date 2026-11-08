import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { LoadingButton } from "@/components/ui/loading-button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { createReceiptVoucher } from "@/utils/saleSettlement";
import { deleteLedgerEntries } from "@/lib/customerLedger";
import { billOutstanding, planReceiptSpread } from "@/utils/receiptSpreadPlan";
import {
  deleteJournalEntryByReference,
  isAccountingEngineOnForOrg,
  repostJournalForRestoredVoucher,
} from "@/utils/accounting/journalService";

interface ReassignPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any; // voucher_entries row
  customerId: string;
  customerName: string;
  organizationId: string;
}

export function ReassignPaymentDialog({
  open,
  onOpenChange,
  payment,
  customerId,
  customerName,
  organizationId,
}: ReassignPaymentDialogProps) {
  const queryClient = useQueryClient();
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [spreadMode, setSpreadMode] = useState(false);
  const paymentAmount = Number(payment?.total_amount) || 0;
  const paymentDiscount = Number(payment?.discount_amount) || 0;

  // Fetch pending/partial invoices for this customer
  const { data: pendingInvoices, isLoading } = useQuery({
    queryKey: ["reassign-pending-invoices", customerId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_number, sale_date, net_amount, paid_amount, payment_status")
        .eq("customer_id", customerId)
        .eq("organization_id", organizationId)
        .in("payment_status", ["pending", "partial"])
        .is("deleted_at", null)
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!customerId,
  });

  const reassignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInvoiceId || !payment) throw new Error("Select an invoice");

      // Get invoice details
      const { data: invoice, error: invErr } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, paid_amount")
        .eq("id", selectedInvoiceId)
        .single();
      if (invErr || !invoice) throw new Error("Invoice not found");

      const currentPaid = invoice.paid_amount || 0;
      const outstanding = invoice.net_amount - currentPaid;

      if (outstanding <= 0) throw new Error("Invoice is already fully paid");

      // If payment exceeds outstanding, warn
      if (paymentAmount > outstanding) {
        throw new Error(`Payment ₹${paymentAmount} exceeds invoice outstanding ₹${Math.round(outstanding)}. Please split the payment first.`);
      }

      // Re-point the receipt first; the voucher is what supports the invoice's paid amount.
      // Writing paid_amount before this left the invoice marked paid with no receipt behind it
      // whenever the voucher update failed.
      const { error: voucherErr } = await supabase
        .from("voucher_entries")
        .update({
          reference_type: "sale",
          reference_id: selectedInvoiceId,
          description: `Payment for ${invoice.sale_number} (reassigned from Opening Balance)`,
        })
        .eq("id", payment.id);
      if (voucherErr) throw voucherErr;

      // paid_amount / status derived from the receipts (DB compute_sale_settlement).
      await applyRecomputedSalePaymentState(selectedInvoiceId, organizationId);

      return { invoiceNumber: invoice.sale_number };
    },
    onSuccess: (data) => {
      toast.success(`Payment reassigned to invoice ${data.invoiceNumber}`);
      invalidateAfterLink();
      onOpenChange(false);
      setSelectedInvoiceId(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function invalidateAfterLink() {
    queryClient.invalidateQueries({ queryKey: ["voucher-entries"] });
    queryClient.invalidateQueries({ queryKey: ["sales"] });
    queryClient.invalidateQueries({ queryKey: ["customer-invoices"] });
    queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
    queryClient.invalidateQueries({ queryKey: ["customers-with-balance"] });
    queryClient.invalidateQueries({ queryKey: ["reassign-pending-invoices"] });
    invalidateCustomerFinancialSnapshot(queryClient, organizationId, customerId);
  }

  const spreadPlan = planReceiptSpread(paymentAmount, pendingInvoices || []);

  /**
   * Split one receipt over several open bills, oldest first. The receipt keeps its own row
   * (first bill, or the leftover when the bills cannot take it all); the other parts become
   * RCP/…-2, -3 … with the same date and mode, like a multi-bill receipt from Customer Payment.
   */
  const spreadMutation = useMutation({
    mutationFn: async () => {
      if (!payment?.id) throw new Error("Payment not found");
      if (paymentDiscount > 0) {
        throw new Error("This receipt has a discount. Link it to one bill instead.");
      }
      const plan = planReceiptSpread(paymentAmount, pendingInvoices || []);
      if (!plan.parts.length) throw new Error("No pending invoices to spread this payment over");

      const keepOnCustomer = plan.leftover >= 0.01;
      const originalPart = keepOnCustomer ? null : plan.parts[0];
      const newParts = keepOnCustomer ? plan.parts : plan.parts.slice(1);
      const baseNumber = String(payment.voucher_number || "");
      const baseDesc = String(payment.description || "").trim();
      const fromText = `from ${baseNumber}${baseDesc ? `: ${baseDesc}` : ""}`;
      const voucherDate = String(payment.voucher_date || "").slice(0, 10) || undefined;

      const created: Array<{ id: string; voucher_number: string }> = [];
      try {
        for (let i = 0; i < newParts.length; i++) {
          const part = newParts[i];
          const suffix = keepOnCustomer ? i + 1 : i + 2;
          const v = await createReceiptVoucher(supabase, {
            organizationId,
            referenceId: part.saleId,
            referenceType: "sale",
            voucherNumber: `${baseNumber}-${suffix}`,
            voucherDate,
            amount: part.amount,
            discountAmount: 0,
            paymentMethod: String(payment.payment_method || "cash"),
            receivingBankAccountId: payment.receiving_bank_account_id || null,
            description: `Payment for ${part.saleNumber} (${fromText})`.slice(0, 500),
          });
          created.push({ id: v.id, voucher_number: v.voucher_number });
        }

        const originalUpdate: Record<string, unknown> = originalPart
          ? {
              reference_type: "sale",
              reference_id: originalPart.saleId,
              total_amount: originalPart.amount,
              description: `Payment for ${originalPart.saleNumber} (${fromText})`.slice(0, 500),
            }
          : { total_amount: plan.leftover };
        const { error: updErr } = await supabase
          .from("voucher_entries")
          .update(originalUpdate)
          .eq("id", payment.id);
        if (updErr) throw updErr;
      } catch (err) {
        for (const v of [...created].reverse()) {
          await deleteJournalEntryByReference(organizationId, "CustomerReceipt", v.id).catch(() => {});
          await supabase.from("voucher_entries").delete().eq("id", v.id);
          await deleteLedgerEntries({
            organizationId,
            voucherNo: v.voucher_number,
            voucherTypes: ["RECEIPT"],
          });
        }
        throw err;
      }

      // Account statement row of the original receipt: the new parts got their own rows
      // from the insert trigger, so the original keeps only its new amount.
      const keptAmount = originalPart ? originalPart.amount : plan.leftover;
      await (supabase as any)
        .from("customer_ledger_entries")
        .update({ credit: keptAmount })
        .eq("organization_id", organizationId)
        .eq("voucher_no", baseNumber)
        .eq("voucher_type", "RECEIPT");

      let journalWarning = false;
      try {
        if (await isAccountingEngineOnForOrg(organizationId)) {
          await deleteJournalEntryByReference(organizationId, "CustomerReceipt", payment.id);
          await repostJournalForRestoredVoucher(payment.id);
          for (const v of created) await repostJournalForRestoredVoucher(v.id);
        }
      } catch {
        journalWarning = true;
      }

      for (const part of plan.parts) {
        await applyRecomputedSalePaymentState(part.saleId, organizationId);
      }

      return { bills: plan.parts.length, leftover: plan.leftover, journalWarning };
    },
    onSuccess: (data) => {
      toast.success(
        `Payment spread over ${data.bills} bill${data.bills > 1 ? "s" : ""}` +
          (data.leftover >= 0.01 ? `; ₹${data.leftover.toLocaleString("en-IN")} stays on account` : ""),
      );
      if (data.journalWarning) {
        toast.error("Bills are updated, but the accounts entries need a Re-post (Accounts > Summary).");
      }
      invalidateAfterLink();
      onOpenChange(false);
      setSpreadMode(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const selectedInvoice = pendingInvoices?.find(inv => inv.id === selectedInvoiceId);
  const selectedOutstanding = selectedInvoice ? (selectedInvoice.net_amount - (selectedInvoice.paid_amount || 0)) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setSelectedInvoiceId(null); setSpreadMode(false); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link Payment to Invoice</DialogTitle>
          <DialogDescription>
            Reassign ₹{paymentAmount.toLocaleString("en-IN")} from {customerName}'s opening balance to a pending invoice.
          </DialogDescription>
        </DialogHeader>

        {!isLoading && !!pendingInvoices?.length && (
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={spreadMode ? "outline" : "default"}
              onClick={() => setSpreadMode(false)}
            >
              One bill
            </Button>
            <Button
              type="button"
              size="sm"
              variant={spreadMode ? "default" : "outline"}
              onClick={() => { setSpreadMode(true); setSelectedInvoiceId(null); }}
            >
              Spread over bills (oldest first)
            </Button>
          </div>
        )}

        {spreadMode && !isLoading && !!pendingInvoices?.length ? (
          <div className="space-y-2">
            {paymentDiscount > 0 && (
              <p className="text-sm text-destructive">
                This receipt has a discount, so it can only be linked to one bill.
              </p>
            )}
            <div className="max-h-64 overflow-y-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Outstanding</TableHead>
                    <TableHead>Gets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spreadPlan.parts.map((part) => {
                    const inv = pendingInvoices.find((i) => i.id === part.saleId);
                    return (
                      <TableRow key={part.saleId}>
                        <TableCell className="font-medium">{part.saleNumber}</TableCell>
                        <TableCell>{inv?.sale_date ? format(new Date(inv.sale_date), "dd/MM/yyyy") : "-"}</TableCell>
                        <TableCell>₹{Math.round(inv ? billOutstanding(inv) : 0).toLocaleString("en-IN")}</TableCell>
                        <TableCell className="font-medium text-primary">₹{part.amount.toLocaleString("en-IN")}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {spreadPlan.leftover >= 0.01 && (
              <p className="text-sm text-muted-foreground">
                ₹{spreadPlan.leftover.toLocaleString("en-IN")} is more than the open bills and stays on account.
              </p>
            )}
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted-foreground py-4">Loading invoices...</p>
        ) : !pendingInvoices?.length ? (
          <p className="text-sm text-muted-foreground py-4">No pending invoices found for this customer.</p>
        ) : (
          <div className="max-h-64 overflow-y-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead></TableHead>
                  <TableHead>Invoice No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingInvoices.map((inv) => {
                  const outstanding = inv.net_amount - (inv.paid_amount || 0);
                  const isSelected = selectedInvoiceId === inv.id;
                  const exceedsOutstanding = paymentAmount > outstanding;
                  return (
                    <TableRow
                      key={inv.id}
                      className={cn(
                        "cursor-pointer transition-colors",
                        isSelected && "bg-primary/10",
                        exceedsOutstanding && "opacity-50"
                      )}
                      onClick={() => !exceedsOutstanding && setSelectedInvoiceId(isSelected ? null : inv.id)}
                    >
                      <TableCell>
                        <input
                          type="radio"
                          checked={isSelected}
                          readOnly
                          disabled={exceedsOutstanding}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell className="font-medium">{inv.sale_number}</TableCell>
                      <TableCell>{inv.sale_date ? format(new Date(inv.sale_date), "dd/MM/yyyy") : "-"}</TableCell>
                      <TableCell>₹{Math.round(inv.net_amount).toLocaleString("en-IN")}</TableCell>
                      <TableCell>₹{Math.round(inv.paid_amount || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Badge variant={exceedsOutstanding ? "secondary" : "destructive"}>
                          ₹{Math.round(outstanding).toLocaleString("en-IN")}
                        </Badge>
                        {exceedsOutstanding && (
                          <span className="text-xs text-muted-foreground ml-1">
                            (payment exceeds)
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!spreadMode && selectedInvoiceId && (
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-md text-sm space-y-1">
            <div className="flex justify-between">
              <span>Payment Amount:</span>
              <span className="font-medium">₹{paymentAmount.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between">
              <span>Invoice Outstanding:</span>
              <span className="font-medium">₹{Math.round(selectedOutstanding).toLocaleString("en-IN")}</span>
            </div>
            <div className="flex justify-between font-medium text-primary">
              <span>Remaining After:</span>
              <span>₹{Math.round(selectedOutstanding - paymentAmount).toLocaleString("en-IN")}</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {spreadMode ? (
            <LoadingButton
              loading={spreadMutation.isPending}
              disabled={!spreadPlan.parts.length || paymentDiscount > 0}
              onClick={() => spreadMutation.mutate()}
            >
              Spread Payment
            </LoadingButton>
          ) : (
            <LoadingButton
              loading={reassignMutation.isPending}
              disabled={!selectedInvoiceId}
              onClick={() => reassignMutation.mutate()}
            >
              Reassign Payment
            </LoadingButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
